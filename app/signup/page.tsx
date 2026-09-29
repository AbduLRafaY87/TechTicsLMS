'use client';
import { useState, FC, ReactNode, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../components/AuthProvider';
import logoImage from '@/public/logo.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGraduationCap } from '@fortawesome/free-solid-svg-icons';

type Role = 'STUDENT';

interface SignupForm {
  name:     string;
  email:    string;
  password: string;
  role:     Role;
}

export default function SignupPage() {
  const { register } = useAuth();
  const router       = useRouter();

  const [form, setForm]       = useState<SignupForm>({ name: '', email: '', password: '', role: 'STUDENT' });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);   // show "check your email" state

  const set = (k: keyof SignupForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email || !form.password) {
      setError('All fields are required.'); return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.'); return;
    }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password, form.role);
      // Don't log the user in — show "check your email" banner then redirect to login
      setDone(true);
      setTimeout(() => router.replace('/login?registered=1'), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── "Check your email" screen ───────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[460px] bg-white border border-slate-200 rounded-2xl shadow-md px-10 py-10 text-center">
          <div className="flex justify-center mb-5">
            <img src={logoImage.src} alt="Technics Logo" className="w-12 h-12 object-contain" />
          </div>

          {/* Envelope icon */}
          <div className="flex justify-center mb-5">
            <span className="w-16 h-16 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center text-3xl">
              ✉️
            </span>
          </div>

          <h1 className="text-[22px] font-bold text-slate-900 mb-2">Check your email</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            We sent a verification link to{' '}
            <span className="font-semibold text-slate-700">{form.email}</span>.
            Click the link to activate your account before logging in.
          </p>
          <p className="text-slate-400 text-xs">Redirecting you to the login page…</p>
        </div>
      </div>
    );
  }

  // ─── Registration form ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-4 overflow-x-hidden">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="
          bg-white border border-slate-200 rounded-2xl shadow-md
          w-full max-w-[460px]
          px-6 py-6
          sm:px-10 sm:py-8
        "
      >
        {/* Header */}
        <div className="text-center mb-5 sm:mb-6">
          <div className="flex justify-center mb-3 sm:mb-4">
            <img
              src={logoImage.src}
              alt="Technics Logo"
              className="w-11 h-11 sm:w-13 sm:h-13 object-contain"
            />
          </div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 mb-1">
            Create account
          </h1>
          <p className="text-sm text-slate-500">Start learning or teaching today.</p>
        </div>

        {/* Full name */}
        <Field label="Full name">
          <input
            type="text"
            value={form.name}
            onChange={set('name')}
            placeholder="John Doe"
            autoFocus
            autoComplete="name"
            className={inputCls}
          />
        </Field>

        {/* Email */}
        <Field label="Email address">
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="you@example.com"
            autoComplete="email"
            className={inputCls}
          />
        </Field>

        {/* Password */}
        <Field label="Password">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              placeholder="Min. 6 characters"
              autoComplete="new-password"
              className={`${inputCls} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition flex items-center"
            >
              {showPw ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </Field>

        {/* Role */}
        <Field>
          <div className="flex gap-2.5">
            {(['STUDENT'] as Role[]).map((r) => (
              <label
                key={r}
                className={`
                  flex-1 flex items-center justify-center gap-1.5
                  px-3 py-2.5 border rounded-lg text-sm font-medium cursor-pointer transition
                  ${form.role === r
                    ? 'border-blue-600 bg-blue-50 text-slate-900'
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'}
                `}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={form.role === r}
                  onChange={set('role')}
                  className="hidden"
                />
                <FontAwesomeIcon
                  icon={faGraduationCap }
                  className="text-[13px]"
                />
                {'Student'}
              </label>
            ))}
          </div>
        </Field>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3.5 py-2.5 rounded-lg mb-3">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className={`
            w-full flex items-center justify-center gap-2
            py-2.5 mt-1 rounded-lg
            bg-blue-600 text-white text-sm font-semibold
            transition
            ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700 active:bg-blue-800'}
          `}
        >
          {loading ? <Spinner /> : 'Create account'}
        </button>

        {/* Login hint */}
        <p className="text-center text-sm text-slate-400 mt-4">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:text-blue-800 transition">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}

/* Shared input class */
const inputCls =
  'w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg ' +
  'text-slate-900 outline-none transition ' +
  'focus:border-blue-600 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400';

interface FieldProps { label?: string; children: ReactNode; }
const Field: FC<FieldProps> = ({ label, children }) => (
  <div className="mb-3.5">
    {label && (
      <label className="block text-[13px] font-semibold text-slate-500 tracking-wide mb-1.5">
        {label}
      </label>
    )}
    {children}
  </div>
);

/* Spinner */
const Spinner: FC = () => (
  <span className="inline-block w-[18px] h-[18px] rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin" />
);

/* Eye icons */
const Eye: FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff: FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);