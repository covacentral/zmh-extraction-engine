'use client';

import { useEffect } from 'react';

interface CommerceHeadSyncProps {
  businessName: string;
  iconUrl: string;
}

/**
 * Forces browsers that previously cached the legacy "Zero-Management Hub" title
 * or "ZH" fallback favicon to replace them with this commerce's brand identity.
 */
export default function CommerceHeadSync({ businessName, iconUrl }: CommerceHeadSyncProps) {
  useEffect(() => {
    if (businessName && (!document.title || /zero-management/i.test(document.title))) {
      document.title = businessName;
    }

    if (!iconUrl) return;

    const existingLinks = Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
      )
    );

    const hasMatchingIcon = existingLinks.some(
      (el) => el.rel === 'icon' && el.getAttribute('href') === iconUrl
    );

    if (hasMatchingIcon && existingLinks.every((el) => el.getAttribute('href') === iconUrl)) {
      return;
    }

    existingLinks.forEach((el) => el.parentNode?.removeChild(el));

    const rels = ['icon', 'shortcut icon', 'apple-touch-icon'];
    rels.forEach((rel) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = iconUrl;
      document.head.appendChild(link);
    });
  }, [businessName, iconUrl]);

  return null;
}
