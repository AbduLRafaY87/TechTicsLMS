"use client";

import { useState, CSSProperties, FC, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import logoImage from '@/public/logo.png';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={s.page} />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token');

  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [showCf, setShowCf]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState(false);

  // If no token in URL, show an error immediately
  const missingToken = !token;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!password) { setError('Please enter a new password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res  = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ token, password }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Something went wrong.');
      setSuccess(true);
      setTimeout(() => router.replace('/login'), 3000);
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.formSide}>
        <form style={s.card} onSubmit={handleSubmit} noValidate>

          {/* Logo */}
          <div style={s.logoContainer}>
            <img src={logoImage.src} alt="TechTics Logo" style={s.logo} />
          </div>

          {/* Heading */}
          <div style={s.formHead}>
            <h1 style={s.title}>Reset Password</h1>
            <p style={s.sub}>
              {missingToken
                ? 'This reset link is invalid or missing.'
                : 'Enter your new password below.'}
            </p>
          </div>

          {/* Missing / invalid token state */}
          {missingToken && (
            <>
              <div style={s.errorBox}>
                No reset token found. Please request a new password reset link.
              </div>
              <Link href="/forgotpassword" style={s.btn as CSSProperties}>
                Request New Link
              </Link>
            </>
          )}

          {/* Success state */}
          {!missingToken && success && (
            <div style={s.successBox}>
              ✓ Password reset successfully! Redirecting you to login…
            </div>
          )}

          {/* Form fields */}
          {!missingToken && !success && (
            <>
              {/* New password */}
              <div style={{ marginBottom: 20 }}>
                <label style={s.label}>New password</label>
                <div style={{ marginTop: 8, position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    style={{ ...s.input, paddingRight: 44 }}
                    autoFocus
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw((v) => !v)}
                    style={s.eyeBtn}
                  >
                    {showPw ? <EyeOff /> : <Eye />}
                  </button>
                </div>

                {/* Strength bar */}
                {password && (
                  <div style={{ marginTop: 8 }}>
                    <div style={s.strengthTrack}>
                      <div style={{ ...s.strengthFill, ...strengthStyle(password) }} />
                    </div>
                    <span style={{ ...s.strengthLabel, color: strengthColor(password) }}>
                      {strengthText(password)}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div style={{ marginBottom: 24 }}>
                <label style={s.label}>Confirm password</label>
                <div style={{ marginTop: 8, position: 'relative' }}>
                  <input
                    type={showCf ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    style={{
                      ...s.input,
                      paddingRight: 44,
                      borderColor: confirm && confirm !== password ? '#dc2626' : undefined,
                    }}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowCf((v) => !v)}
                    style={s.eyeBtn}
                  >
                    {showCf ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                {confirm && confirm !== password && (
                  <p style={s.matchHint}>Passwords do not match</p>
                )}
              </div>

              {/* Error */}
              {error && <div style={s.errorBox}>{error}</div>}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{ ...s.btn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? <Spinner /> : 'Reset Password'}
              </button>
            </>
          )}

          {/* Divider */}
          <div style={s.divider}>
            <span style={s.line} />
            <span style={s.divText}>or</span>
            <span style={s.line} />
          </div>

          {/* Back to login */}
          <Link href="/login" style={s.backBtn}>
            Back to Sign In
          </Link>
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { border-color: #0066cc !important; box-shadow: 0 0 0 3px rgba(0,102,204,0.1); }
        button[type="button"]:focus { outline: none; }
      `}</style>
    </div>
  );
}

// ─── Password strength helpers ────────────────────────────────────────────────

function strengthScore(pw: string): number {
  let score = 0;
  if (pw.length >= 6)  score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function strengthText(pw: string) {
  const s = strengthScore(pw);
  if (s <= 1) return 'Weak';
  if (s <= 3) return 'Fair';
  if (s === 4) return 'Good';
  return 'Strong';
}

function strengthColor(pw: string) {
  const s = strengthScore(pw);
  if (s <= 1) return '#dc2626';
  if (s <= 3) return '#f59e0b';
  if (s === 4) return '#2563eb';
  return '#16a34a';
}

function strengthStyle(pw: string): CSSProperties {
  const s = strengthScore(pw);
  const pct = `${Math.min(100, (s / 5) * 100)}%`;
  return { width: pct, background: strengthColor(pw) };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Spinner: FC = () => <span style={s.spinner} />;

const Eye: FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff: FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  page:          { display:'flex', minHeight:'100vh', fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", background:'#f8fafc', justifyContent:'center', alignItems:'center' },
  formSide:      { flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' },
  card:          { width:'100%', maxWidth:480, background:'#ffffff', borderRadius:16, padding:'40px 44px', border:'1px solid #e2e8f0', boxShadow:'0 4px 6px -1px rgba(15,23,42,.1),0 2px 4px -1px rgba(15,23,42,.06)' },
  logoContainer: { display:'flex', justifyContent:'center', marginBottom:28 },
  logo:          { width:68, height:68, objectFit:'contain' },
  formHead:      { marginBottom:32, textAlign:'center' },
  title:         { fontSize:26, fontWeight:700, color:'#0f172a', letterSpacing:'-0.025em', margin:'0 0 8px 0' },
  sub:           { fontSize:14, color:'#475569', lineHeight:1.6, margin:0 },
  label:         { fontSize:13, fontWeight:600, color:'#475569', display:'block' },
  input:         { width:'100%', padding:'11px 14px', borderRadius:8, border:'1.5px solid #e2e8f0', background:'#f8fafc', fontSize:14, color:'#0f172a', outline:'none', boxSizing:'border-box', transition:'border-color .15s,box-shadow .15s' },
  eyeBtn:        { position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8', display:'flex', alignItems:'center', padding:4 },
  strengthTrack: { height:4, borderRadius:99, background:'#e2e8f0', overflow:'hidden' },
  strengthFill:  { height:'100%', borderRadius:99, transition:'width .3s,background .3s' },
  strengthLabel: { fontSize:11, fontWeight:600, marginTop:4, display:'inline-block' },
  matchHint:     { fontSize:12, color:'#dc2626', marginTop:5, marginBottom:0 },
  successBox:    { background:'#dcfce7', color:'#166534', padding:'12px 14px', borderRadius:8, fontSize:13, fontWeight:500, marginBottom:20, border:'1px solid #bbf7d0' },
  errorBox:      { background:'#fee2e2', color:'#dc2626', padding:'10px 14px', borderRadius:8, fontSize:13, fontWeight:500, marginBottom:16, border:'1px solid #fecaca' },
  btn:           { width:'100%', padding:'12px 0', borderRadius:8, background:'#0066cc', color:'#fff', fontWeight:600, fontSize:14, border:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'background-color .2s', textDecoration:'none' },
  divider:       { display:'flex', alignItems:'center', gap:10, margin:'24px 0' },
  line:          { flex:1, height:'1px', background:'#e2e8f0' },
  divText:       { fontSize:12, fontWeight:500, color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase' },
  backBtn:       { display:'block', textAlign:'center', padding:'11px 0', borderRadius:8, border:'1.5px solid #0066cc', color:'#0066cc', fontWeight:600, fontSize:14, background:'#dbeafe', textDecoration:'none' },
  spinner:       { width:18, height:18, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' },
};