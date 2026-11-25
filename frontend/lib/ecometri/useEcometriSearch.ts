'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EcometriSearchResponse, ProductDTO } from './types';

export type EcometriSearchStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface UseEcometriSearchResult {
  items: ProductDTO[];
  total: number;
  page: number;
  hasMore: boolean;
  status: EcometriSearchStatus;
  isLoadingMore: boolean;
  error?: string;
  loadMore: () => void;
}

const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;

export function useEcometriSearch(
  commerceId: string,
  term: string,
  enabled: boolean = true
): UseEcometriSearchResult {
  const [items, setItems] = useState<ProductDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<EcometriSearchStatus>('idle');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);
  const activeTermRef = useRef<string>('');
  const loadingMoreRef = useRef<boolean>(false);

  const fetchPage = useCallback(
    async (targetTerm: string, targetPage: number, append: boolean) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) {
        loadingMoreRef.current = true;
        setIsLoadingMore(true);
      } else {
        setStatus('loading');
        setError(undefined);
      }

      try {
        const url = `/api/ecometri-search?c=${encodeURIComponent(
          commerceId
        )}&term=${encodeURIComponent(targetTerm)}&page=${targetPage}`;

        const resp = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!resp.ok) {
          throw new Error(`HTTP_${resp.status}`);
        }

        const data = (await resp.json()) as EcometriSearchResponse;
        if (controller.signal.aborted || activeTermRef.current !== targetTerm) {
          return;
        }

        const incoming = Array.isArray(data.items) ? data.items : [];

        setItems((prev) => {
          if (!append) return incoming;
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const item of incoming) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          return merged;
        });

        setTotal(typeof data.total === 'number' ? data.total : incoming.length);
        setPage(typeof data.page === 'number' ? data.page : targetPage);
        setHasMore(Boolean(data.hasMore));
        setStatus('ok');
        setError(undefined);
      } catch (err: unknown) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        if (!append) {
          setItems([]);
          setTotal(0);
          setHasMore(false);
          setStatus('error');
        }
        setError('Resultados en vivo no disponibles temporalmente.');
      } finally {
        if (append) {
          loadingMoreRef.current = false;
          setIsLoadingMore(false);
        }
      }
    },
    [commerceId]
  );

  useEffect(() => {
    const clean = term.trim();
    activeTermRef.current = clean;

    if (!enabled || !commerceId || clean.length < MIN_CHARS) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      loadingMoreRef.current = false;
      setItems([]);
      setTotal(0);
      setPage(1);
      setHasMore(false);
      setIsLoadingMore(false);
      setStatus('idle');
      setError(undefined);
      return;
    }

    const timer = setTimeout(() => {
      setPage(1);
      setHasMore(false);
      void fetchPage(clean, 1, false);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [commerceId, term, enabled, fetchPage]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const loadMore = useCallback(() => {
    const clean = activeTermRef.current;
    if (
      !enabled ||
      !hasMore ||
      status !== 'ok' ||
      loadingMoreRef.current ||
      clean.length < MIN_CHARS
    ) {
      return;
    }
    void fetchPage(clean, page + 1, true);
  }, [enabled, hasMore, status, page, fetchPage]);

  return {
    items,
    total,
    page,
    hasMore,
    status,
    isLoadingMore,
    error,
    loadMore,
  };
}
