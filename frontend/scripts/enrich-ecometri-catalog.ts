import fs from 'node:fs';
import path from 'node:path';
import { createHttpGeminiClient } from '../lib/ecometri/geminiClient';
import {
  createRateLimiter,
  DEFAULT_ENRICH_RPM,
  MAX_ENRICH_BATCH_SIZE,
} from '../lib/ecometri/semantic/enrichBatch';
import { FirestoreSemanticStore } from '../lib/ecometri/semantic/firestoreStore';
import { InMemorySemanticStore } from '../lib/ecometri/semantic/shards';
import {
  fetchLiveCatalogForSync,
  runCatalogEnrichmentSync,
} from '../lib/ecometri/semantic/syncCore';
import type { EcometriConfig } from '../lib/ecometri/types';
import type { SemanticItem } from '../lib/ecometri/semantic/types';

interface CliArgs {
  commerce: string;
  dryRun: boolean;
  storeBaseUrl?: string;
  allowedImageHost?: string;
}

function parseArgs(argv: string[]): CliArgs {
  let commerce = '';
  let dryRun = false;
  let storeBaseUrl: string | undefined;
  let allowedImageHost: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--commerce' && argv[i + 1]) {
      commerce = argv[++i].trim();
    } else if (arg.startsWith('--commerce=')) {
      commerce = arg.slice('--commerce='.length).trim();
    } else if (arg === '--store-base-url' && argv[i + 1]) {
      storeBaseUrl = argv[++i].trim();
    } else if (arg === '--allowed-image-host' && argv[i + 1]) {
      allowedImageHost = argv[++i].trim();
    }
  }

  if (!commerce) {
    throw new Error(
      'Usage: npx tsx scripts/enrich-ecometri-catalog.ts --commerce <slugOrId> [--dry-run] [--store-base-url <url>] [--allowed-image-host <host>]'
    );
  }

  return { commerce, dryRun, storeBaseUrl, allowedImageHost };
}

function getCheckpointFilePath(commerceKey: string): string {
  const safeKey = commerceKey.replace(/[^a-z0-9_-]/gi, '_');
  const dir = path.resolve(process.cwd(), '..', '.checkpoints');
  return path.join(dir, `semantic_${safeKey}.json`);
}

function readCheckpoint(filePath: string): SemanticItem[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(raw?.items) ? (raw.items as SemanticItem[]) : [];
  } catch {
    return [];
  }
}

function writeCheckpoint(filePath: string, items: SemanticItem[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(
    tmpPath,
    JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2),
    'utf8'
  );
  fs.renameSync(tmpPath, filePath);
}

async function resolveConfigForCli(args: CliArgs): Promise<{
  commerceId: string;
  cfg: EcometriConfig;
  hasFirestore: boolean;
}> {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const { resolveCommerce } = await import('../lib/commerceResolver');
      const resolved = await resolveCommerce(args.commerce);
      if (resolved?.data?.ecometri) {
        return {
          commerceId: resolved.commerceId,
          cfg: resolved.data.ecometri,
          hasFirestore: true,
        };
      }
    } catch {
      // Fall through to explicit CLI flags when firebase-admin is unavailable locally
    }
  }

  if (args.dryRun && args.storeBaseUrl && args.allowedImageHost) {
    return {
      commerceId: args.commerce,
      cfg: {
        enabled: true,
        storeId: 'dry-run',
        storeBaseUrl: args.storeBaseUrl,
        allowedImageHost: args.allowedImageHost,
      },
      hasFirestore: false,
    };
  }

  throw new Error(
    `Could not resolve commerce "${args.commerce}" from Firestore. Set FIREBASE_SERVICE_ACCOUNT or pass --store-base-url and --allowed-image-host with --dry-run.`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { commerceId, cfg, hasFirestore } = await resolveConfigForCli(args);
  const checkpointPath = getCheckpointFilePath(commerceId);
  const checkpointItems = readCheckpoint(checkpointPath);

  console.log(
    `[enrich-ecometri-catalog] commerce=${commerceId} mode=${args.dryRun ? 'DRY-RUN' : 'LIVE'} checkpointItems=${checkpointItems.length}`
  );

  const liveProducts = await fetchLiveCatalogForSync(cfg);
  const store = hasFirestore
    ? new FirestoreSemanticStore(commerceId)
    : new InMemorySemanticStore();

  if (args.dryRun) {
    const summary = await runCatalogEnrichmentSync({
      cfg,
      liveProducts,
      store,
      checkpointItems,
      batchSize: MAX_ENRICH_BATCH_SIZE,
      dryRun: true,
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required when running without --dry-run.');
  }

  const ownerId = `cli-${process.pid}-${Date.now()}`;
  const locked = await store.acquireLock(
    ownerId,
    15 * 60_000,
    new Date().toISOString()
  );
  if (!locked) {
    throw new Error(`Lock is currently held on semantic_index/meta for ${commerceId}.`);
  }

  try {
    const geminiClient = createHttpGeminiClient(apiKey);
    const limiter = createRateLimiter(DEFAULT_ENRICH_RPM);
    const summary = await runCatalogEnrichmentSync({
      cfg,
      liveProducts,
      store,
      geminiClient,
      limiter,
      checkpointItems,
      batchSize: MAX_ENRICH_BATCH_SIZE,
      dryRun: false,
      onCheckpoint: (items) => {
        writeCheckpoint(checkpointPath, items);
      },
    });

    if (summary.backlog === 0 && fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await store.releaseLock(ownerId);
  }
}

main().catch((err) => {
  console.error('[enrich-ecometri-catalog] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
