'use client';

import { useState, FC, ReactNode, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../components/AuthProvider';
import logoImage from '@/public/logo.png';

// ─── Sub-components ───────────────────────────────────────────────────────────

const Field: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="mb-4">
    <label className="block text-[13px] font-semibold text-slate-500 tracking-[0.01em] mb-2">
      {label}
    </label>
    {children}
  </div>
);

const Spinner: FC = () => (
  <span className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
);

const Eye = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M17.94 17.94A10 10 0 0 1 12 20C5 20 1 12 1 12" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [unverified, setUnverified]   = useState(false);   // show resend UI
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setUnverified(false);
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const newUser = await login(email, password);
      if (newUser?.role === 'TEACHER' || newUser?.role === 'ADMIN') {
        router.replace('/teacher/dashboard');
      } else {
        router.replace('/dashboard');
      }
    } catch (err: any) {
      // Backend returns code: 'EMAIL_NOT_VERIFIED' when email isn't confirmed
      if (err?.code === 'EMAIL_NOT_VERIFIED' || err?.message?.includes('verify your email')) {
        setUnverified(true);
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendStatus('sending');
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/resend-verification`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email }),
        }
      );
      await res.json();
      setResendStatus('sent');
    } catch {
      setResendStatus('idle');
    }
  };

  return (
    <div
      className="h-screen overflow-hidden bg-slate-50 flex items-center justify-center px-6"
      style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-[480px] bg-white rounded-2xl border border-slate-200 shadow-md px-11 py-8"
      >
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <img src={logoImage.src} alt="TechTics Logo" className="w-[60px] h-[60px] object-contain" />
        </div>

        {/* Heading */}
        <div className="text-center mb-6">
          <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-tight m-0">Welcome back</h1>
          <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-tight mt-1 mb-0">TechTics Club</h1>
          <p className="text-sm text-slate-500 mt-1.5">Sign in to continue</p>
        </div>

        {/* Email */}
        <Field label="Email address">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            autoComplete="email"
            className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 bg-slate-50 text-sm text-slate-900 outline-none transition-all focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:bg-white"
          />
        </Field>

        {/* Password */}
        <Field label="Password">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 pr-11 rounded-lg border-[1.5px] border-slate-200 bg-slate-50 text-sm text-slate-900 outline-none transition-all focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:bg-white"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors flex items-center"
            >
              {showPw ? <EyeOff /> : <Eye />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => router.push('/forgotpassword')}
            className="mt-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-800 transition-colors bg-transparent border-none p-0 cursor-pointer"
          >
            Forgot?
          </button>
        </Field>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium px-3.5 py-2.5 rounded-lg mb-3">
            {error}
          </div>
        )}

        {/* Unverified email — resend banner */}
        {unverified && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3 mb-3">
            <p className="text-amber-700 text-[13px] font-medium mb-2">
              Didn't get the email?
            </p>
            {resendStatus === 'sent' ? (
              <p className="text-green-600 text-[13px] font-semibold">
                ✓ A new verification link has been sent — check your inbox.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendStatus === 'sending'}
                className="text-[13px] font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-900 disabled:opacity-60 transition-colors bg-transparent border-none p-0 cursor-pointer"
              >
                {resendStatus === 'sending' ? 'Sending…' : 'Resend verification email'}
              </button>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 mt-1.5 rounded-lg bg-[#0066cc] hover:bg-[#0052a3] text-white text-sm font-semibold tracking-wide transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? <Spinner /> : 'Sign in'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-2.5 my-[18px]">
          <span className="flex-1 h-px bg-slate-200" />
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">or</span>
          <span className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Sign up */}
        <Link
          href="/signup"
          className="block text-center py-2.5 rounded-lg border-[1.5px] border-[#0066cc] bg-blue-100 text-[#0066cc] text-sm font-semibold tracking-wide hover:bg-blue-200 transition-colors"
        >
          Create an account
        </Link>
      </form>
    </div>
  );
}