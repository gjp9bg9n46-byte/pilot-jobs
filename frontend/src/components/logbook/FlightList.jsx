import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react';

// Web flight list (desktop/iPad table + mobile two-line rows), grouped by month.
// Month subtotals come from summary.months (server truth) — never summed from the
// loaded rows, which are paginated. During an active search, headers show only
// "{n} matches" (hours hidden so it doesn't read as a filtered total).

const SEM_RED = '#991B1B';
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function timeToMinutes(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function blockDisplay(log) {
  const off = timeToMinutes(log.offBlocksTime), on = timeToMinutes(log.onBlocksTime);
  if (off !== null && on !== null) {
    const diff = on >= off ? on - off : 1440 - off + on;
    return `${(diff / 60).toFixed(1)}h`;
  }
  return log.totalTime > 0 ? `${log.totalTime.toFixed(1)}h` : '—';
}
function roleOf(log) {
  const pic = log.picTime || 0, sic = log.sicTime || 0;
  if (pic <= 0 && sic <= 0) return '';
  return pic >= sic ? 'PIC' : 'SIC';
}
const acType = (log) => log.aircraftType || log.displayType || '';
const ymKey = (d) => new Date(d).toISOString().slice(0, 7);
const dayMonYear = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const dayMon = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTHS_LONG[+m - 1]} ${y}`.toUpperCase();
}

// Group an ordered (desc) list of flights into [{ ym, flights }].
function groupByMonth(list) {
  const out = [];
  let cur = null;
  for (const log of list) {
    const ym = ymKey(log.date);
    if (!cur || cur.ym !== ym) { cur = { ym, flights: [] }; out.push(cur); }
    cur.flights.push(log);
  }
  return out;
}

function RowMenu({ log, onEdit, onClone, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const item = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 0, fontSize: 13.5, color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' };
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button aria-label="Flight actions" onClick={() => setOpen((v) => !v)}
        style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-secondary)', padding: 6, borderRadius: 6, lineHeight: 0 }}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 150, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,20,25,0.12)', zIndex: 20, overflow: 'hidden', padding: '4px 0' }}>
          <button style={item} onClick={() => { setOpen(false); onEdit(); }}><Pencil size={15} style={{ color: 'var(--accent)' }} /> Edit</button>
          <button style={item} onClick={() => { setOpen(false); onClone(); }}><Copy size={15} style={{ color: 'var(--text-secondary)' }} /> Duplicate</button>
          <button style={{ ...item, color: SEM_RED }} onClick={() => { setOpen(false); onDelete(); }}><Trash2 size={15} /> Delete</button>
        </div>
      )}
    </div>
  );
}

export default function FlightList({ dataset, summary, isMobile, dropNight, searching, searchQuery, onEdit, onClone, onDelete }) {
  const monthsIndex = React.useMemo(() => {
    const map = {};
    (summary?.months || []).forEach((m) => { map[m.month] = m; });
    return map;
  }, [summary]);

  if (!dataset || dataset.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '52px 16px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
        {searching ? `No flights match "${searchQuery}".` : 'No flights logged yet. Click "+ Log a flight" to get started.'}
      </div>
    );
  }

  const groups = groupByMonth(dataset);

  // Empty-column hiding. Night/Ldg use all-flights totals (stable across pages);
  // Role uses the loaded set. iPad (dropNight) always hides Night.
  const showRole = dataset.some((l) => roleOf(l));
  const showNight = !dropNight && (summary?.totals?.night || 0) > 0;
  const showLdg = (summary?.totals?.landings || 0) > 0;

  const MonthHeader = ({ ym, count }) => {
    const m = monthsIndex[ym];
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '14px 4px 8px' }}>
        <span>{monthLabel(ym)}</span>
        {searching
          ? <span>{count} {count === 1 ? 'match' : 'matches'}</span>
          : m ? <span><span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{m.hours.toFixed(1)} h</span> · {m.flights} {m.flights === 1 ? 'flight' : 'flights'}</span> : null}
      </div>
    );
  };

  // ── Mobile: two-line rows ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        {groups.map((g) => (
          <div key={g.ym}>
            <MonthHeader ym={g.ym} count={g.flights.length} />
            {g.flights.map((log) => {
              const role = roleOf(log);
              return (
                <div key={log.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', marginBottom: 6 }}
                  onClick={() => onEdit(log)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.2 }}>
                      {log.departure || '—'}<span style={{ color: 'var(--accent)', margin: '0 6px' }}>&#x2192;</span>{log.arrival || '—'}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{blockDisplay(log)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                    {dayMon(log.date)}
                    {acType(log) ? <> · {acType(log)}{log.registration ? ` ${log.registration}` : ''}</> : (log.registration ? ` · ${log.registration}` : '')}
                    {role ? ` · ${role}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // ── Desktop / iPad: table ─────────────────────────────────────────────────
  const cols = ['Date', 'Aircraft', 'Route', 'Block', ...(showRole ? ['Role'] : []), ...(showNight ? ['Night'] : []), ...(showLdg ? ['Ldg'] : []), ''];
  const th = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 14px 8px', textAlign: 'left' };
  const td = { padding: '9px 14px', fontSize: 14, color: 'var(--text-primary)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface)' };
  const tdFirst = { borderLeft: '1px solid var(--border)', borderRadius: '10px 0 0 10px', paddingLeft: 18 };
  const tdLast = { borderRight: '1px solid var(--border)', borderRadius: '0 10px 10px 0', paddingRight: 14, textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', maxWidth: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', minWidth: 640 }}>
        <thead>
          <tr>{cols.map((c, i) => <th key={i} style={{ ...th, textAlign: i >= 3 && c ? 'left' : th.textAlign }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <React.Fragment key={g.ym}>
              <tr>
                <td colSpan={cols.length} style={{ padding: 0, border: 0, background: 'transparent' }}>
                  <MonthHeader ym={g.ym} count={g.flights.length} />
                </td>
              </tr>
              {g.flights.map((log) => (
                <tr key={log.id}>
                  <td style={{ ...td, ...tdFirst, color: 'var(--text-secondary)', fontSize: 12 }}>{dayMonYear(log.date)}</td>
                  <td style={td}>
                    <span style={{ fontWeight: 700 }}>{acType(log) || '—'}</span>
                    {log.registration ? <span style={{ color: 'var(--text-secondary)' }}> · {log.registration}</span> : null}
                  </td>
                  <td style={td}>
                    {(log.departure || log.arrival)
                      ? <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.2 }}>{log.departure}<span style={{ color: 'var(--accent)', margin: '0 5px' }}>&#x2192;</span>{log.arrival}</span>
                      : <span style={{ color: 'var(--text-secondary)' }}>&#x2014;</span>}
                  </td>
                  <td style={{ ...td, color: 'var(--accent)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{blockDisplay(log)}</td>
                  {showRole && <td style={td}>{roleOf(log) || '—'}</td>}
                  {showNight && <td style={td}>{log.nightTime > 0 ? `${log.nightTime.toFixed(1)}h` : '—'}</td>}
                  {showLdg && <td style={td}>{(log.landingsDay || 0) + (log.landingsNight || 0) || '—'}</td>}
                  <td style={{ ...td, ...tdLast }}>
                    <RowMenu log={log} onEdit={() => onEdit(log)} onClone={() => onClone(log)} onDelete={() => onDelete(log.id)} />
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
