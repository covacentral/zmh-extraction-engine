import type { Metadata } from 'next';
import { resolveCommerce } from '../../lib/commerceResolver';
import CommerceHeadSync from './CommerceHeadSync';

const RENDER_API = process.env.NEXT_PUBLIC_RENDER_API || '';

function getVersionToken(avatarJid: string, updatedAt: any): string {
  let ts = '';
  if (updatedAt) {
    if (typeof updatedAt === 'number' || typeof updatedAt === 'string') {
      ts = String(updatedAt);
    } else if (typeof updatedAt?.toMillis === 'function') {
      ts = String(updatedAt.toMillis());
    } else if (typeof updatedAt?._seconds === 'number') {
      ts = String(updatedAt._seconds);
    }
  }
  const raw = `${avatarJid}|${ts}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `b2-${Math.abs(hash).toString(36)}`;
}

function buildCommerceIconUrl(data: any): string {
  const avatarJid = typeof data?.avatarJid === 'string' ? data.avatarJid.trim() : '';
  const fallbackName = typeof data?.businessName === 'string' ? data.businessName.trim() : 'store';
  const target = avatarJid || fallbackName;
  const version = getVersionToken(target, data?.avatarUpdatedAt || data?.updatedAt);
  return `${RENDER_API}/api/avatar/${encodeURIComponent(target)}?v=${version}`;
}

export async function generateMetadata({
  params,
}: {
  params: { comercio: string };
}): Promise<Metadata> {
  const resolved = await resolveCommerce(params.comercio);
  if (!resolved) return {};

  const { data } = resolved;
  const businessName = (data?.businessName || params.comercio || '').trim();
  const city = (data?.city || '').trim();
  const description = city
    ? `${businessName} - ${city}. Canales oficiales, asesores y enlaces directos.`
    : `${businessName}. Canales oficiales, asesores y enlaces directos.`;
  const iconUrl = buildCommerceIconUrl(data);

  return {
    title: {
      default: businessName,
      template: `%s | ${businessName}`,
    },
    description,
    icons: {
      icon: [{ url: iconUrl }],
      shortcut: [iconUrl],
      apple: [{ url: iconUrl }],
    },
    openGraph: {
      title: businessName,
      description,
      images: [{ url: iconUrl, alt: businessName }],
    },
    twitter: {
      card: 'summary',
      title: businessName,
      description,
      images: [iconUrl],
    },
  };
}

export default async function CommerceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { comercio: string };
}) {
  const resolved = await resolveCommerce(params.comercio);
  const businessName = (resolved?.data?.businessName || '').trim();
  const iconUrl = resolved ? buildCommerceIconUrl(resolved.data) : '';

  return (
    <>
      {resolved && (
        <CommerceHeadSync businessName={businessName} iconUrl={iconUrl} />
      )}
      {children}
    </>
  );
}
