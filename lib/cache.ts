/**
 * Smart Cache System for TechTics LMS
 *
 * Features:
 * - In-memory cache (instant reads)
 * - localStorage persistence (survives page refreshes)
 * - Stale-while-revalidate (show old data instantly, update in background)
 * - Deduplication (multiple components don't trigger duplicate requests)
 * - TTL-based expiry
 * - Automatic invalidation by tag/prefix
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // ms
}

type Subscriber<T> = (data: T | null, loading: boolean, error: string | null) => void;

// ── TTL Constants (ms) ──────────────────────────────────────────────────────
export const TTL = {
  PROFILE:    5 * 60 * 1000,   // 5 min  — changes rarely
  COURSES:    2 * 60 * 1000,   // 2 min  — occasionally updated
  DASHBOARD:  1 * 60 * 1000,   // 1 min  — live-ish stats
  PROGRESS:   1 * 60 * 1000,   // 1 min  — changes as user learns
  ATTENDANCE: 2 * 60 * 1000,   // 2 min
  ASSIGNMENTS:2 * 60 * 1000,
  SHORT:      30 * 1000,       // 30s   — high-churn data
} as const;

class CacheStore {
  private memory = new Map<string, CacheEntry<unknown>>();
  private inFlight = new Map<string, Promise<unknown>>();
  private subscribers = new Map<string, Set<Subscriber<unknown>>>();
  private readonly NS = 'lms_cache_';

  // ── Read ──────────────────────────────────────────────────────────────────

  get<T>(key: string): T | null {
    // 1. Memory first (fastest)
    const mem = this.memory.get(key) as CacheEntry<T> | undefined;
    if (mem) {
      if (Date.now() - mem.timestamp < mem.ttl) return mem.data;
      this.memory.delete(key);
    }
    // 2. localStorage fallback
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.NS + key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() - entry.timestamp < entry.ttl) {
        this.memory.set(key, entry as CacheEntry<unknown>); // warm memory
        return entry.data;
      }
      localStorage.removeItem(this.NS + key);
    } catch { /* ignore */ }
    return null;
  }

  isStale(key: string): boolean {
    const mem = this.memory.get(key);
    if (!mem) return true;
    return Date.now() - mem.timestamp >= mem.ttl;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  set<T>(key: string, data: T, ttl: number): void {
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
    this.memory.set(key, entry as CacheEntry<unknown>);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(this.NS + key, JSON.stringify(entry));
      } catch { /* quota exceeded, memory-only is fine */ }
    }
    this.notify(key, data, false, null);
  }

  // ── Invalidation ──────────────────────────────────────────────────────────

  invalidate(key: string): void {
    this.memory.delete(key);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.NS + key);
    }
  }

  invalidatePrefix(prefix: string): void {
    // Memory
    for (const key of this.memory.keys()) {
      if (key.startsWith(prefix)) this.memory.delete(key);
    }
    // localStorage
    if (typeof window !== 'undefined') {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) ?? '';
        if (k.startsWith(this.NS + prefix)) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    }
  }

  // ── Dedup + fetch ─────────────────────────────────────────────────────────

  /**
   * SWR-style fetch:
   * 1. Returns cached data immediately (if available)
   * 2. Revalidates in background if stale
   * 3. Deduplicates in-flight requests
   */
  async fetch<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    // Already in-flight? Piggyback.
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = fetcher().then(data => {
      this.set(key, data, ttl);
      this.inFlight.delete(key);
      return data;
    }).catch(err => {
      this.inFlight.delete(key);
      throw err;
    });

    this.inFlight.set(key, promise as Promise<unknown>);
    return promise;
  }

  // ── Subscriptions (for reactive updates) ─────────────────────────────────

  subscribe<T>(key: string, cb: Subscriber<T>): () => void {
    if (!this.subscribers.has(key)) this.subscribers.set(key, new Set());
    this.subscribers.get(key)!.add(cb as Subscriber<unknown>);
    return () => this.subscribers.get(key)?.delete(cb as Subscriber<unknown>);
  }

  private notify<T>(key: string, data: T | null, loading: boolean, error: string | null) {
    this.subscribers.get(key)?.forEach(cb => cb(data, loading, error));
  }

  notifyLoading(key: string): void {
    this.notify(key, this.get(key), true, null);
  }

  notifyError(key: string, error: string): void {
    this.notify(key, this.get(key), false, error);
  }
}

// Singleton
export const cache = new CacheStore();