import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from '../../services/api';
import { setAuth } from '../../store';
import { useEmployerAuth } from '../../context/EmployerAuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

// Status → destination for employers (shared with the old employer login).
const DEST_FOR = { PENDING: '/employer/pending-approval', APPROVED: '/employer/dashboard', REJECTED: '/employer/rejected', SUSPENDED: '/employer/suspended' };

const css = {
  page: { minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: '#0D1E35', borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 440, border: '1px solid #1E3050' },
  logo: { fontSize: 28, fontWeight: 800, color: '#00B4D8', marginBottom: 6 },
  subtitle: { color: '#7A8CA0', fontSize: 14, marginBottom: 28 },
  toggle: { display: 'flex', background: '#0A1729', border: '1px solid #243050', borderRadius: 12, padding: 4, marginBottom: 28 },
  seg: (on) => ({ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 700, border: 'none', background: on ? '#1B2B4B' : 'transparent', color: on ? '#00B4D8' : '#7A8CA0', transition: 'all 0.15s' }),
  label: { display: 'block', color: '#C0CDE0', fontSize: 13, fontWeight: 600, marginBottom: 8 },
  input: { width: '100%', background: '#1B2B4B', border: '1px solid #243050', borderRadius: 10, padding: '13px 14px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box' },
  field: { marginBottom: 20 },
  btn: { width: '100%', background: 'linear-gradient(135deg, #00B4D8, #0077A8)', border: 'none', borderRadius: 10, padding: '14px', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  error: { background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8, padding: '12px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 28, color: '#7A8CA0', fontSize: 14 },
  link: { color: '#00B4D8', fontWeight: 600, textDecoration: 'none' },
};

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
    <div style={css.page}>
      <div style={{ ...css.card, padding: isMobile ? '32px 20px' : '48px 40px' }}>
        <div style={css.logo}>✈ CockpitHire</div>
        <div style={css.subtitle}>{mode === 'employer' ? 'Log in to manage your job postings.' : 'Aviation careers worldwide, matched to your licence.'}</div>

        <div style={css.toggle}>
          <button type="button" style={css.seg(mode === 'pilot')} onClick={() => switchMode('pilot')}>Pilot</button>
          <button type="button" style={css.seg(mode === 'employer')} onClick={() => switchMode('employer')}>Employer</button>
        </div>

        {error && <div style={css.error}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={css.field}>
            <label style={css.label}>Email address</label>
            <input style={css.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={mode === 'employer' ? 'you@company.com' : 'your@email.com'} autoFocus />
          </div>
          <div style={css.field}>
            <label style={css.label}>Password</label>
            <input style={css.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <div style={css.footer}>
          Don't have an account?{' '}
          <Link to={mode === 'employer' ? '/register?as=employer' : '/register'} style={css.link}>Sign up</Link>
        </div>
      </div>
    </div>
  );
}
