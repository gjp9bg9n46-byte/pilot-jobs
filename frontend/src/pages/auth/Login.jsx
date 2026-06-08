import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from '../../services/api';
import { setAuth } from '../../store';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Card, Input } from '../../components/primitives';

// Status → destination for employers (shared with the old employer login).
const DEST_FOR = { PENDING: '/employer/pending-approval', APPROVED: '/employer/dashboard', REJECTED: '/employer/rejected', SUSPENDED: '/employer/suspended' };

const css = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  subtitle: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28 },
  toggle: { display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, marginBottom: 28 },
  seg: (on) => ({ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600, border: 'none', background: on ? 'rgba(0,63,136,0.08)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)', transition: 'background 0.15s, color 0.15s' }),
  btn: { width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '14px', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500, cursor: 'pointer', marginTop: 20 },
  error: { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '12px 14px', color: '#991B1B', fontSize: 13, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 28, color: 'var(--text-secondary)', fontSize: 14 },
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
};

const PlaneMark = () => (
  <svg width="22" height="22" viewBox="0 0 18 18" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--accent)' }}>
    <path d="M16 9H3.5M10 4L16 9l-6 5M7 6L2 9l5 3" />
  </svg>
);

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const mode = params.get('as') === 'employer' ? 'employer' : 'pilot';

  const pilotToken = useSelector((s) => s.auth.token);
  const { login: employerLogin, isAuthenticated: empAuthed, status: empStatus, loading: empLoading } = useEmployerAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Standalone light page: paint the body warm so overscroll matches; restore to
  // the dark app default on unmount (see primitives/README.md → body-bg pattern).
  useEffect(() => {
    document.body.style.background = '#F8F6F1';
    return () => { document.body.style.background = '#0A1628'; };
  }, []);

  // Auto-forward an already-authenticated visitor away from the auth page.
  useEffect(() => {
    if (pilotToken) { navigate('/jobs', { replace: true }); return; }
    if (!empLoading && empAuthed) navigate(DEST_FOR[empStatus] || '/employer/pending-approval', { replace: true });
  }, [pilotToken, empLoading, empAuthed, empStatus, navigate]);

  // Switching modes clears the form (different intent — don't leak typed values).
  const switchMode = (m) => {
    if (m === mode) return;
    setEmail(''); setPassword(''); setError('');
    setParams(m === 'employer' ? { as: 'employer' } : {}, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('Please enter your email and password.');
    setLoading(true);
    try {
      if (mode === 'employer') {
        const employer = await employerLogin(email, password);
        navigate(DEST_FOR[employer.status] || '/employer/pending-approval');
      } else {
        const { data } = await authApi.login(email, password);
        dispatch(setAuth({ token: data.token, pilot: data.pilot }));
        navigate('/jobs');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-light" style={css.page}>
      <Card style={{ maxWidth: 400, width: '100%', padding: isMobile ? '32px 20px' : '40px 36px', borderRadius: 12 }}>
        <div style={css.logo}><PlaneMark /> CockpitHire</div>
        <div style={css.subtitle}>{mode === 'employer' ? 'Log in to manage your job postings.' : 'Aviation careers worldwide, matched to your licence.'}</div>

        <div style={css.toggle}>
          <button type="button" style={css.seg(mode === 'pilot')} onClick={() => switchMode('pilot')}>Pilot</button>
          <button type="button" style={css.seg(mode === 'employer')} onClick={() => switchMode('employer')}>Employer</button>
        </div>

        {error && <div style={css.error}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={mode === 'employer' ? 'you@company.com' : 'your@email.com'} autoFocus />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <div style={css.footer}>
          Don't have an account?{' '}
          <Link to={mode === 'employer' ? '/register?as=employer' : '/register'} style={css.link}>Sign up</Link>
        </div>
      </Card>
    </div>
  );
}
