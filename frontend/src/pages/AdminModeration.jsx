import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { adminApi } from '../services/api';

const FIELD_LABELS = {
  headquarters:        'Headquarters',
  description:         'Description',
  bases:               'Bases',
  fleet:               'Fleet',
  fleetDetail:         'Fleet (detailed)',
  hiringStatus:        'Hiring Status',
  hiringFrequency:     'Hiring Frequency',
  payRanges:           'Pay Ranges',
  rosterPattern:       'Roster Pattern',
  contractType:        'Contract Type',
  workAuthRequired:    'Work Auth Required',
  avgResponseDays:     'Avg Response Days',
  interviewStages:     'Interview Stages',
  simType:             'Sim Type',
  upgradeTimeMinYears: 'Upgrade Min Years',
  upgradeTimeMaxYears: 'Upgrade Max Years',
  notes:               'Notes',
  region:              'Region',
};

function fmtValue(v) {
  if (v === null || v === undefined) return <span style={{ color: '#4A6080', fontStyle: 'italic' }}>—</span>;
  if (Array.isArray(v)) return v.length ? v.join(', ') : <span style={{ color: '#4A6080', fontStyle: 'italic' }}>[ empty ]</span>;
  if (typeof v === 'object')  return JSON.stringify(v, null, 2);
  return String(v);
}

function relTime(d) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ContributorTag({ ctx }) {
  const parts = [];
  if (ctx.role)    parts.push(ctx.role === 'FIRST_OFFICER' ? 'FO' : ctx.role === 'CAPTAIN' ? 'CPT' : ctx.role);
  if (ctx.country) parts.push(ctx.country);
  parts.push(`${ctx.approvedCount} approved`);
  return <span style={{ fontSize: 11, color: '#7A8CA0' }}>{parts.join(' · ')}</span>;
}

// Minimal readable diff for the structured fleetDetail array, matched by `type`.
function fleetDetailLines(before, after) {
  const b = Array.isArray(before) ? before : [];
  const a = Array.isArray(after)  ? after  : [];
  const bm = Object.fromEntries(b.map((r) => [r.type, r]));
  const am = Object.fromEntries(a.map((r) => [r.type, r]));
  const c = (v) => (v == null ? '—' : v);
  const lines = [];
  for (const r of b) if (!(r.type in am)) lines.push(`Removed: ${r.type} (was ${c(r.inService)} in service)`);
  for (const r of a) if (!(r.type in bm)) lines.push(`Added: ${r.type} (${c(r.inService)} in service / ${c(r.ordered)} on order / ${c(r.retired)} retired)`);
  for (const r of a) {
    const o = bm[r.type];
    if (!o) continue;
    const parts = [];
    if ((o.inService ?? null) !== (r.inService ?? null)) parts.push(`in service ${c(o.inService)} → ${c(r.inService)}`);
    if ((o.ordered   ?? null) !== (r.ordered   ?? null)) parts.push(`on order ${c(o.ordered)} → ${c(r.ordered)}`);
    if ((o.retired   ?? null) !== (r.retired   ?? null)) parts.push(`retired ${c(o.retired)} → ${c(r.retired)}`);
    if (parts.length) lines.push(`Changed: ${r.type} (${parts.join(', ')})`);
  }
  return lines;
}

function DiffRow({ field, airline, proposed }) {
  const current = airline[field];
  if (field === 'fleetDetail') {
    const lines = fleetDetailLines(current, proposed);
    return (
      <div style={{ borderBottom: '1px solid #1B2B4B', padding: '8px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4A6080', marginBottom: 4 }}>Fleet (detailed)</div>
        {lines.length === 0
          ? <div style={{ fontSize: 12, color: '#4A6080', fontStyle: 'italic' }}>No effective changes</div>
          : lines.map((l, i) => <div key={i} style={{ fontSize: 13, color: '#C8D8E8', lineHeight: 1.6 }}>{l}</div>)}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1B2B4B', padding: '8px 0', flexWrap: 'wrap' }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#4A6080', paddingTop: 1 }}>
        {FIELD_LABELS[field] || field}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 13, color: '#4A6080', maxWidth: '45%', wordBreak: 'break-word' }}>
          {fmtValue(current)}
        </span>
        <span style={{ color: '#2A3C55', fontSize: 13 }}>→</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#C8D8E8', maxWidth: '45%', wordBreak: 'break-word' }}>
          {fmtValue(proposed)}
        </span>
      </div>
    </div>
  );
}

function ContributionCard({ item, onApprove, onReject }) {
  const [expanded,   setExpanded]   = useState(true);
  const [rejecting,  setRejecting]  = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState(null);

  const fields = Object.keys(item.proposedChanges);

  const handleApprove = async () => {
    setBusy(true); setError(null);
    try {
      await onApprove(item.id);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to approve.');
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) { setError('Rejection note is required.'); return; }
    setBusy(true); setError(null);
    try {
      await onReject(item.id, rejectNote.trim());
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to reject.');
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 14,
      marginBottom: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        borderBottom: expanded ? '1px solid #1E3050' : 'none',
        cursor: 'pointer',
      }} onClick={() => setExpanded((v) => !v)}>
        <div style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link
              to={`/airlines/${item.airline.id}`}
              style={{ fontSize: 15, fontWeight: 700, color: '#00B4D8', textDecoration: 'none' }}
              onClick={(e) => e.stopPropagation()}
            >
              {item.airline.name}
            </Link>
            <span style={{
              fontSize: 11, fontWeight: 700, background: 'rgba(243,156,18,0.15)',
              color: '#F39C12', border: '1px solid rgba(243,156,18,0.3)',
              borderRadius: 5, padding: '1px 7px',
            }}>
              {fields.length} field{fields.length !== 1 ? 's' : ''} changed
            </span>
            <span style={{ fontSize: 12, color: '#4A6080' }}>{relTime(item.createdAt)}</span>
          </div>
          <ContributorTag ctx={item.contributorContext} />
        </div>
        <span style={{ color: '#4A6080', fontSize: 12 }}>{expanded ? '▲ collapse' : '▼ expand'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '16px 20px' }}>
          {/* Diff */}
          <div style={{ marginBottom: 16 }}>
            {fields.map((field) => (
              <DiffRow
                key={field}
                field={field}
                airline={item.airline}
                proposed={item.proposedChanges[field]}
              />
            ))}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#E74C3C', marginBottom: 10 }}>{error}</div>
          )}

          {/* Actions */}
          {rejecting ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '8px 12px', borderRadius: 8,
                  background: '#0A1628', border: '1px solid #2A3C55',
                  color: '#fff', fontSize: 13, resize: 'vertical', minHeight: 72, outline: 'none',
                }}
                placeholder="Rejection reason (required, max 500 chars)…"
                maxLength={500}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  style={btnStyle('#2A3C55', '#7A8CA0')}
                  disabled={busy}
                  onClick={() => { setRejecting(false); setRejectNote(''); setError(null); }}
                >
                  Cancel
                </button>
                <button style={btnStyle('#C0392B', '#fff')} disabled={busy} onClick={handleReject}>
                  {busy ? 'Rejecting…' : 'Confirm reject'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button style={btnStyle('#C0392B', '#fff')} disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </button>
              <button style={btnStyle('#27AE60', '#fff')} disabled={busy} onClick={handleApprove}>
                {busy ? 'Approving…' : 'Approve'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function btnStyle(bg, color) {
  return {
    padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
    background: bg, border: 'none', color, cursor: 'pointer',
  };
}

export default function AdminModeration() {
  const navigate = useNavigate();
  const [data,    setData]    = useState({ items: [], total: 0, page: 1, totalPages: 1 });
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const { data: res } = await adminApi.getContributions({ page: p, limit: 25 });
      setData(res);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 401) {
        navigate('/jobs', { replace: true });
      } else {
        setError('Failed to load contributions.');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(page); }, [load, page]);

  const handleApprove = useCallback(async (id) => {
    await adminApi.approve(id);
    setData((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.id !== id),
      total: prev.total - 1,
    }));
  }, []);

  const handleReject = useCallback(async (id, note) => {
    await adminApi.reject(id, note);
    setData((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.id !== id),
      total: prev.total - 1,
    }));
  }, []);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
            Moderation Queue
            {!loading && (
              <span style={{ fontSize: 14, fontWeight: 600, color: '#F39C12', marginLeft: 10 }}>
                {data.total} pending
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#4A6080', marginTop: 2 }}>
            Contributions are applied immediately on approval and cannot be undone here.
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: '#4A6080', padding: 60 }}>Loading…</div>
      )}

      {error && (
        <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 10, padding: '12px 16px', color: '#E74C3C', fontSize: 14 }}>
          {error}
        </div>
      )}

      {!loading && !error && data.items.length === 0 && (
        <div style={{ textAlign: 'center', color: '#4A6080', padding: '60px 20px', fontSize: 14 }}>
          No pending contributions. The queue is clear.
        </div>
      )}

      {!loading && data.items.map((item) => (
        <ContributionCard
          key={item.id}
          item={item}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ))}

      {data.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
          <button
            style={{ ...btnStyle('#1B2B4B', '#7A8CA0'), opacity: page <= 1 ? 0.4 : 1 }}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: '#4A6080' }}>
            {data.page} / {data.totalPages}
          </span>
          <button
            style={{ ...btnStyle('#1B2B4B', '#7A8CA0'), opacity: page >= data.totalPages ? 0.4 : 1 }}
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
