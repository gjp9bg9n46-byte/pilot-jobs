import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { adminApi } from '../services/api';

// Admin stays deliberately dark (operator-only surface). Palette mirrors
// AdminModeration / AdminEmployers — not the editorial-light pilot identity.
const C = {
  text: '#fff', muted: '#7A8CA0', dim: '#4A6080', accent: '#00B4D8',
  card: '#0D1E35', border: '#1E3050', queue: '#F39C12',
};

const css = {
  page: { maxWidth: 920, margin: '0 auto', paddingBottom: 60 },
  h1: { fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 },
  sub: { fontSize: 12, color: C.dim, marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, margin: '24px 0 12px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 12 },
  tile: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', display: 'block', textDecoration: 'none' },
  num: (c) => ({ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, color: c, lineHeight: 1.1 }),
  label: { fontSize: 13, color: C.muted, marginTop: 6 },
  arrow: { fontSize: 12, color: C.accent, marginTop: 8, fontWeight: 600 },
};

function Tile({ value, label, color = C.text, to }) {
  const inner = (
    <>
      <div style={css.num(color)}>{value}</div>
      <div style={css.label}>{label}</div>
      {to && <div style={css.arrow}>Review →</div>}
    </>
  );
  return to
    ? <Link to={to} className="admin-tile" style={css.tile} aria-label={`${label}: ${value} — review`}>{inner}</Link>
    : <div style={css.tile}>{inner}</div>;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    adminApi.getStats()
      .then(({ data }) => setStats(data))
      .catch((err) => {
        // Same non-admin handling as the other admin pages (requireAdmin → 404).
        if (err.response?.status === 404 || err.response?.status === 401) navigate('/jobs', { replace: true });
        else setError('Failed to load admin stats.');
      })
      .finally(() => setLoading(false));
  }, [navigate]);
  useEffect(() => { load(); }, [load]);

  // Notifications — one-tap Resend health check (Phase A endpoint).
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState(null); // { ok, text }
  const dismissTimer = useRef(null);
  useEffect(() => () => clearTimeout(dismissTimer.current), []);

  const sendTest = async () => {
    setTestSending(true);
    setTestMsg(null);
    clearTimeout(dismissTimer.current);
    try {
      const { data } = await adminApi.sendTestNotification();
      setTestMsg({ ok: true, text: `Test email sent — check ${data.sentTo}. Message ID: ${data.messageId}` });
      dismissTimer.current = setTimeout(() => setTestMsg(null), 8000);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Unknown error';
      setTestMsg({ ok: false, text: `Failed to send test email: ${msg}. Check Resend dashboard for details.` });
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div style={css.page}>
      <div style={css.h1}>Admin Dashboard</div>
      <div style={css.sub}>Queues, platform health, and the last 30 days at a glance.</div>

      {loading && <div style={{ textAlign: 'center', color: C.dim, padding: 60 }}>Loading…</div>}

      {error && (
        <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 10, padding: '12px 16px', color: '#E74C3C', fontSize: 14 }}>
          {error} <button onClick={load} style={{ marginLeft: 8, background: 'none', border: 'none', color: C.accent, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {!loading && !error && stats && (
        <>
          <div style={css.sectionLabel}>Action Required</div>
          <div style={css.grid}>
            <Tile value={stats.actionQueues.pendingContributions} label="Pending contributions" color={stats.actionQueues.pendingContributions > 0 ? C.queue : C.text} to="/admin/moderation" />
            <Tile value={stats.actionQueues.pendingEmployers} label="Pending employers" color={stats.actionQueues.pendingEmployers > 0 ? C.queue : C.text} to="/admin/employers" />
          </div>

          <div style={css.sectionLabel}>Platform</div>
          <div style={css.grid}>
            <Tile value={stats.platform.activePilots.toLocaleString()} label="Pilots" />
            <Tile value={stats.platform.activeEmployers.toLocaleString()} label="Approved employers" />
            <Tile value={stats.platform.activeAirlines.toLocaleString()} label="Airlines" />
          </div>

          <div style={css.sectionLabel}>Last 30 days</div>
          <div style={css.grid}>
            <Tile value={stats.recent30d.jobsPosted.toLocaleString()} label="Jobs posted" />
            <Tile value={stats.recent30d.applicationsSubmitted.toLocaleString()} label="Applications submitted" />
            <Tile value={stats.recent30d.newContributions.toLocaleString()} label="New contributions" />
          </div>

          <div style={css.sectionLabel}>Notifications</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
            <button
              onClick={sendTest}
              disabled={testSending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: testSending ? '#16263F' : C.accent,
                color: testSending ? C.muted : '#04121F',
                border: 'none', borderRadius: 8, padding: '10px 16px',
                fontSize: 13, fontWeight: 700, cursor: testSending ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <Send size={15} /> {testSending ? 'Sending…' : 'Send test email'}
            </button>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>
              Sends a test email to your admin address to verify the Resend integration.
            </div>
            {testMsg && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
                background: testMsg.ok ? 'rgba(52,211,153,0.1)' : 'rgba(231,76,60,0.1)',
                border: `1px solid ${testMsg.ok ? 'rgba(52,211,153,0.35)' : 'rgba(231,76,60,0.35)'}`,
                color: testMsg.ok ? '#34D399' : '#FF6B6B', wordBreak: 'break-word',
              }}>
                {testMsg.text}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
