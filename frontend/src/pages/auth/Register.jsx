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
    width: '100%', maxWidth: 520, border: '1px solid #1E3050',
  },
  logo: { fontSize: 28, fontWeight: 800, color: '#00B4D8', marginBottom: 6 },
  subtitle: { color: '#7A8CA0', fontSize: 14, marginBottom: 40, lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  full: { gridColumn: '1 / -1' },
  label: { display: 'block', color: '#C0CDE0', fontSize: 13, fontWeight: 600, marginBottom: 8 },
  input: {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 10, padding: '13px 14px', color: '#fff', fontSize: 15,
    outline: 'none',
  },
  field: { marginBottom: 16 },
  btn: {
    width: '100%', background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
    border: 'none', borderRadius: 10, padding: '14px', color: '#fff',
    fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8,
  },
  error: {
    background: '#2D1A1A', border: '1px solid #5C2626', borderRadius: 8,
    padding: '12px 14px', color: '#FF6B6B', fontSize: 13, marginBottom: 20,
  },
  footer: { textAlign: 'center', marginTop: 28, color: '#7A8CA0', fontSize: 14 },
  link: { color: '#00B4D8', fontWeight: 600, textDecoration: 'none' },
  required: { color: '#00B4D8', marginLeft: 2 },
};

const FIELDS = [
  { name: 'firstName', label: 'First Name', required: true, half: true },
  { name: 'lastName', label: 'Last Name', half: true },
  { name: 'email', label: 'Email Address', type: 'email', required: true, full: true },
  { name: 'password', label: 'Password', type: 'password', required: true, hint: 'Min. 8 characters', full: true },
  { name: 'country', label: 'Country', half: true },
  { name: 'city', label: 'City', half: true },
  { name: 'phone', label: 'Phone (optional)', type: 'tel', half: true },
];

export default function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', country: '', city: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.firstName || !form.email || !form.password) return setError('Please fill in all required fields.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    try {
      const { data } = await authApi.register(form);
      dispatch(setAuth({ token: data.token, pilot: data.pilot }));
      navigate('/profile');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create account. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={css.page}>
      <div style={css.card}>
        <div style={css.logo}>✈ CockpitHire</div>
        <div style={css.subtitle}>
          Create your free account — you'll add your pilot details after sign-up.
        </div>

        {error && <div style={css.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={css.grid}>
            {FIELDS.map(({ name, label, type = 'text', required, half, full, hint }) => (
              <div key={name} style={{ ...(full || !half ? css.full : {}), ...css.field }}>
                <label style={css.label}>
                  {label}{required && <span style={css.required}> *</span>}
                  {hint && <span style={{ color: '#4A6080', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>{hint}</span>}
                </label>
                <input
                  style={css.input} type={type} value={form[name]}
                  onChange={set(name)} placeholder={label.replace(' (optional)', '')}
                />
              </div>
            ))}
          </div>
          <button style={{ ...css.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account →'}
          </button>
        </form>

        <div style={css.footer}>
          Already have an account?{' '}
          <Link to="/login" style={css.link}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
