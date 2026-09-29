"use client";

import { useState, CSSProperties, FC, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import logoImage from '@/public/logo.png';

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!email) { setError('Please enter your email address.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { setError('Please enter a valid email address.'); return; }

    setLoading(true);
    try {
      const res  = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/forgot-password`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Something went wrong.');
      setSuccess(true);
      setEmail('');
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
            <h1 style={s.title}>Forgot Password?</h1>
            <p style={s.sub}>
              No worries! Enter your email and we'll send you a link to reset your password.
            </p>
          </div>

          {/* Success */}
          {success && (
            <div style={s.successBox}>
              ✓ If that email is registered, a reset link is on its way — check your inbox!
            </div>
          )}

          {/* Email field — hide after success */}
          {!success && (
            <div style={{ marginBottom: 24 }}>
              <label style={s.label}>Email address</label>
              <div style={{ marginTop: 8 }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={s.input}
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && <div style={s.errorBox}>{error}</div>}

          {/* Submit */}
          {!success && (
            <button
              type="submit"
              disabled={loading}
              style={{ ...s.btn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? <Spinner /> : 'Send Reset Link'}
            </button>
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
      `}</style>
    </div>
  );
}

const Spinner: FC = () => <span style={s.spinner} />;

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
  successBox:    { background:'#dcfce7', color:'#166534', padding:'12px 14px', borderRadius:8, fontSize:13, fontWeight:500, marginBottom:20, border:'1px solid #bbf7d0' },
  errorBox:      { background:'#fee2e2', color:'#dc2626', padding:'10px 14px', borderRadius:8, fontSize:13, fontWeight:500, marginBottom:16, border:'1px solid #fecaca' },
  btn:           { width:'100%', padding:'12px 0', borderRadius:8, background:'#0066cc', color:'#fff', fontWeight:600, fontSize:14, border:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'background-color .2s' },
  divider:       { display:'flex', alignItems:'center', gap:10, margin:'24px 0' },
  line:          { flex:1, height:'1px', background:'#e2e8f0' },
  divText:       { fontSize:12, fontWeight:500, color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase' },
  backBtn:       { display:'block', textAlign:'center', padding:'11px 0', borderRadius:8, border:'1.5px solid #0066cc', color:'#0066cc', fontWeight:600, fontSize:14, background:'#dbeafe', textDecoration:'none' },
  spinner:       { width:18, height:18, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' },
};