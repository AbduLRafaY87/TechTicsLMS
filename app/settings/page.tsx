'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import Sidebar from '../components/Sidebar';
import { api } from '../../lib/api';
import { cache, TTL } from '../../lib/cache';
import { CACHE_KEYS } from '../../lib/cachedApi';

// ─── FA Loader ────────────────────────────────────────────────────────────────
function useFontAwesome() {
  useEffect(() => {
    const id = 'fa-cdn';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(link);
  }, []);
}

// ─── Helper: resolve avatar URL ───────────────────────────────────────────────
function resolveAvatarUrl(avatar?: string | null): string | undefined {
  if (!avatar) return undefined;
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? '';
  return `${base}${avatar}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  bio: string | null;
  phone: string | null;
  createdAt: string;
  notifEmail: boolean;
  notifPush: boolean;
  notifAssignment: boolean;
  notifGrade: boolean;
  notifNewCourse: boolean;
  privacyProfile: boolean;
  privacyActivity: boolean;
}

interface SettingsSection {
  id: string;
  label: string;
  icon: string;
}

const SECTIONS: SettingsSection[] = [
  { id: 'profile',       label: 'Profile',       icon: 'fa-user'          },
  { id: 'account',       label: 'Account',        icon: 'fa-shield-halved' },
  { id: 'notifications', label: 'Notifications',  icon: 'fa-bell'          },
  { id: 'privacy',       label: 'Privacy',        icon: 'fa-lock'          },
];

const SETTINGS_CACHE_KEY = (id: string) => `settings:profile:${id}`;

// ─── Small components ─────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
      {children}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, type = 'text', disabled = false,
}: {
  value: string; onChange?: (v: string) => void;
  placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <input
      type={type} value={value} disabled={disabled} placeholder={placeholder}
      onChange={e => onChange?.(e.target.value)}
      className={`w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-700
        placeholder-slate-400 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100
        ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    />
  );
}

function Toggle({ checked, onChange, label, sub }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div>
        <span className="text-[13px] text-slate-700 font-medium group-hover:text-slate-900 transition-colors block">
          {label}
        </span>
        {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
      </div>
      <button
        role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-300 shrink-0 ${
          checked ? 'bg-blue-700' : 'bg-slate-200'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    </label>
  );
}

function SectionCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="text-slate-900 font-bold text-[14px] tracking-tight">{title}</div>
        {subtitle && <div className="text-slate-400 text-xs mt-0.5">{subtitle}</div>}
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  );
}

function SaveButton({ onClick, saving, label = 'Save Changes' }: {
  onClick: () => void; saving: boolean; label?: string;
}) {
  return (
    <button
      onClick={onClick} disabled={saving}
      className="px-5 py-2 bg-blue-700 text-white rounded-lg text-[13px] font-bold shadow hover:bg-blue-800
        hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
    >
      {saving ? (
        <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</>
      ) : (
        <><i className="fa-solid fa-check text-xs" />{label}</>
      )}
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SettingsSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex gap-5">
        <div className="w-20 h-20 rounded-xl bg-slate-100" />
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-slate-100 rounded w-32" />
          <div className="h-3 bg-slate-100 rounded w-48" />
          <div className="flex gap-2 mt-3">
            <div className="h-8 w-24 bg-slate-100 rounded-lg" />
            <div className="h-8 w-16 bg-slate-100 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="h-3 bg-slate-100 rounded w-40 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-10 bg-slate-100 rounded-lg" />
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-10 bg-slate-100 rounded-lg" />
        <div className="h-20 bg-slate-100 rounded-lg" />
      </div>
    </div>
  );
}

// ─── Avatar component ─────────────────────────────────────────────────────────
function Avatar({ profile, uploading, onUpload, onRemove, previewUrl }: {
  profile: UserProfile;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  previewUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initials = (profile.name ?? 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarSrc = previewUrl ?? resolveAvatarUrl(profile.avatar);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="text-slate-900 font-bold text-[14px] tracking-tight">Profile Photo</div>
        <div className="text-slate-400 text-xs mt-0.5">Shown across the platform · auto-compressed to WebP</div>
      </div>
      <div className="px-6 py-5 flex items-center gap-5">
        <div className="relative shrink-0">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={profile.name}
              className="w-20 h-20 rounded-xl object-cover shadow"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-xl flex items-center justify-center text-white text-2xl font-black shadow"
              style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)' }}
            >
              {initials}
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
              <span className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <div
            className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg flex items-center justify-center border-2 border-white shadow"
            style={{ background: 'linear-gradient(135deg, #1E3A5F, #2563EB)' }}
          >
            <i className="fa-solid fa-graduation-cap text-white text-[10px]" />
          </div>
        </div>

        <div>
          <div className="text-slate-800 font-bold text-[14px]">{profile.name || 'Your Name'}</div>
          <div className="text-slate-400 text-xs mt-0.5">{profile.email}</div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 bg-blue-700 text-white rounded-lg text-[12px] font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              <i className="fa-solid fa-arrow-up-from-bracket text-[10px]" />
              {uploading ? 'Uploading…' : 'Upload Photo'}
            </button>
            {avatarSrc && (
              <button
                onClick={onRemove}
                disabled={uploading}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[12px] font-semibold hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            PNG, JPG, WebP or GIF · max 10 MB · auto-resized to 256×256
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2.5 border transition-all
      ${type === 'success'
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-red-50 text-red-700 border-red-200'}`}>
      <i className={`fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
      {message}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  useFontAwesome();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const router = useRouter();

  // ── ALL hooks must come before any early return ───────────────────────────

  const [mounted, setMounted] = useState(false);

  const [profile, setProfile]               = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [revalidating, setRevalidating]     = useState(false);

  const [activeSection, setActiveSection] = useState('profile');
  const [toast, setToast]                 = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Greeting / date — empty on server, set after mount to avoid hydration mismatch
  const [greeting,  setGreeting]  = useState('');
  const [dateLabel, setDateLabel] = useState('');

  // Editable fields
  const [name,  setName]  = useState('');
  const [bio,   setBio]   = useState('');
  const [phone, setPhone] = useState('');

  // Password
  const [curPass,  setCurPass]  = useState('');
  const [newPass,  setNewPass]  = useState('');
  const [confPass, setConfPass] = useState('');

  // Notifications
  const [notifEmail,      setNotifEmail]      = useState(true);
  const [notifPush,       setNotifPush]       = useState(false);
  const [notifAssignment, setNotifAssignment] = useState(true);
  const [notifGrade,      setNotifGrade]      = useState(true);
  const [notifNewCourse,  setNotifNewCourse]  = useState(false);

  // Privacy
  const [privacyProfile,  setPrivacyProfile]  = useState(true);
  const [privacyActivity, setPrivacyActivity] = useState(false);

  // Saving states
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPass,    setSavingPass]    = useState(false);
  const [savingNotif,   setSavingNotif]   = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading,     setUploading]     = useState(false);

  // ── Mount effect — runs only on client ───────────────────────────────────
  useEffect(() => {
    setMounted(true);
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
    setDateLabel(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  function applyProfile(p: UserProfile) {
    setProfile(p);
    setName(p.name ?? '');
    setBio(p.bio ?? '');
    setPhone(p.phone ?? '');
    setNotifEmail(p.notifEmail ?? true);
    setNotifPush(p.notifPush ?? false);
    setNotifAssignment(p.notifAssignment ?? true);
    setNotifGrade(p.notifGrade ?? true);
    setNotifNewCourse(p.notifNewCourse ?? false);
    setPrivacyProfile(p.privacyProfile ?? true);
    setPrivacyActivity(p.privacyActivity ?? false);
  }

  // ── Smart fetch ───────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async (uid: string, background = false) => {
    const key    = SETTINGS_CACHE_KEY(uid);
    const cached = cache.get<UserProfile>(key);

    if (cached) {
      applyProfile(cached);
      setProfileLoading(false);
      if (!cache.isStale(key)) return;
      setRevalidating(true);
    } else {
      if (!background) setProfileLoading(true);
    }

    try {
      const res = await api.getSettings();
      const p: UserProfile = (res?.data as any)?.data?.user ?? (res?.data as any)?.user ?? res?.data;
      if (p?.id) {
        cache.set(key, p, TTL.PROFILE);
        applyProfile(p);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load profile', 'error');
    } finally {
      setProfileLoading(false);
      setRevalidating(false);
    }
  }, [showToast]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    fetchProfile(user.id);
  }, [mounted, authLoading, user, fetchProfile, router]);

  // ── Focus revalidation ────────────────────────────────────────────────────
  const userRef = useRef(user);
  userRef.current = user;
  useEffect(() => {
    const onFocus = () => {
      if (!userRef.current) return;
      const key = SETTINGS_CACHE_KEY(userRef.current.id);
      if (cache.isStale(key)) fetchProfile(userRef.current.id, true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchProfile]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await api.updateSettingsProfile({ name, bio, phone });
      const updated = (res?.data as any)?.data?.user ?? (res?.data as any)?.user;
      if (updated && user?.id) {
        const key = SETTINGS_CACHE_KEY(user.id);
        const fresh = { ...(cache.get<UserProfile>(key) ?? profile ?? {}), ...updated } as UserProfile;
        cache.set(key, fresh, TTL.PROFILE);
        cache.invalidatePrefix(CACHE_KEYS.profile(user.id));
        applyProfile(fresh);
      }
      showToast('Profile updated successfully');
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!curPass || !newPass || !confPass)
      return showToast('All password fields are required', 'error');
    if (newPass !== confPass)
      return showToast('New passwords do not match', 'error');
    if (newPass.length < 6)
      return showToast('Password must be at least 6 characters', 'error');

    setSavingPass(true);
    try {
      await api.changePassword({ currentPassword: curPass, newPassword: newPass });
      showToast('Password changed successfully');
      setCurPass(''); setNewPass(''); setConfPass('');
    } catch (err: any) {
      showToast(err.message || 'Failed to change password', 'error');
    } finally {
      setSavingPass(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSavingNotif(true);
    try {
      await api.updateNotifications({ notifEmail, notifPush, notifAssignment, notifGrade, notifNewCourse });
      if (user?.id) {
        const key = SETTINGS_CACHE_KEY(user.id);
        const p = cache.get<UserProfile>(key);
        if (p) cache.set(key, { ...p, notifEmail, notifPush, notifAssignment, notifGrade, notifNewCourse }, TTL.PROFILE);
      }
      showToast('Notification preferences saved');
    } catch (err: any) {
      showToast(err.message || 'Failed to save notifications', 'error');
    } finally {
      setSavingNotif(false);
    }
  };

  const handleSavePrivacy = async () => {
    setSavingPrivacy(true);
    try {
      await api.updatePrivacy({ privacyProfile, privacyActivity });
      if (user?.id) {
        const key = SETTINGS_CACHE_KEY(user.id);
        const p = cache.get<UserProfile>(key);
        if (p) cache.set(key, { ...p, privacyProfile, privacyActivity }, TTL.PROFILE);
      }
      showToast('Privacy settings saved');
    } catch (err: any) {
      showToast(err.message || 'Failed to save privacy settings', 'error');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await api.uploadAvatar(formData);

      const rawAvatarUrl: string | undefined =
        (res?.data as any)?.avatarUrl ??
        (res?.data as any)?.user?.avatar;

      if (rawAvatarUrl && user?.id) {
        const resolvedUrl = resolveAvatarUrl(rawAvatarUrl) ?? rawAvatarUrl;
        const key = SETTINGS_CACHE_KEY(user.id);
        const p = cache.get<UserProfile>(key);
        if (p) cache.set(key, { ...p, avatar: resolvedUrl }, TTL.PROFILE);
        cache.invalidatePrefix(CACHE_KEYS.profile(user.id));
        setProfile(prev => prev ? { ...prev, avatar: resolvedUrl } : prev);
        await refreshUser();
      }

      setAvatarPreview(null);
      showToast('Profile photo updated');
    } catch (err: any) {
      setAvatarPreview(null);
      showToast(err.message || 'Failed to upload photo', 'error');
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleAvatarRemove = async () => {
    setUploading(true);
    try {
      await api.deleteAvatar();
      if (user?.id) {
        const key = SETTINGS_CACHE_KEY(user.id);
        const p = cache.get<UserProfile>(key);
        if (p) cache.set(key, { ...p, avatar: null }, TTL.PROFILE);
        cache.invalidatePrefix(CACHE_KEYS.profile(user.id));
        setProfile(prev => prev ? { ...prev, avatar: null } : prev);
        await refreshUser();
      }
      showToast('Profile photo removed');
    } catch (err: any) {
      showToast(err.message || 'Failed to remove photo', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── Early returns AFTER all hooks ─────────────────────────────────────────
  if (!mounted || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  const displayName = (user.name ?? '').split(' ')[0] || 'there';
  const bannerAvatarSrc = avatarPreview ?? resolveAvatarUrl(profile?.avatar ?? user?.avatar);

  return (
    <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {revalidating && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-50 bg-blue-100 overflow-hidden">
          <div className="h-full bg-blue-500" style={{ animation: 'swrBar 1.4s ease-in-out infinite' }} />
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}

      <Sidebar activeItem="Settings" />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)' }}
            >
              <i className="fa-solid fa-graduation-cap text-white text-xs" />
            </div>
            <div>
              <p className="text-slate-900 font-bold text-[15px]">{greeting}, {displayName}</p>
              <p className="text-slate-400 text-[11px] mt-0.5">{dateLabel}</p>
            </div>
            {revalidating && (
              <span className="flex items-center gap-1 text-[10px] text-blue-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                Updating…
              </span>
            )}
          </div>
          <button className="relative w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-blue-700 hover:border-blue-300 transition-all">
            <i className="fa-solid fa-bell text-sm" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">

          {/* ── Hero Banner ── */}
          <div
            className="relative rounded-xl overflow-hidden px-8 py-6"
            style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}
          >
            <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
            <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />
            <div className="relative z-10 flex items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center border-2 border-white/20 shadow-lg shrink-0 overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}
                >
                  {bannerAvatarSrc ? (
                    <img
                      src={bannerAvatarSrc}
                      alt="avatar"
                      className="w-full h-full object-cover rounded-xl"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <i className="fa-solid fa-graduation-cap text-white text-2xl" />
                  )}
                </div>
                <div>
                  <p className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-1">Account Settings</p>
                  <h2 className="text-white text-2xl font-black tracking-tight">
                    {profileLoading ? 'Loading…' : 'Manage your profile'}
                  </h2>
                  <p className="text-blue-200 text-sm mt-1">
                    Update preferences, notifications, and security options.
                  </p>
                </div>
              </div>
              <div className="hidden lg:flex items-center gap-5 shrink-0">
                {[
                  { v: user.role ?? '—',  l: 'Your\nRole' },
                  { v: (user.name ?? 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2), l: 'Initials' },
                  { v: 'Active', l: 'Account\nStatus' },
                ].map(s => (
                  <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-l-0">
                    <p className="text-white text-3xl font-black">{s.v}</p>
                    <p className="text-blue-300 text-[11px] font-semibold mt-1 whitespace-pre-line leading-tight tracking-wide">{s.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

            {/* Section nav */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 h-fit">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all text-[13px] font-semibold mb-0.5
                    ${activeSection === s.id
                      ? 'bg-blue-700 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                >
                  <i className={`fa-solid ${s.icon} text-sm w-4 text-center`} />
                  {s.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="lg:col-span-3 space-y-5">
              {profileLoading ? (
                <SettingsSkeleton />
              ) : (
                <>
                  {/* ── PROFILE ── */}
                  {activeSection === 'profile' && profile && (
                    <>
                      <Avatar
                        profile={profile}
                        uploading={uploading}
                        onUpload={handleAvatarUpload}
                        onRemove={handleAvatarRemove}
                        previewUrl={avatarPreview}
                      />

                      <SectionCard title="Personal Information" subtitle="Update your name and contact details">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <FieldLabel>Full Name</FieldLabel>
                            <TextInput value={name} onChange={setName} placeholder="Your full name" />
                          </div>
                          <div>
                            <FieldLabel>Phone Number</FieldLabel>
                            <TextInput value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" />
                          </div>
                        </div>
                        <div>
                          <FieldLabel>Email Address</FieldLabel>
                          <TextInput value={profile.email} disabled />
                          <p className="text-[10px] text-slate-400 mt-1">Email cannot be changed from here.</p>
                        </div>
                        <div>
                          <FieldLabel>Bio</FieldLabel>
                          <textarea
                            value={bio}
                            onChange={e => setBio(e.target.value)}
                            placeholder="A short bio about yourself…"
                            rows={3}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-700
                              placeholder-slate-400 outline-none resize-none transition-all
                              focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                        <div className="flex justify-end">
                          <SaveButton onClick={handleSaveProfile} saving={savingProfile} />
                        </div>
                      </SectionCard>
                    </>
                  )}

                  {/* ── ACCOUNT ── */}
                  {activeSection === 'account' && profile && (
                    <>
                      <SectionCard title="Change Password" subtitle="Use a strong password you don't use elsewhere">
                        <div>
                          <FieldLabel>Current Password</FieldLabel>
                          <TextInput value={curPass} onChange={setCurPass} placeholder="••••••••" type="password" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <FieldLabel>New Password</FieldLabel>
                            <TextInput value={newPass} onChange={setNewPass} placeholder="••••••••" type="password" />
                          </div>
                          <div>
                            <FieldLabel>Confirm New Password</FieldLabel>
                            <TextInput value={confPass} onChange={setConfPass} placeholder="••••••••" type="password" />
                          </div>
                        </div>
                        {newPass && confPass && newPass !== confPass && (
                          <p className="text-xs text-red-500 flex items-center gap-1">
                            <i className="fa-solid fa-circle-exclamation" /> Passwords do not match
                          </p>
                        )}
                        <div className="flex justify-end">
                          <SaveButton onClick={handleChangePassword} saving={savingPass} label="Change Password" />
                        </div>
                      </SectionCard>

                      <SectionCard title="Account Details" subtitle="Your role and account info">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <FieldLabel>Account Role</FieldLabel>
                            <TextInput value={profile.role ?? ''} disabled />
                          </div>
                          <div>
                            <FieldLabel>Member Since</FieldLabel>
                            <TextInput
                              value={new Date(profile.createdAt ?? Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                              disabled
                            />
                          </div>
                        </div>
                      </SectionCard>

                      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                        <div className="text-red-700 font-bold text-[14px]">Danger Zone</div>
                        <div className="text-red-500 text-xs mt-0.5 mb-4">These actions are permanent and cannot be undone.</div>
                        <button className="px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg text-[13px] font-semibold hover:bg-red-600 hover:text-white transition-all">
                          Delete Account
                        </button>
                      </div>
                    </>
                  )}

                  {/* ── NOTIFICATIONS ── */}
                  {activeSection === 'notifications' && (
                    <SectionCard title="Notification Preferences" subtitle="Choose what you want to be notified about">
                      <div className="space-y-4">
                        <div className="pb-4 border-b border-slate-100">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Delivery Methods</div>
                          <div className="space-y-3">
                            <Toggle checked={notifEmail} onChange={setNotifEmail} label="Email notifications" sub="Receive updates via email" />
                            <Toggle checked={notifPush}  onChange={setNotifPush}  label="Push notifications"  sub="Browser or mobile push alerts" />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Notify me about</div>
                          <div className="space-y-3">
                            <Toggle checked={notifAssignment} onChange={setNotifAssignment} label="Assignment due reminders" />
                            <Toggle checked={notifGrade}      onChange={setNotifGrade}      label="Grade posted" />
                            <Toggle checked={notifNewCourse}  onChange={setNotifNewCourse}  label="New courses available" />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end pt-2">
                        <SaveButton onClick={handleSaveNotifications} saving={savingNotif} />
                      </div>
                    </SectionCard>
                  )}

                  {/* ── PRIVACY ── */}
                  {activeSection === 'privacy' && (
                    <SectionCard title="Privacy Controls" subtitle="Manage what others can see about you">
                      <div className="space-y-3">
                        <Toggle checked={privacyProfile}  onChange={setPrivacyProfile}  label="Show my profile to other students" />
                        <Toggle checked={privacyActivity} onChange={setPrivacyActivity} label="Show my activity status" />
                      </div>
                      <div className="flex justify-end pt-2">
                        <SaveButton onClick={handleSavePrivacy} saving={savingPrivacy} />
                      </div>
                    </SectionCard>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes swrBar {
          0%   { transform: translateX(-100%); width: 40%; }
          50%  { transform: translateX(150%);  width: 40%; }
          100% { transform: translateX(150%);  width: 40%; }
        }
      `}</style>
    </div>
  );
}