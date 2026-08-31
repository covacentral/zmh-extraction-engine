import { notFound } from 'next/navigation';
import { isValidMasterToken } from '../../../lib/superAdminAuth';
import { getAllComercios } from '../../actions/superAdminActions';
import SuperAdminClient from './SuperAdminClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: {
    masterToken: string;
  };
}

export default async function SuperAdminPage({ params }: PageProps) {
  const { masterToken } = params;

  if (!isValidMasterToken(masterToken)) {
    notFound();
  }

  let comercios: any[] = [];
  try {
    comercios = await getAllComercios(masterToken);
  } catch (e) {
    comercios = [];
  }

  return <SuperAdminClient masterToken={masterToken} initialComercios={comercios} />;
}
