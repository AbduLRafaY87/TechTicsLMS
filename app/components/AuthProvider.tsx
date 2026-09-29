'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api, UserRole } from '../../lib/api';
import { cache, TTL } from '../../lib/cache';

// ── Cache key ─────────────────────────────────────────────────────────────────
const AUTH_CACHE_KEY = (id: string) => `auth:me:${id}`;
const AUTH_TOKEN_KEY = 'auth:current_user';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  bio?: string;
  phone?: string;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ── Helper: resolve avatar URL ────────────────────────────────────────────────
// The backend may return a relative path like /uploads/avatar.jpg
// We need to prepend the backend base URL in that case.
function resolveAvatarUrl(avatar?: string | null): string | undefined {
  if (!avatar) return undefined;
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? '';
  return `${base}${avatar}`;
}

function normalizeUser(raw: any): AuthUser {
  return {
    ...raw,
    avatar: resolveAvatarUrl(raw?.avatar),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Try to hydrate from cache immediately — no loading flash for returning users
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') return null;
    const cached = cache.get<AuthUser>(AUTH_TOKEN_KEY);
    return cached ?? null;
  });
  const [loading, setLoading] = useState(() => {
    // If we have a token but no cached user, we need to fetch
    if (typeof window === 'undefined') return false;
    const token = localStorage.getItem('token');
    const cached = cache.get<AuthUser>(AUTH_TOKEN_KEY);
    return !!token && !cached;
  });

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setLoading(false);
      return;
    }

    // Already hydrated from cache — check if stale
    const cached = cache.get<AuthUser>(AUTH_TOKEN_KEY);
    if (cached && !cache.isStale(AUTH_TOKEN_KEY)) {
      setUser(cached);
      setLoading(false);
      return;
    }

    // Fetch fresh user data
    api.me()
      .then((res: any) => {
        const raw = res.data?.user ?? res.data?.data?.user ?? res.data;
        if (!raw) throw new Error('No user in response');
        const userData = normalizeUser(raw);
        cache.set(AUTH_TOKEN_KEY, userData, TTL.PROFILE);
        if (userData.id) {
          cache.set(AUTH_CACHE_KEY(userData.id), userData, TTL.PROFILE);
        }
        setUser(userData);
      })
      .catch(() => {
        localStorage.removeItem('token');
        cache.invalidate(AUTH_TOKEN_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    setUser(null);
    cache.invalidate(AUTH_TOKEN_KEY);
    const res: any = await api.login(email, password);
    const { user: newUser, token } = res.data?.data ?? res.data;
    localStorage.setItem('token', token);
    const userData = normalizeUser(newUser);
    cache.set(AUTH_TOKEN_KEY, userData, TTL.PROFILE);
    cache.set(AUTH_CACHE_KEY(userData.id), userData, TTL.PROFILE);
    setUser(userData);
    return userData;
  }, []);

  const register = useCallback(async (
    name: string,
    email: string,
    password: string,
    role: UserRole,
  ): Promise<void> => {
    setUser(null);
    cache.invalidate(AUTH_TOKEN_KEY);
    const res: any = await api.register(name, email, password, role);
    const { user: newUser, token } = res.data?.data ?? res.data;
    localStorage.setItem('token', token);
    const userData = normalizeUser(newUser);
    cache.set(AUTH_TOKEN_KEY, userData, TTL.PROFILE);
    cache.set(AUTH_CACHE_KEY(userData.id), userData, TTL.PROFILE);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    // Clear all user-related cache
    cache.invalidate(AUTH_TOKEN_KEY);
    if (user?.id) {
      cache.invalidatePrefix(`auth:me:${user.id}`);
      cache.invalidatePrefix(`profile:${user.id}`);
      cache.invalidatePrefix(`dashboard:${user.id}`);
      cache.invalidatePrefix(`progress:${user.id}`);
      cache.invalidatePrefix(`attendance:${user.id}`);
      cache.invalidatePrefix(`assignments:${user.id}`);
      cache.invalidatePrefix(`discussions:${user.id}`);
      cache.invalidatePrefix(`teacher:`);
    }
    setUser(null);
  }, [user?.id]);

  const refreshUser = useCallback(async () => {
    try {
      const res: any = await api.me();
      const raw = res.data?.user ?? res.data?.data?.user ?? res.data;
      if (!raw) throw new Error('No user');
      const userData = normalizeUser(raw);
      cache.set(AUTH_TOKEN_KEY, userData, TTL.PROFILE);
      if (userData.id) {
        cache.set(AUTH_CACHE_KEY(userData.id), userData, TTL.PROFILE);
      }
      setUser(userData);
    } catch {
      logout();
    }
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}