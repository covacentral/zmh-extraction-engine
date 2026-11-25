'use client';

import { useEffect, useRef, useState } from 'react';
import { compressImageToJpegBase64 } from '../../lib/ecometri/compressImage';
import type {
  ProductDTO,
  VisualSearchDegraded,
  VisualSearchQuota,
  VisualSearchResponse,
} from '../../lib/ecometri/types';

export interface VisualSearchUiState {
  status: 'idle' | 'identifying' | 'comparing' | 'ok' | 'error';
  previewDataUrl: string | null;
  items: ProductDTO[];
  detectedLabel: string;
  chips: string[];
  degraded: VisualSearchDegraded;
  quota?: VisualSearchQuota;
  error?: string;
}

const DEVICE_ID_STORAGE_KEY = 'zmh:vsearch:did';

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return '';
  }
}

interface VisualSearchTriggerProps {
  commerceId: string;
  onStateChange: (state: VisualSearchUiState) => void;
}

const COOLDOWN_MS = 10_000;

const CameraIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export default function VisualSearchTrigger({
  commerceId,
  onStateChange,
}: VisualSearchTriggerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSubmitRef = useRef<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const now = Date.now();
    const elapsed = now - lastSubmitRef.current;
    if (elapsed < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      onStateChange({
        status: 'error',
        previewDataUrl: null,
        items: [],
        detectedLabel: '',
        chips: [],
        degraded: 'none',
        error: `Espera ${waitSec}s antes de subir otra foto.`,
      });
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    let stageTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      const { base64, previewDataUrl } = await compressImageToJpegBase64(file);
      lastSubmitRef.current = Date.now();

      onStateChange({
        status: 'identifying',
        previewDataUrl,
        items: [],
        detectedLabel: '',
        chips: [],
        degraded: 'none',
      });

      stageTimer = setTimeout(() => {
        if (!controller.signal.aborted) {
          onStateChange({
            status: 'comparing',
            previewDataUrl,
            items: [],
            detectedLabel: '',
            chips: [],
            degraded: 'none',
          });
        }
      }, 1500);

      const deviceId = getOrCreateDeviceId();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (deviceId) {
        headers['X-Device-Id'] = deviceId;
      }

      const resp = await fetch('/api/ecometri-visual-search', {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          commerceId,
          imageBase64: base64,
          mimeType: 'image/jpeg',
        }),
      });

      if (stageTimer) clearTimeout(stageTimer);

      const payload = (await resp.json().catch(() => null)) as
        | (VisualSearchResponse & { error?: string })
        | null;

      if (controller.signal.aborted) return;

      if (!resp.ok) {
        onStateChange({
          status: 'error',
          previewDataUrl,
          items: [],
          detectedLabel: '',
          chips: [],
          degraded: payload?.degraded || 'paused',
          quota: payload?.quota,
          error:
            payload?.error ||
            'Buscador por foto en pausa temporal, usa la busqueda por texto.',
        });
        return;
      }

      onStateChange({
        status: 'ok',
        previewDataUrl,
        items: Array.isArray(payload?.items) ? payload.items : [],
        detectedLabel: payload?.detected?.label || '',
        chips: Array.isArray(payload?.detected?.chips) ? payload.detected.chips : [],
        degraded: payload?.degraded || 'none',
        quota: payload?.quota,
      });
    } catch (err: unknown) {
      if (stageTimer) clearTimeout(stageTimer);
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return;
      }
      onStateChange({
        status: 'error',
        previewDataUrl: null,
        items: [],
        detectedLabel: '',
        chips: [],
        degraded: 'paused',
        error:
          err instanceof Error && err.message
            ? err.message
            : 'No pudimos procesar la foto. Usa la busqueda por texto.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-label="Buscar producto por foto"
        title="Buscar por foto"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/65 transition-colors duration-150 hover:border-white/25 hover:bg-white/10 hover:text-white disabled:opacity-40"
      >
        <CameraIcon />
      </button>
    </>
  );
}
