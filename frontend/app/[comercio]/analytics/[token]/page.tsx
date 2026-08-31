import { notFound } from 'next/navigation';
import { db } from '../../../../lib/firebaseAdmin';
import { resolveCommerce } from '../../../../lib/commerceResolver';
import DashboardClient from './DashboardClient';

export const revalidate = 60; // ISR cache: Revalidate every 60 seconds max. Protects against spam refresh.

export default async function AnalyticsPage({ params }: { params: { comercio: string, token: string } }) {
  const { comercio, token } = params;

  if (!comercio || !token) return notFound();
  if (!db) return notFound(); // Firebase Admin not initialized

  // Validate Token against Commerce Document (slug or alias)
  const resolved = await resolveCommerce(comercio);
  if (!resolved) return notFound();

  const { commerceId, data } = resolved;
  
  // Security check: Must have premiumMetrics enabled and metricsToken must match
  if (!data.premiumMetrics || data.metricsToken !== token) {
      return notFound();
  }

  const themeHex = data.themeHex || '#25D366';
  const businessName = data.businessName || 'Panel de Métricas';

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <DashboardClient commerceId={commerceId} authToken={token} businessName={businessName} themeHex={themeHex} />
    </main>
  );
}
