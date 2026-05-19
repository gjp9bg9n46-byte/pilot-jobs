import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { jobApi } from '../services/api';
import { setAlerts, markAlertRead } from '../store';

function PlaneSave({ saved, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={saved ? '#00B4D8' : 'none'} stroke={saved ? '#00B4D8' : '#4A6080'} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10L2 4l4 6-4 6 16-6z" />
    </svg>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function matchStyle(score) {
  if (score >= 90) return { label: 'Excellent Match', color: '#2ECC71', bg: '#0D2B1A', border: '#1A4A2A' };
  if (score >= 75) return { label: 'Great Match',     color: '#00B4D8', bg: '#0A2540', border: '#1A3A5A' };
  if (score >= 60) return { label: 'Good Match',      color: '#F39C12', bg: '#2B1F0A', border: '#4A3A1A' };
  return              { label: 'Partial Match',    color: '#7A8CA0', bg: '#1B2B4B', border: '#243050' };
}

const AUTHORITIES = [
  { value: 'FAA',  label: '🇺🇸 FAA' },
  { value: 'EASA', label: '🇪🇺 EASA' },
  { value: 'CAA',  label: '🇬🇧 UK CAA' },
  { value: 'TCCA', label: '🇨🇦 Transport Canada' },
  { value: 'CAAC', label: '🇨🇳 CAAC' },
  { value: 'ICAO', label: '🌍 ICAO' },
  { value: 'FATA', label: '🇷🇺 Russia/CIS' },
];

const FREQ_COLORS = {
  INSTANT: { color: '#2ECC71', bg: 'rgba(46,204,113,0.12)' },
  DAILY:   { color: '#00B4D8', bg: 'rgba(0,180,216,0.12)' },
  WEEKLY:  { color: '#F39C12', bg: 'rgba(243,156,18,0.12)' },
};

// ─── MatchBreakdown ──────────────────────────────────────────────────────────

function MatchBreakdown({ breakdown }) {
  if (!breakdown) return null;
  const cols = [
    { label: 'Matched',  items: breakdown.matched  ?? [], icon: '✓', color: '#2ECC71', bg: 'rgba(46,204,113,0.08)'  },
    { label: 'Marginal', items: breakdown.marginal ?? [], icon: '~', color: '#F39C12', bg: 'rgba(243,156,18,0.08)'  },
    { label: 'Missing',  items: breakdown.missing  ?? [], icon: '✗', color: '#E74C3C', bg: 'rgba(231,76,60,0.08)'   },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
      {cols.map((col) => (
        <div key={col.label} style={{ background: col.bg, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: col.color, letterSpacing: 1, marginBottom: 8 }}>
            {col.icon} {col.label.toUpperCase()}
          </div>
          {col.items.length === 0 ? (
            <div style={{ fontSize: 12, color: '#4A6080' }}>—</div>
          ) : (
            col.items.map((item) => (
              <div key={item} style={{ fontSize: 12, color: '#C0D0E0', marginBottom: 4 }}>{item}</div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

// ─── SavedSearchModal ────────────────────────────────────────────────────────

function SavedSearchModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    frequency: initial?.frequency ?? 'DAILY',
    authority: initial?.authority ?? '',
    aircraftType: initial?.aircraftType ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  const inputStyle = {
    width: '100%', background: '#0A1628', border: '1px solid #1E3050',
    borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 12, color: '#7A8CA0', fontWeight: 700, letterSpacing: 0.5, marginBottom: 6, display: 'block' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16,
        padding: 32, width: '100%', maxWidth: 480,
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 24 }}>
          {initial ? 'Edit Saved Search' : 'New Saved Search'}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>NAME</label>
          <input
            style={inputStyle} placeholder="e.g. A320 Captain EU"
            value={form.name} onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>FREQUENCY</label>
          <select style={inputStyle} value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
            <option value="INSTANT">Instant — notify immediately</option>
            <option value="DAILY">Daily digest</option>
            <option value="WEEKLY">Weekly digest</option>
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>AUTHORITY (optional)</label>
          <select style={inputStyle} value={form.authority} onChange={(e) => set('authority', e.target.value)}>
            <option value="">Any authority</option>
            {AUTHORITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={labelStyle}>AIRCRAFT TYPE (optional)</label>
          <input
            style={inputStyle} placeholder="e.g. A320, B737, ATR72"
            value={form.aircraftType} onChange={(e) => set('aircraftType', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #1E3050',
            color: '#7A8CA0', borderRadius: 8, padding: '10px 20px',
            fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{
            background: saving || !form.name.trim() ? '#1E3050' : 'linear-gradient(135deg, #00B4D8, #0077A8)',
            color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MatchesTab ──────────────────────────────────────────────────────────────

function MatchesTab({ alerts, dispatch, filter, setFilter, sort, setSort, onRefresh }) {
  const [expanded, setExpanded] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [savedMap, setSavedMap] = useState(() => {
    const m = {};
    alerts.forEach((a) => { if (a.job?.id) m[a.job.id] = false; });
    return m;
  });

  const handleSaveToggle = async (e, jobId) => {
    e.stopPropagation();
    const isSaved = savedMap[jobId];
    setSavedMap((prev) => ({ ...prev, [jobId]: !isSaved }));
    try {
      if (isSaved) await jobApi.unsaveJob(jobId);
      else await jobApi.saveJob(jobId);
      if (filter === 'saved') onRefresh();
    } catch {
      setSavedMap((prev) => ({ ...prev, [jobId]: isSaved }));
    }
  };

  const handleClick = async (alert) => {
    if (!alert.readAt) {
      await jobApi.markRead(alert.id);
      dispatch(markAlertRead(alert.id));
    }
    setExpanded((prev) => (prev === alert.id ? null : alert.id));
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try { await jobApi.markAllAlertsRead(); } finally { setMarkingAll(false); }
  };

  const chips = [
    { key: 'all',       label: 'All' },
    { key: 'unread',    label: 'Unread' },
    { key: 'saved',     label: 'Saved' },
    { key: 'dismissed', label: 'Dismissed' },
  ];

  const unreadCount = alerts.filter((a) => !a.readAt).length;

  const chipStyle = (active) => ({
    padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', border: `1px solid ${active ? '#00B4D8' : '#1E3050'}`,
    color: active ? '#00B4D8' : '#7A8CA0', background: 'transparent',
    transition: 'all 0.15s',
  });

  return (
    <div>
      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flex: 1 }}>
          {chips.map((c) => (
            <button key={c.key} style={chipStyle(filter === c.key)} onClick={() => setFilter(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{
            background: '#0D1E35', border: '1px solid #1E3050', color: '#C0D0E0',
            borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="newest">Newest</option>
          <option value="score">Best Match</option>
          <option value="deadline">Deadline</option>
        </select>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            disabled={markingAll}
            style={{
              background: 'transparent', border: '1px solid #1E3050',
              color: '#7A8CA0', borderRadius: 8, padding: '7px 14px',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            {markingAll ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      {/* Empty state */}
      {alerts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔔</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#7A8CA0', marginBottom: 10 }}>No alerts yet</div>
          <div style={{ fontSize: 14, color: '#4A6080', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' }}>
            Once you complete your pilot profile with your licences, ratings, and flight hours,
            we'll automatically match you to open positions and notify you here.
          </div>
        </div>
      )}

      {/* Alert cards */}
      {alerts.map((alert) => {
        const m = matchStyle(alert.matchScore);
        const isOpen = expanded === alert.id;
        const isUnread = !alert.readAt;
        return (
          <div key={alert.id} style={{ marginBottom: 14 }}>
            <div
              style={{
                background: '#0D1E35',
                border: `1px solid ${isUnread ? '#00B4D8' : '#1E3050'}`,
                borderLeft: `4px solid ${isUnread ? '#00B4D8' : '#1E3050'}`,
                borderRadius: isOpen ? '14px 14px 0 0' : 14,
                padding: '20px 24px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20,
                transition: 'border-color 0.2s',
              }}
              onClick={() => handleClick(alert)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  {isUnread && (
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#00B4D8', display: 'inline-block', marginRight: 6,
                    }} />
                  )}
                  {alert.job?.title ?? alert.jobTitle ?? '—'}
                </div>
                <div style={{ fontSize: 14, color: '#00B4D8', fontWeight: 600, marginBottom: 8 }}>
                  {alert.job?.company ?? alert.company ?? '—'}
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  {(alert.job?.location ?? alert.location) && (
                    <span style={{ fontSize: 12, color: '#7A8CA0' }}>📍 {alert.job?.location ?? alert.location}</span>
                  )}
                  {alert.job?.reqAuthorities?.[0] && (
                    <span style={{ fontSize: 12, color: '#7A8CA0' }}>🏛 {alert.job.reqAuthorities[0]}</span>
                  )}
                  {alert.job?.reqMinTotalHours && (
                    <span style={{ fontSize: 12, color: '#7A8CA0' }}>⏱ {alert.job.reqMinTotalHours.toLocaleString()} hrs min</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <button
                  onClick={(e) => handleSaveToggle(e, alert.job?.id)}
                  title={savedMap[alert.job?.id] ? 'Unsave' : 'Save job'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, lineHeight: 1 }}
                >
                  <PlaneSave saved={savedMap[alert.job?.id]} />
                </button>
                <div style={{ textAlign: 'center', minWidth: 90 }}>
                  <div style={{
                    width: 68, height: 68, borderRadius: '50%',
                    border: `3px solid ${m.color}`, background: m.bg,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px',
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: m.color, lineHeight: 1 }}>
                      {Math.round(alert.matchScore)}%
                    </div>
                    <div style={{ fontSize: 9, color: m.color, fontWeight: 700, marginTop: 2 }}>MATCH</div>
                  </div>
                  <div style={{ fontSize: 11, color: m.color, fontWeight: 700 }}>{m.label}</div>
                </div>
              </div>
            </div>

            {isOpen && (
              <div style={{
                background: '#0A2040', border: '1px solid #1E3050', borderTop: 'none',
                borderRadius: '0 0 14px 14px', padding: '20px 24px',
              }}>
                <MatchBreakdown breakdown={alert.breakdown} />
                <div style={{ fontSize: 13, color: '#7A8CA0', lineHeight: 1.8, marginBottom: 16 }}>
                  {(alert.job?.description ?? alert.description ?? '').slice(0, 400)}
                  {(alert.job?.description ?? alert.description ?? '').length > 400 ? '…' : ''}
                </div>
                {(alert.job?.applyUrl ?? alert.applyUrl) && (
                  <a
                    href={alert.job?.applyUrl ?? alert.applyUrl}
                    target="_blank" rel="noreferrer"
                    style={{
                      display: 'inline-block',
                      background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
                      color: '#fff', padding: '8px 18px', borderRadius: 8,
                      fontWeight: 700, fontSize: 13, textDecoration: 'none',
                    }}
                  >
                    Apply for this job →
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── SavedSearchesTab ────────────────────────────────────────────────────────

function SavedSearchesTab() {
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // null | 'new' | { id, ...data }

  const load = useCallback(() => {
    setLoading(true);
    jobApi.getSavedSearches()
      .then(({ data }) => setSearches(data.searches ?? data ?? []))
      .catch(() => setSearches([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    if (modal && modal.id) {
      await jobApi.updateSavedSearch(modal.id, form);
    } else {
      await jobApi.createSavedSearch(form);
    }
    setModal(null);
    load();
  };

  const handleTogglePause = async (s) => {
    await jobApi.updateSavedSearch(s.id, { paused: !s.paused });
    load();
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    await jobApi.deleteSavedSearch(s.id);
    load();
  };

  const rowStyle = {
    background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 12,
    padding: '16px 20px', marginBottom: 10,
    display: 'flex', alignItems: 'center', gap: 14,
  };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button
          onClick={() => setModal('new')}
          style={{
            background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          + New Alert
        </button>
      </div>

      {loading && (
        <div style={{ color: '#7A8CA0', textAlign: 'center', padding: 60 }}>Loading saved searches…</div>
      )}

      {!loading && searches.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#7A8CA0', marginBottom: 10 }}>No saved searches yet</div>
          <div style={{ fontSize: 14, color: '#4A6080', lineHeight: 1.8 }}>
            Create one to get notified automatically.
          </div>
        </div>
      )}

      {searches.map((s) => {
        const freq = FREQ_COLORS[s.frequency] ?? FREQ_COLORS.DAILY;
        return (
          <div key={s.id} style={rowStyle}>
            {/* Name & meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.paused ? '#4A6080' : '#fff', marginBottom: 4 }}>
                {s.name}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                  color: freq.color, background: freq.bg,
                  borderRadius: 6, padding: '2px 8px',
                }}>
                  {s.frequency}
                </span>
                {s.authority && (
                  <span style={{ fontSize: 12, color: '#7A8CA0' }}>{s.authority}</span>
                )}
                {s.aircraftType && (
                  <span style={{ fontSize: 12, color: '#7A8CA0' }}>{s.aircraftType}</span>
                )}
              </div>
            </div>

            {/* Pause toggle */}
            <button
              onClick={() => handleTogglePause(s)}
              title={s.paused ? 'Resume' : 'Pause'}
              style={{
                background: s.paused ? 'rgba(122,140,160,0.12)' : 'rgba(0,180,216,0.12)',
                border: `1px solid ${s.paused ? '#1E3050' : '#00B4D8'}`,
                color: s.paused ? '#7A8CA0' : '#00B4D8',
                borderRadius: 8, padding: '6px 14px', fontSize: 12,
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              {s.paused ? '▶ Resume' : '⏸ Pause'}
            </button>

            {/* Edit */}
            <button
              onClick={() => setModal(s)}
              title="Edit"
              style={{
                background: 'transparent', border: '1px solid #1E3050',
                color: '#7A8CA0', borderRadius: 8, padding: '6px 10px',
                fontSize: 16, cursor: 'pointer',
              }}
            >
              ✏️
            </button>

            {/* Delete */}
            <button
              onClick={() => handleDelete(s)}
              title="Delete"
              style={{
                background: 'transparent', border: '1px solid rgba(231,76,60,0.3)',
                color: '#E74C3C', borderRadius: 8, padding: '6px 10px',
                fontSize: 16, cursor: 'pointer',
              }}
            >
              🗑️
            </button>
          </div>
        );
      })}

      {modal && (
        <SavedSearchModal
          initial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ─── ApplicationsTab ─────────────────────────────────────────────────────────

function ApplicationsTab() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🚀</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#7A8CA0', marginBottom: 10 }}>
        Applications tracking coming soon.
      </div>
      <div style={{ fontSize: 14, color: '#4A6080', lineHeight: 1.8, maxWidth: 360, margin: '0 auto' }}>
        Track every job you've applied to, follow up on status changes, and keep a full history in one place.
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Alerts() {
  const dispatch = useDispatch();
  const alerts = useSelector((s) => s.jobs.alerts);
  const [tab, setTab] = useState('matches');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const matchTriggered = useRef(false);

  const unreadCount = alerts.filter((a) => !a.readAt).length;

  const loadAlerts = React.useCallback((f, s) => {
    setLoading(true);
    return jobApi.getAlerts({ filter: f, sort: s })
      .then(({ data }) => dispatch(setAlerts(data.alerts ?? [])))
      .finally(() => setLoading(false));
  }, [dispatch]);

  useEffect(() => {
    if (!matchTriggered.current) {
      matchTriggered.current = true;
      // Run matching in background, then refresh the list
      jobApi.triggerMatch()
        .then(() => loadAlerts(filter, sort))
        .catch(() => loadAlerts(filter, sort));
    } else {
      loadAlerts(filter, sort);
    }
  }, [filter, sort, loadAlerts]);

  const tabs = [
    { key: 'matches',       label: 'Matches',       badge: unreadCount },
    { key: 'savedSearches', label: 'Saved Searches', badge: 0 },
    { key: 'applications',  label: 'Applications',   badge: 0 },
  ];

  const tabBtn = (t) => {
    const active = tab === t.key;
    return (
      <button
        key={t.key}
        onClick={() => setTab(t.key)}
        style={{
          padding: '9px 22px', borderRadius: 50, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', border: 'none',
          background: active ? '#00B4D8' : 'transparent',
          color: active ? '#0A1628' : '#7A8CA0',
          position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
          transition: 'all 0.2s',
        }}
      >
        {t.label}
        {t.badge > 0 && (
          <span style={{
            background: active ? '#0A1628' : '#00B4D8',
            color: active ? '#00B4D8' : '#0A1628',
            borderRadius: 12, padding: '1px 7px',
            fontSize: 11, fontWeight: 800, lineHeight: '16px',
          }}>
            {t.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ background: '#0A1628', minHeight: '100%' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>My Job Alerts</div>
          <div style={{ color: '#4A6080', fontSize: 13, marginTop: 4 }}>
            Jobs matched to your pilot profile — we notify you automatically when new ones appear
          </div>
        </div>
      </div>

      {/* Tab pills */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 28,
        background: '#0D1E35', borderRadius: 50,
        padding: 5, border: '1px solid #1E3050',
        width: 'fit-content',
      }}>
        {tabs.map(tabBtn)}
      </div>

      {/* Tab content */}
      {tab === 'matches' && (
        loading
          ? <div style={{ color: '#7A8CA0', textAlign: 'center', padding: 60 }}>Loading your alerts…</div>
          : <MatchesTab alerts={alerts} dispatch={dispatch} filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} onRefresh={() => loadAlerts(filter, sort)} />
      )}
      {tab === 'savedSearches' && <SavedSearchesTab />}
      {tab === 'applications'  && <ApplicationsTab />}
    </div>
  );
}
