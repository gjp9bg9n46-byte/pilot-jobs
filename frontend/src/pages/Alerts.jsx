import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { MapPin, Building2, Search, Trash2, Bell, Pencil, Rocket, Play, Pause, AlertTriangle } from 'lucide-react';
import { jobApi } from '../services/api';
import { setAlerts, markAlertRead, markAllAlertsRead } from '../store';
import { useIsMobile } from '../hooks/useIsMobile';
import { LightPage, Input, Button, Badge, Modal } from '../components/primitives';

// Semantic status colors remapped to light-AA shades (meaning preserved):
//   dark #2ECC71 → #166534 (matched), #F39C12 → #92400E (marginal/warn),
//   #E74C3C → #991B1B (missing/error). Matches the Badge palette.
const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

// NOTE: byte-identical to the PlaneSave in Jobs.jsx (saved=accent / unsaved=secondary).
// Page-local copy in both files; dedupe to a shared component at a 3rd consumer.
function PlaneSave({ saved, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={saved ? 'var(--accent)' : 'none'} stroke={saved ? 'var(--accent)' : 'var(--text-secondary)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Top-down commercial airplane silhouette */}
      <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 12 2a1.5 1.5 0 0 0-1.5 1.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function pillColor(key, structured) {
  const s = structured?.[key];
  if (s === 'matched')  return { color: SEM.green, bg: '#DCFCE7' };
  if (s === 'missing')  return { color: SEM.red,   bg: '#FEE2E2' };
  if (s === 'marginal') return { color: SEM.amber, bg: '#FEF3C7' };
  return { color: 'var(--text-secondary)', bg: 'var(--bg)' };
}

// Match tier → label + semantic color (Phase-8 light-AA palette). The badge is
// now a pure typographic lockup (no ring/fill/border) — only color + label used.
function matchStyle(score) {
  if (score >= 90) return { label: 'Excellent Match', color: '#166534' };
  if (score >= 75) return { label: 'Great Match',     color: '#1E40AF' };
  if (score >= 60) return { label: 'Good Match',      color: '#92400E' };
  return              { label: 'Partial Match',    color: '#374151' };
}

const AUTHORITIES = [
  { value: 'FAA',  label: 'FAA' },
  { value: 'EASA', label: 'EASA' },
  { value: 'CAA',  label: 'UK CAA' },
  { value: 'TCCA', label: 'Transport Canada' },
  { value: 'CAAC', label: 'CAAC' },
  { value: 'ICAO', label: 'ICAO' },
  { value: 'FATA', label: 'Russia/CIS' },
];

// Saved-search frequency → Badge variant (INSTANT=success / DAILY=info / WEEKLY=warning)
const FREQ_VARIANT = { INSTANT: 'success', DAILY: 'info', WEEKLY: 'warning' };

// ─── MatchBreakdown ──────────────────────────────────────────────────────────

function MatchBreakdown({ breakdown }) {
  const isMobile = useIsMobile();
  if (!breakdown) return null;
  const cols = [
    { label: 'Matched',  items: breakdown.matched  ?? [], icon: '✓', color: SEM.green, bg: '#F0FDF4' },
    { label: 'Marginal', items: breakdown.marginal ?? [], icon: '~', color: SEM.amber, bg: '#FFFBEB' },
    { label: 'Missing',  items: breakdown.missing  ?? [], icon: '✗', color: SEM.red,   bg: '#FEF2F2' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
      {cols.map((col) => (
        <div key={col.label} style={{ background: col.bg, border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: col.color, letterSpacing: 1, marginBottom: 8 }}>
            {col.icon} {col.label.toUpperCase()}
          </div>
          {col.items.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>—</div>
          ) : (
            col.items.map((item) => (
              <div key={item} style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{item}</div>
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

  return (
    <Modal isOpen onClose={onClose} title={initial ? 'Edit Saved Search' : 'New Saved Search'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Input
          label="Name" placeholder="e.g. A320 Captain EU"
          value={form.name} onChange={(e) => set('name', e.target.value)}
        />
        <Input as="select" label="Frequency" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
          <option value="INSTANT">Instant — notify immediately</option>
          <option value="DAILY">Daily digest</option>
          <option value="WEEKLY">Weekly digest</option>
        </Input>
        <Input as="select" label="Authority (optional)" value={form.authority} onChange={(e) => set('authority', e.target.value)}>
          <option value="">Any authority</option>
          {AUTHORITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </Input>
        <Input
          label="Aircraft Type (optional)" placeholder="e.g. A320, B737, ATR72"
          value={form.aircraftType} onChange={(e) => set('aircraftType', e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 28 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </Modal>
  );
}

// ─── MatchesTab ──────────────────────────────────────────────────────────────

function MatchesTab({ alerts, dispatch, filter, setFilter, sort, setSort, onRefresh, isMobile }) {
  const [expanded, setExpanded] = useState(null);
  const [hovered, setHovered] = useState(null);
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
    try {
      await jobApi.markAllAlertsRead();
      dispatch(markAllAlertsRead());
    } finally { setMarkingAll(false); }
  };

  const chips = [
    { key: 'all',       label: 'All' },
    { key: 'unread',    label: 'Unread' },
    { key: 'saved',     label: 'Saved' },
    { key: 'dismissed', label: 'Dismissed' },
  ];

  const unreadCount = alerts.filter((a) => !a.readAt).length;

  const chipStyle = (active) => ({
    padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    background: active ? 'rgba(0,63,136,0.06)' : 'var(--surface)',
    fontFamily: 'var(--font-body)', transition: 'all 0.15s',
  });

  return (
    <div>
      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {chips.map((c) => (
            <button key={c.key} style={chipStyle(filter === c.key)} onClick={() => setFilter(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <Input as="select" aria-label="Sort alerts" value={sort} onChange={(e) => setSort(e.target.value)} style={{ fontSize: 13, padding: '8px 12px' }}>
          <option value="newest">Newest</option>
          <option value="score">Best Match</option>
          <option value="deadline">Deadline</option>
        </Input>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={handleMarkAll} disabled={markingAll}>
            {markingAll ? 'Marking…' : 'Mark all read'}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {alerts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ marginBottom: 16 }}><Bell size={56} color="var(--text-secondary)" /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 10 }}>No alerts yet</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' }}>
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
        const isHover = hovered === alert.id;
        return (
          <div key={alert.id} style={{ marginBottom: 14 }}>
            <div
              style={{
                background: isHover ? 'rgba(0,63,136,0.04)' : 'var(--surface)',
                border: `1px solid ${isUnread ? 'var(--accent)' : 'var(--border)'}`,
                borderLeft: `4px solid ${isUnread ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: isOpen ? '14px 14px 0 0' : 14,
                padding: isMobile ? '14px 14px' : '20px 24px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: isMobile ? 10 : 20,
                transition: 'border-color 0.2s, background 0.15s',
              }}
              onMouseEnter={() => setHovered(alert.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleClick(alert)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {isUnread && (
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--accent)', display: 'inline-block', marginRight: 6,
                    }} />
                  )}
                  {alert.job?.title ?? alert.jobTitle ?? '—'}
                </div>
                <div style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>
                  {alert.job?.company ?? alert.company ?? '—'}
                </div>
                <div style={{ display: 'flex', gap: 20, marginBottom: 8 }}>
                  {(alert.job?.location ?? alert.location) && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {alert.job?.location ?? alert.location}</span>
                  )}
                  {alert.job?.reqAuthorities?.[0] && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><Building2 size={11} /> {alert.job.reqAuthorities[0]}</span>
                  )}
                </div>
                {(() => {
                  const job = alert.job;
                  if (!job) return null;
                  const st = alert.breakdown?.structured;
                  const pills = [];
                  if (job.role) {
                    const roleLabels = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', FLIGHT_ENGINEER: 'Flight Engineer', INSTRUCTOR: 'Instructor' };
                    pills.push({ key: 'role', text: roleLabels[job.role] || job.role, color: 'var(--accent)', bg: 'rgba(0,63,136,0.08)' });
                  }
                  if (job.contractType) {
                    const ctLabels = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', acmi: 'ACMI', permanent: 'Permanent' };
                    pills.push({ key: 'ct', text: ctLabels[job.contractType] || job.contractType, color: 'var(--text-secondary)', bg: 'var(--bg)' });
                  }
                  (job.reqAircraftTypes || []).forEach((a) => pills.push({ key: `ac-${a}`, text: a, ...pillColor('aircraftType', st) }));
                  (job.reqCertificates || []).forEach((c) => pills.push({ key: `cert-${c}`, text: c, ...pillColor('certificate', st) }));
                  if (job.reqMinTotalHours) pills.push({ key: 'th', text: `${job.reqMinTotalHours.toLocaleString()} hrs total`, ...pillColor('totalHours', st) });
                  if (job.reqMinPicHours) pills.push({ key: 'pic', text: `${job.reqMinPicHours.toLocaleString()} PIC`, ...pillColor('picHours', st) });
                  if (job.reqMinMultiEngineHours) pills.push({ key: 'me', text: `${job.reqMinMultiEngineHours.toLocaleString()} multi-eng`, ...pillColor('multiEngineHours', st) });
                  if (job.reqMinTurbineHours) pills.push({ key: 'turb', text: `${job.reqMinTurbineHours.toLocaleString()} turbine`, ...pillColor('turbineHours', st) });
                  if (job.reqMedicalClass) pills.push({ key: 'med', text: job.reqMedicalClass.replace('CLASS_', 'Class '), ...pillColor('medical', st) });
                  if (job.salaryMin && job.salaryMax) {
                    pills.push({ key: 'sal', text: `${job.salaryCurrency || 'USD'} ${job.salaryMin.toLocaleString()}–${job.salaryMax.toLocaleString()}`, color: SEM.green, bg: '#DCFCE7' });
                  } else if (job.salaryMin) {
                    pills.push({ key: 'sal', text: `${job.salaryCurrency || 'USD'} ${job.salaryMin.toLocaleString()}+`, color: SEM.green, bg: '#DCFCE7' });
                  }
                  if (pills.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {pills.map((p) => (
                        <span key={p.key} style={{ fontSize: 11, color: p.color, background: p.bg, borderRadius: 6, padding: '3px 9px', fontWeight: 600 }}>
                          {p.text}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16, flexShrink: 0 }}>
                <button
                  onClick={(e) => handleSaveToggle(e, alert.job?.id)}
                  title={savedMap[alert.job?.id] ? 'Unsave job' : 'Save job'}
                  aria-label={savedMap[alert.job?.id] ? 'Unsave job' : 'Save job'}
                  aria-pressed={!!savedMap[alert.job?.id]}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1 }}
                >
                  <PlaneSave saved={savedMap[alert.job?.id]} size={28} />
                </button>
                {/* Match score — editorial typographic lockup (no ring/fill/border) */}
                <div style={{ textAlign: 'right', minWidth: isMobile ? 64 : 80 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 26 : 32, fontWeight: 600, color: m.color, lineHeight: 1 }}>
                    {Math.round(alert.matchScore)}%
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: m.color, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>
                    {m.label}
                  </div>
                </div>
              </div>
            </div>

            {isOpen && (
              <div style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderTop: 'none',
                borderRadius: '0 0 14px 14px', padding: '20px 24px',
              }}>
                <MatchBreakdown breakdown={alert.breakdown} />
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 }}>
                  {(alert.job?.description ?? alert.description ?? '').slice(0, 400)}
                  {(alert.job?.description ?? alert.description ?? '').length > 400 ? '…' : ''}
                </div>
                {(alert.job?.applyUrl ?? alert.applyUrl) && (
                  <a
                    href={alert.job?.applyUrl ?? alert.applyUrl}
                    target="_blank" rel="noreferrer"
                    style={{
                      display: 'inline-block', background: 'var(--accent)',
                      color: '#fff', padding: '8px 18px', borderRadius: 4,
                      fontWeight: 500, fontSize: 13, textDecoration: 'none', fontFamily: 'var(--font-body)',
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
  const [pendingDelete, setPendingDelete] = useState(null); // { label, fn }

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

  const handleDelete = (s) => setPendingDelete({
    label: s.name,
    fn: async () => { await jobApi.deleteSavedSearch(s.id); load(); },
  });

  const rowStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
    padding: '16px 20px', marginBottom: 10,
    display: 'flex', alignItems: 'center', gap: 14,
  };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <Button onClick={() => setModal('new')}>+ New Saved Search</Button>
      </div>

      {loading && (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 60 }}>Loading saved searches…</div>
      )}

      {!loading && searches.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ marginBottom: 16 }}><Search size={48} color="var(--text-secondary)" /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 10 }}>No saved searches yet</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            Create one to get notified automatically.
          </div>
        </div>
      )}

      {searches.map((s) => (
        <div key={s.id} style={rowStyle}>
          {/* Name & meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: s.paused ? 'var(--text-secondary)' : 'var(--text-primary)', marginBottom: 4 }}>
              {s.name}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge variant={FREQ_VARIANT[s.frequency] ?? 'info'} style={{ fontWeight: 800, letterSpacing: 0.5 }}>
                {s.frequency}
              </Badge>
              {s.authority && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.authority}</span>
              )}
              {s.aircraftType && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.aircraftType}</span>
              )}
            </div>
          </div>

          {/* Pause toggle */}
          <button
            onClick={() => handleTogglePause(s)}
            title={s.paused ? 'Resume' : 'Pause'}
            style={{
              background: s.paused ? 'var(--surface)' : 'rgba(0,63,136,0.06)',
              border: `1px solid ${s.paused ? 'var(--border)' : 'var(--accent)'}`,
              color: s.paused ? 'var(--text-secondary)' : 'var(--accent)',
              borderRadius: 8, padding: '6px 14px', fontSize: 12,
              fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            {s.paused ? <><Play size={11} /> Resume</> : <><Pause size={11} /> Pause</>}
          </button>

          {/* Edit */}
          <button
            onClick={() => setModal(s)}
            title="Edit"
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', borderRadius: 8, padding: '6px 10px',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
            }}
          >
            <Pencil size={15} />
          </button>

          {/* Delete */}
          <button
            onClick={() => handleDelete(s)}
            title="Delete"
            style={{
              background: 'transparent', border: `1px solid ${SEM.red}`,
              color: SEM.red, borderRadius: 8, padding: '6px 10px',
              fontSize: 16, cursor: 'pointer',
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      {modal && (
        <SavedSearchModal
          initial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      <Modal isOpen={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete saved search?">
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 0 }}>
          Delete “{pendingDelete?.label}”? This can't be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <Button variant="danger" onClick={() => { const fn = pendingDelete.fn; setPendingDelete(null); fn(); }}>Delete</Button>
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── ApplicationsTab ─────────────────────────────────────────────────────────

function ApplicationsTab() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0' }}>
      <div style={{ marginBottom: 16 }}><Rocket size={56} color="var(--text-secondary)" /></div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 10 }}>
        Applications tracking coming soon.
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, maxWidth: 360, margin: '0 auto' }}>
        Track every job you've applied to, follow up on status changes, and keep a full history in one place.
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Alerts() {
  const dispatch = useDispatch();
  const alerts = useSelector((s) => s.jobs.alerts);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('matches');
  const [loading, setLoading] = useState(true); // start true so the empty state never flashes before the first load settles
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const matchTriggered = useRef(false);

  const unreadCount = alerts.filter((a) => !a.readAt).length;

  const loadAlerts = React.useCallback((f, s) => {
    setLoading(true);
    setError(null);
    return jobApi.getAlerts({ filter: f, sort: s })
      .then(({ data }) => dispatch(setAlerts(data.alerts ?? [])))
      .catch((err) => setError(err?.response?.data?.error || err?.message || 'Failed to load alerts'))
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
          padding: '9px 22px', borderRadius: 50, fontSize: 14, fontWeight: 600,
          cursor: 'pointer', border: 'none',
          background: active ? 'var(--accent)' : 'transparent',
          color: active ? '#fff' : 'var(--text-secondary)',
          position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-body)', transition: 'all 0.2s',
        }}
      >
        {t.label}
        {t.badge > 0 && (
          <span style={{
            background: active ? '#fff' : 'var(--accent)',
            color: active ? 'var(--accent)' : '#fff',
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
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      {/* Page header */}
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>Alerts</h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 28 }}>Cockpit roles, matched to your profile.</p>

      {/* Tab pills */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 28,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 50,
        padding: 5, width: 'fit-content',
      }}>
        {tabs.map(tabBtn)}
      </div>

      {/* Tab content */}
      {tab === 'matches' && (
        loading
          ? <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 60 }}>Loading your alerts…</div>
          : error
            ? (
              <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-secondary)' }}>
                <div style={{ marginBottom: 16 }}><AlertTriangle size={48} color={SEM.amber} /></div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>Could not load alerts</div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>{error}</div>
                <div style={{ marginTop: 20 }}><Button onClick={() => loadAlerts(filter, sort)}>Retry</Button></div>
              </div>
            )
            : <MatchesTab alerts={alerts} dispatch={dispatch} filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} onRefresh={() => loadAlerts(filter, sort)} isMobile={isMobile} />
      )}
      {tab === 'savedSearches' && <SavedSearchesTab />}
      {tab === 'applications'  && <ApplicationsTab />}
    </LightPage>
  );
}
