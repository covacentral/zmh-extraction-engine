'use client';

import { useEffect } from 'react';

interface CommerceHeadSyncProps {
  businessName: string;
  iconUrl: string;
  appleIconUrl?: string;
}

/**
 * Forces browsers that previously cached the legacy "Zero-Management Hub" title
 * or "ZH" / square fallback favicon to replace them with this commerce's circular brand icon.
 */
export default function CommerceHeadSync({ businessName, iconUrl, appleIconUrl }: CommerceHeadSyncProps) {
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
    const hasMatchingApple = !appleIconUrl || existingLinks.some(
      (el) => el.rel === 'apple-touch-icon' && el.getAttribute('href') === appleIconUrl
    );

    if (hasMatchingIcon && hasMatchingApple && existingLinks.length <= 3) {
      return;
    }

    existingLinks.forEach((el) => el.parentNode?.removeChild(el));

    ['icon', 'shortcut icon'].forEach((rel) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.type = 'image/svg+xml';
      link.href = iconUrl;
      document.head.appendChild(link);
    });

    if (appleIconUrl) {
      const appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      appleLink.href = appleIconUrl;
      document.head.appendChild(appleLink);
    }
  }, [businessName, iconUrl, appleIconUrl]);

  return null;
}
