import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { jobApi } from '../services/api';
import { setAlerts, markAlertRead } from '../store';

function matchStyle(score) {
  if (score >= 90) return { label: 'Excellent Match', color: '#2ECC71', bg: '#0D2B1A', border: '#1A4A2A' };
  if (score >= 75) return { label: 'Great Match',     color: '#00B4D8', bg: '#0A2540', border: '#1A3A5A' };
  if (score >= 60) return { label: 'Good Match',      color: '#F39C12', bg: '#2B1F0A', border: '#4A3A1A' };
  return              { label: 'Partial Match',    color: '#7A8CA0', bg: '#1B2B4B', border: '#243050' };
}

const css = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 24, fontWeight: 800, color: '#fff' },
  badge: {
    background: '#00B4D8', color: '#0A1628', borderRadius: 20,
    padding: '4px 14px', fontSize: 13, fontWeight: 800,
  },
  card: (unread) => ({
    background: '#0D1E35',
    border: `1px solid ${unread ? '#00B4D8' : '#1E3050'}`,
    borderLeft: `4px solid ${unread ? '#00B4D8' : '#1E3050'}`,
    borderRadius: 14, padding: '20px 24px',
    marginBottom: 14, cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20,
    transition: 'border-color 0.2s',
  }),
  left: { flex: 1, minWidth: 0 },
  jobTitle: { fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 },
  airline: { fontSize: 14, color: '#00B4D8', fontWeight: 600, marginBottom: 8 },
  metaRow: { display: 'flex', gap: 20 },
  meta: { fontSize: 12, color: '#7A8CA0' },
  scoreSide: { textAlign: 'center', flexShrink: 0, minWidth: 100 },
  scoreCircle: (m) => ({
    width: 72, height: 72, borderRadius: '50%',
    border: `3px solid ${m.color}`,
    background: m.bg, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px',
  }),
  scoreNum: (m) => ({ fontSize: 20, fontWeight: 800, color: m.color, lineHeight: 1 }),
  scoreLabel: (m) => ({ fontSize: 9, color: m.color, fontWeight: 700, marginTop: 2, textAlign: 'center' }),
  matchLabel: (m) => ({ fontSize: 11, color: m.color, fontWeight: 700 }),
  newDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#00B4D8', display: 'inline-block', marginRight: 6,
  },
  empty: { textAlign: 'center', padding: '80px 0' },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: 800, color: '#7A8CA0', marginBottom: 10 },
  emptyText: { fontSize: 14, color: '#4A6080', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' },
  applyBtn: {
    marginTop: 10, display: 'inline-block',
    background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
    color: '#fff', padding: '8px 18px', borderRadius: 8,
    fontWeight: 700, fontSize: 13, textDecoration: 'none',
  },
};

export default function Alerts() {
  const dispatch = useDispatch();
  const alerts = useSelector((s) => s.jobs.alerts);
  const unread = alerts.filter((a) => !a.readAt).length;
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setLoading(true);
    jobApi.getAlerts()
      .then(({ data }) => dispatch(setAlerts(data)))
      .finally(() => setLoading(false));
  }, []);

  const handleClick = async (alert) => {
    if (!alert.readAt) {
      await jobApi.markRead(alert.id);
      dispatch(markAlertRead(alert.id));
    }
    setExpanded(expanded === alert.id ? null : alert.id);
  };

  return (
    <div>
      <div style={css.header}>
        <div>
          <div style={css.title}>My Job Alerts</div>
          <div style={{ color: '#4A6080', fontSize: 13, marginTop: 4 }}>
            Jobs matched to your pilot profile — we notify you automatically when new ones appear
          </div>
        </div>
        {unread > 0 && <div style={css.badge}>{unread} new</div>}
      </div>

      {loading && <div style={{ color: '#7A8CA0', textAlign: 'center', padding: 60 }}>Loading your alerts...</div>}

      {!loading && alerts.length === 0 && (
        <div style={css.empty}>
          <div style={css.emptyIcon}>🔔</div>
          <div style={css.emptyTitle}>No alerts yet</div>
          <div style={css.emptyText}>
            Once you complete your pilot profile with your licences, ratings, and flight hours,
            we'll automatically match you to open positions and notify you here.
          </div>
        </div>
      )}

      {alerts.map((alert) => {
        const m = matchStyle(alert.matchScore);
        const isOpen = expanded === alert.id;
        const isUnread = !alert.readAt;
        return (
          <div key={alert.id} style={{ marginBottom: 14 }}>
            <div style={css.card(isUnread)} onClick={() => handleClick(alert)}>
              <div style={css.left}>
                <div style={css.jobTitle}>
                  {isUnread && <span style={css.newDot} />}
                  {alert.job.title}
                </div>
                <div style={css.airline}>{alert.job.company}</div>
                <div style={css.metaRow}>
                  <span style={css.meta}>📍 {alert.job.location}</span>
                  {alert.job.reqAuthorities?.[0] && (
                    <span style={css.meta}>🏛 {alert.job.reqAuthorities[0]}</span>
                  )}
                  {alert.job.reqMinTotalHours && (
                    <span style={css.meta}>⏱ {alert.job.reqMinTotalHours.toLocaleString()} hrs min</span>
                  )}
                </div>
              </div>

              <div style={css.scoreSide}>
                <div style={css.scoreCircle(m)}>
                  <div style={css.scoreNum(m)}>{Math.round(alert.matchScore)}%</div>
                  <div style={css.scoreLabel(m)}>MATCH</div>
                </div>
                <div style={css.matchLabel(m)}>{m.label}</div>
              </div>
            </div>

            {isOpen && (
              <div style={{
                background: '#0A2040', border: '1px solid #1E3050', borderTop: 'none',
                borderRadius: '0 0 14px 14px', padding: '20px 24px',
                marginTop: -14,
              }}>
                <div style={{ fontSize: 13, color: '#7A8CA0', lineHeight: 1.8, marginBottom: 16 }}>
                  {alert.job.description?.slice(0, 400)}...
                </div>
                <a href={alert.job.applyUrl} target="_blank" rel="noreferrer" style={css.applyBtn}>
                  Apply for this job →
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
