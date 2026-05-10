/**
 * Plan Gate — Server-side feature gating.
 * Reads the commerce's active plan from Firestore and checks if the requested feature is available.
 * Import and call this at the top of any protected page/action.
 */

import { db } from './firebaseAdmin';

export type Plan =
  | 'vitrina'
  | 'catalogo_wa'
  | 'pos_express'
  | 'pims_basico'
  | 'pims_estandar'
  | 'pims_premium';

export type Feature =
  | 'landing'
  | 'catalogo_wa'
  | 'pos'
  | 'pims'
  | 'analytics'
  | 'vip_clients'
  | 'dropshippers';

// Feature matrix: which features each plan unlocks
const PLAN_FEATURES: Record<Plan, Feature[]> = {
  vitrina:        ['landing'],
  catalogo_wa:    ['landing', 'catalogo_wa'],
  pos_express:    ['landing', 'catalogo_wa', 'pos'],
  pims_basico:    ['landing', 'catalogo_wa', 'pos', 'pims'],
  pims_estandar:  ['landing', 'catalogo_wa', 'pos', 'pims', 'analytics', 'vip_clients'],
  pims_premium:   ['landing', 'catalogo_wa', 'pos', 'pims', 'analytics', 'vip_clients', 'dropshippers'],
};

/**
 * Checks if a commerce has access to a specific feature.
 * Returns true if access is granted.
 * Returns false if plan is missing, expired, or doesn't include the feature.
 * 
 * IMPORTANT: If the commerce has no 'plan' field set (legacy/pre-gating),
 * it defaults to 'pims_premium' to avoid breaking existing clients during migration.
 */
export async function hasFeature(commerceId: string, feature: Feature): Promise<boolean> {
  if (!db) return false;

  try {
    const doc = await db.collection('comercios').doc(commerceId).get();
    if (!doc.exists) return false;

    const data = doc.data()!;

    // Grace period: legacy clients without a plan field get full access
    const plan: Plan = data.plan ?? 'pims_premium';

    // Check subscription expiry (optional field: subscriptionExpiry: ISO string)
    if (data.subscriptionExpiry) {
      const expiry = new Date(data.subscriptionExpiry);
      if (expiry < new Date()) {
        console.warn(`[PlanGate] Commerce ${commerceId} subscription expired on ${data.subscriptionExpiry}`);
        // On expiry, downgrade to vitrina (landing only)
        return PLAN_FEATURES['vitrina'].includes(feature);
      }
    }

    return PLAN_FEATURES[plan]?.includes(feature) ?? false;
  } catch (e) {
    console.error('[PlanGate] Error checking feature access:', e);
    return false; // Fail closed
  }
}

/**
 * Returns the active plan for a commerce.
 * Defaults to 'pims_premium' for legacy clients without a plan field.
 */
export async function getCommercePlan(commerceId: string): Promise<Plan | null> {
  if (!db) return null;
  try {
    const doc = await db.collection('comercios').doc(commerceId).get();
    if (!doc.exists) return null;
    return (doc.data()?.plan as Plan) ?? 'pims_premium';
  } catch {
    return null;
  }
}
