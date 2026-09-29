'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cache, TTL } from './cache';

interface UseCacheOptions {
  ttl?: number;
  revalidateOnFocus?: boolean;
  /** If false, won't fetch until set to true (useful for conditional fetching) */
  enabled?: boolean;
}

interface UseCacheResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** True when data is from cache and a background refresh is in progress */
  revalidating: boolean;
}

/**
 * SWR-style hook with stale-while-revalidate.
 *
 * Usage:
 *   const { data, loading } = useCache('dashboard', () => api.getStudentDashboard(), TTL.DASHBOARD);
 *
 * - Shows cached data INSTANTLY on mount (no loading flash)
 * - Revalidates in background when stale
 * - Deduplicates identical in-flight requests
 */
export function useCache<T>(
  key: string | null,
  fetcher: () => Promise<{ data: T } | T>,
  ttlOrOptions: number | UseCacheOptions = TTL.DASHBOARD,
): UseCacheResult<T> {
  const options: UseCacheOptions = typeof ttlOrOptions === 'number'
    ? { ttl: ttlOrOptions }
    : ttlOrOptions;
  const ttl = options.ttl ?? TTL.DASHBOARD;
  const enabled = options.enabled !== false;
  const revalidateOnFocus = options.revalidateOnFocus !== false;

  // Initialise from cache immediately — no loading flash
  const [data, setData] = useState<T | null>(() => key ? cache.get<T>(key) : null);
  const [loading, setLoading] = useState<boolean>(() => {
    if (!key || !enabled) return false;
    return cache.get(key) === null; // only show loading if no cached data
  });
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async (isBackground = false) => {
    if (!key || !enabled) return;

    const cached = cache.get<T>(key);

    if (isBackground) {
      setRevalidating(true);
    } else if (!cached) {
      setLoading(true);
    }

    try {
      const raw = await cache.fetch<{ data: T } | T>(key, fetcher, ttl);
      // Unwrap { data: T } if needed (matches our api.ts pattern)
      const result = (raw && typeof raw === 'object' && 'data' in (raw as object))
        ? (raw as { data: T }).data
        : (raw as T);

      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load';
      if (mountedRef.current) {
        setError(msg);
        // Don't clear existing data on error
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRevalidating(false);
      }
    }
  }, [key, fetcher, ttl, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!key || !enabled) return;

    const cached = cache.get<T>(key);
    if (cached !== null) {
      setData(cached);
      // Stale? Revalidate in background
      if (cache.isStale(key)) {
        doFetch(true);
      }
    } else {
      doFetch(false);
    }
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revalidate on window focus (like SWR)
  useEffect(() => {
    if (!revalidateOnFocus || !key || !enabled) return;
    const onFocus = () => {
      if (cache.isStale(key)) doFetch(true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [key, enabled, revalidateOnFocus, doFetch]);

  const refresh = useCallback(async () => {
    if (!key) return;
    cache.invalidate(key);
    await doFetch(false);
  }, [key, doFetch]);

  return { data, loading, error, refresh, revalidating };
}

/**
 * Prefetch data into the cache before navigating.
 * Call on hover/focus of nav links.
 */
export function prefetch<T>(key: string, fetcher: () => Promise<T>, ttl: number): void {
  if (cache.get(key) !== null && !cache.isStale(key)) return; // already fresh
  cache.fetch(key, fetcher, ttl).catch(() => { /* ignore prefetch errors */ });
}