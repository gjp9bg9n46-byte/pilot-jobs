import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { authApi } from '../../services/api';
import { setAuth } from '../../store';

const css = {
  page: {
    minHeight: '100vh', background: '#0A1628',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    background: '#0D1E35', borderRadius: 20, padding: '48px 40px',
    width: '100%', maxWidth: 440, border: '1px solid #1E3050',
  },
  logo: { fontSize: 28, fontWeight: 800, color: '#00B4D8', marginBottom: 6 },
  subtitle: { color: '#7A8CA0', fontSize: 14, marginBottom: 40 },
  label: { display: 'block', color: '#C0CDE0', fontSize: 13, fontWeight: 600, marginBottom: 8 },
  input: {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 10, padding: '13px 14px', color: '#fff', fontSize: 15,
    outline: 'none', transition: 'border-color 0.15s',
  },
  field: { marginBottom: 20 },
  btn: {
    width: '100%', background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
    border: 'none', borderRadius: 10, padding: '14px', color: '#fff',
    fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8,
    transition: 'opacity 0.15s',
  },
  error: {
    background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8,
    padding: '12px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 20,
  },
  footer: { textAlign: 'center', marginTop: 28, color: '#7A8CA0', fontSize: 14 },
  link: { color: '#00B4D8', fontWeight: 600, textDecoration: 'none' },
};

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('Please enter your email and password.');
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      dispatch(setAuth({ token: data.token, pilot: data.pilot }));
      navigate('/jobs');
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={css.page}>
      <div style={css.card}>
        <div style={css.logo}>✈ CockpitHire</div>
        <div style={css.subtitle}>Aviation careers worldwide, matched to your licence</div>

        {error && <div style={css.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={css.field}>
            <label style={css.label}>Email address</label>
            <input
              style={css.input} type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" autoFocus
            />
          </div>
          <div style={css.field}>
            <label style={css.label}>Password</label>
            <input
              style={css.input} type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>

        <div style={css.footer}>
          Don't have an account?{' '}
          <Link to="/register" style={css.link}>Create one free</Link>
        </div>
      </div>
    </div>
  );
}
