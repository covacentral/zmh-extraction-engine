import { notFound } from 'next/navigation';
import { isValidMasterToken } from '../../../../lib/superAdminAuth';
import { getAllComercios } from '../../../actions/superAdminActions';
import SuperAdminClient from '../../../management/[masterToken]/SuperAdminClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: {
    comercio: string;
    masterToken: string;
  };
}

export default async function CommerceSuperAdminPage({ params }: PageProps) {
  const { comercio, masterToken } = params;

  if (!isValidMasterToken(masterToken)) {
    notFound();
  }

  let comercios: any[] = [];
  try {
    comercios = await getAllComercios(masterToken);
  } catch (e) {
    comercios = [];
  }

  // Place the selected commerce first if it exists
  const sortedComercios = [...comercios].sort((a, b) => (a.id === comercio ? -1 : b.id === comercio ? 1 : 0));

  return <SuperAdminClient masterToken={masterToken} initialComercios={sortedComercios} />;
}
