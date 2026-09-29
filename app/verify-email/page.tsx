'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import logoImage from '@/public/logo.png';

type Status = 'loading' | 'success' | 'expired' | 'invalid' | 'already_verified';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
        <span className="w-10 h-10 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin inline-block" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get('token');

  const [status, setStatus]   = useState<Status>('loading');
  const [message, setMessage] = useState('');

  // Resend state (for expired tokens)
  const [email, setEmail]           = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }

    const verify = async () => {
      try {
        const res  = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`
        );
        const data = await res.json();

        if (res.ok && data.success) {
          if (data.message?.toLowerCase().includes('already')) {
            setStatus('already_verified');
          } else {
            setStatus('success');
          }
        } else if (data.code === 'TOKEN_EXPIRED') {
          setStatus('expired');
        } else {
          setStatus('invalid');
          setMessage(data.message || 'This verification link is invalid.');
        }
      } catch {
        setStatus('invalid');
        setMessage('Something went wrong. Please try again.');
      }
    };

    verify();
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendState('sending');
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/resend-verification`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });
      setResendState('sent');
    } catch {
      setResendState('idle');
    }
  };

  // ─── Redirect to login after success ────────────────────────────────────────
  useEffect(() => {
    if (status === 'success') {
      const t = setTimeout(() => router.replace('/login'), 3500);
      return () => clearTimeout(t);
    }
  }, [status, router]);

  // ─── Shared card wrapper ────────────────────────────────────────────────────
  const Card = ({ children }: { children: React.ReactNode }) => (
    <div
      className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8"
      style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}
    >
      <div className="w-full max-w-[440px] bg-white rounded-2xl border border-slate-200 shadow-md px-10 py-10 text-center">
        <div className="flex justify-center mb-5">
          <img src={logoImage.src} alt="TechTics Logo" className="w-[52px] h-[52px] object-contain" />
        </div>
        {children}
      </div>
    </div>
  );

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <Card>
        <div className="flex justify-center mb-4">
          <span className="w-10 h-10 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin inline-block" />
        </div>
        <p className="text-slate-500 text-sm">Verifying your email…</p>
      </Card>
    );
  }

  // ─── Success ──────────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <Card>
        <div className="flex justify-center mb-4">
          <span className="w-14 h-14 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center text-green-500 text-2xl">
            ✓
          </span>
        </div>
        <h1 className="text-[22px] font-bold text-slate-900 mb-2">Email verified!</h1>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          Your account is now active. Redirecting you to the login page…
        </p>
        <Link
          href="/login"
          className="inline-block w-full py-2.5 rounded-lg bg-[#0066cc] hover:bg-[#0052a3] text-white text-sm font-semibold transition-colors"
        >
          Go to Login
        </Link>
      </Card>
    );
  }

  // ─── Already verified ─────────────────────────────────────────────────────────
  if (status === 'already_verified') {
    return (
      <Card>
        <div className="flex justify-center mb-4">
          <span className="w-14 h-14 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center text-blue-500 text-2xl">
            ✓
          </span>
        </div>
        <h1 className="text-[22px] font-bold text-slate-900 mb-2">Already verified</h1>
        <p className="text-slate-500 text-sm mb-6">Your email is already confirmed — you're good to go.</p>
        <Link
          href="/login"
          className="inline-block w-full py-2.5 rounded-lg bg-[#0066cc] hover:bg-[#0052a3] text-white text-sm font-semibold transition-colors"
        >
          Go to Login
        </Link>
      </Card>
    );
  }

  // ─── Expired token ────────────────────────────────────────────────────────────
  if (status === 'expired') {
    return (
      <Card>
        <div className="flex justify-center mb-4">
          <span className="w-14 h-14 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center text-amber-500 text-2xl">
            ⏱
          </span>
        </div>
        <h1 className="text-[22px] font-bold text-slate-900 mb-2">Link expired</h1>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          Your verification link has expired (links are valid for 24 hours). Enter your email below to
          receive a fresh one.
        </p>

        {resendState === 'sent' ? (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-4 py-3 rounded-lg">
            ✓ New verification email sent — check your inbox!
          </div>
        ) : (
          <form onSubmit={handleResend} className="text-left">
            <label className="block text-[13px] font-semibold text-slate-500 tracking-wide mb-1.5">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 bg-slate-50 text-sm text-slate-900 outline-none transition-all focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:bg-white mb-3"
            />
            <button
              type="submit"
              disabled={resendState === 'sending'}
              className="w-full py-2.5 rounded-lg bg-[#0066cc] hover:bg-[#0052a3] text-white text-sm font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
            </button>
          </form>
        )}
      </Card>
    );
  }

  // ─── Invalid token ────────────────────────────────────────────────────────────
  return (
    <Card>
      <div className="flex justify-center mb-4">
        <span className="w-14 h-14 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center text-red-500 text-2xl">
          ✕
        </span>
      </div>
      <h1 className="text-[22px] font-bold text-slate-900 mb-2">Invalid link</h1>
      <p className="text-slate-500 text-sm mb-6 leading-relaxed">
        {message || 'This verification link is invalid or has already been used.'}
      </p>
      <Link
        href="/login"
        className="inline-block w-full py-2.5 rounded-lg bg-[#0066cc] hover:bg-[#0052a3] text-white text-sm font-semibold transition-colors"
      >
        Back to Login
      </Link>
    </Card>
  );
}