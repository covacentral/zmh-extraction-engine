import { notFound } from 'next/navigation';
import { db } from '../../../../lib/firebaseAdmin';
import DashboardClient from './DashboardClient';

export const revalidate = 60; // ISR cache: Revalidate every 60 seconds max. Protects against spam refresh.

export default async function AnalyticsPage({ params }: { params: { comercio: string, token: string } }) {
  const { comercio, token } = params;

  if (!comercio || !token) return notFound();

  // Validate Token against Commerce Document
  const doc = await db.collection('comercios').doc(comercio).get();
  if (!doc.exists) return notFound();

  const data = doc.data() || {};
  
  // Security check: Must have premiumMetrics enabled and metricsToken must match
  if (!data.premiumMetrics || data.metricsToken !== token) {
      return notFound();
  }

  const themeHex = data.themeHex || '#25D366';
  const businessName = data.businessName || 'Panel de Métricas';

  // We pass the commerce ID to the client, the client will fetch the actual stats.
  // We use ISR here just for the shell, but the client will fetch the data to allow date filtering.
  // However, to optimize even further and protect against spam, the client can use Firebase Client SDK 
  // which handles its own local cache, or we can fetch the initial 30 days here on the server.
  // For maximum flexibility with dates, we'll let the Client component handle the query.

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <DashboardClient commerceId={comercio} businessName={businessName} themeHex={themeHex} />
    </main>
  );
}
