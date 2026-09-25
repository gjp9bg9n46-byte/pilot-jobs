import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './LogbookDashboard.css';

// Hours dashboard shared shell (web). Renders entirely from the /logbook/summary
// payload — no placeholder numbers. See docs/design/logbook-totals-mockup.html.

const fmtH = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');
const monthYear = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

export default function LogbookDashboard({ summary, onEditCarryForward }) {
  const [open, setOpen] = useState(false);
  if (!summary) return null;
  const { totals, byType, milestone, limits, currency } = summary;

  // ── Total time ──────────────────────────────────────────────────────────
  const cf = totals.carryForward || 0;
  const split = totals.picSicSplitValid;
  const picPct = split && (totals.pic + totals.sic) > 0 ? (totals.pic / (totals.pic + totals.sic)) * 100 : 0;

  const cats = [
    ['Multi-engine', totals.multiEngine],
    ['Turbine', totals.turbine],
    ['Night', totals.night],
    ['IFR', totals.ifr],
    ['Landings', totals.landings],
  ].filter(([, v]) => v > 0);

  // ── Milestone track geometry ────────────────────────────────────────────
  const next = milestone.next;
  const scale = next || milestone.current || 1;
  const pos = (h) => Math.min(99.5, Math.max(0, (h / scale) * 100));
  const youPct = Math.min(100, Math.max(0, (milestone.current / scale) * 100));
  const ticks = [
    ...milestone.passed.map((p) => ({ hours: p.hours, top: p.hours.toLocaleString(), bot: p.label, done: true })),
    ...(next ? [{ hours: next, top: next.toLocaleString(), bot: 'Next', done: false, isNext: true }] : []),
  ];
  const lastPassedWithDate = [...milestone.passed].reverse().find((p) => p.date);

  return (
    <div className={`lb-dash${open ? ' open' : ''}`}>
      <div className="lb-card lb-hero">
        {/* 1 · TOTAL TIME */}
        <section className="s-total">
          <div className="label">Total time</div>
          <div className="lb-big"><span className="n">{fmtH(totals.total)}</span><span className="u">hours</span></div>
          <div className="fine">
            {cf > 0 ? <>Includes {fmtH(cf)} h carried forward · </> : <>Add previous / carry-forward hours · </>}
            <a href="#" onClick={(e) => { e.preventDefault(); onEditCarryForward && onEditCarryForward(); }}>Edit</a>
          </div>

          {split && (
            <>
              <div className="lb-split">
                <i style={{ width: `${picPct}%`, background: 'var(--accent)' }} />
                <i style={{ width: `${100 - picPct}%`, background: 'var(--sic)' }} />
              </div>
              <div className="lb-legend">
                <span><span className="lb-dot" style={{ background: 'var(--accent)' }} />PIC<b>{fmtH(totals.pic)}</b></span>
                <span><span className="lb-dot" style={{ background: 'var(--sic)' }} />SIC<b>{fmtH(totals.sic)}</b></span>
              </div>
            </>
          )}

          {cats.length > 0 && (
            <div className="lb-conds">
              {cats.map(([lab, val]) => (
                <span key={lab}>{lab}<b>{lab === 'Landings' ? fmtInt(val) : fmtH(val)}</b></span>
              ))}
            </div>
          )}
        </section>

        {/* 2 · NEXT MILESTONE */}
        <section className="s-ms">
          <div className="label">Next milestone</div>
          {next ? (
            <div className="lb-ms-title"><span className="num">{fmtH(milestone.remaining)} h</span> to {next.toLocaleString()} hours</div>
          ) : (
            <div className="lb-ms-title">Top of the ladder reached</div>
          )}
          {lastPassedWithDate && (
            <div className="fine">You passed the {lastPassedWithDate.label} mark in {monthYear(lastPassedWithDate.date)}.</div>
          )}
          <div className="lb-track">
            <div className="fill" style={{ width: `${youPct}%` }} />
            {ticks.map((t) => {
              const p = pos(t.hours);
              const align = t.isNext ? 'end' : (p >= 60 ? 'r' : '');
              return (
                <div key={t.hours} className={`lb-tick${t.done ? ' done' : ''}`} style={{ left: `${p}%` }}>
                  <span className={align}>{t.top}<br />{t.bot}</span>
                </div>
              );
            })}
            <div className="lb-you" style={{ left: `${youPct}%` }}>You · {fmtH(milestone.current)}</div>
          </div>
          {milestone.jobsUnlocked > 0 && next && (
            <div className="lb-jobs">
              <b>+{milestone.jobsUnlocked}</b>
              <span>more jobs on CockpitHire ask for {next.toLocaleString()} h</span>
              <Link to={`/jobs?hoursMin=${Math.floor(milestone.current)}&hoursMax=${next}`}>See them →</Link>
            </div>
          )}
        </section>

        {/* 3 · HOURS BY AIRCRAFT TYPE */}
        <section className="s-types">
          <div className="label">Hours by aircraft type</div>
          <ul className="lb-types">
            {byType.length === 0 && <li style={{ color: 'var(--faint)' }}>No typed flights yet</li>}
            {byType.map((t) => {
              const top = byType[0].hours || 1;
              const regLine = t.regs && t.regs.length
                ? `${t.regs.slice(0, 2).join(', ')}${t.regs.length > 2 ? ` +${t.regs.length - 2}` : ''}`
                : (t.note || '');
              return (
                <li key={t.type}>
                  <span className="t" title={t.note || undefined}>{t.type}{regLine && <small>{regLine}</small>}</span>
                  <span className="bar"><i style={{ width: `${Math.max(2, (t.hours / top) * 100)}%` }} /></span>
                  <span className="h">{fmtH(t.hours)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Mobile-only reveal */}
        <button className="lb-expand" onClick={() => setOpen((v) => !v)}>
          <span>Types, limits &amp; night/IFR</span><span className="chev">⌄</span>
        </button>
      </div>

      <div className="lb-row2">
        {/* 4 · FLIGHT TIME LIMITS */}
        {limits && (
          <div className="lb-card limits">
            <div className="label">Flight time limits (EASA ORO.FTL)</div>
            <div className="lb-gauges">
              <Gauge value={limits.last28Days.hours} limit={limits.last28Days.limit} cap="Last 28 days" />
              <Gauge value={limits.calendarYear.hours} limit={limits.calendarYear.limit} cap={`Calendar year ${new Date().getFullYear()}`} />
              <Gauge value={limits.last12Months.hours} limit={limits.last12Months.limit}
                cap={`Last 12 months · ${fmtH(Math.max(0, limits.last12Months.limit - limits.last12Months.hours))} h left`} />
            </div>
          </div>
        )}

        {/* 5 · CURRENCY */}
        <div className="lb-card">
          <div className="label">Currency · last 90 days</div>
          <ul className="lb-cur">
            {!currency.landingsLogged ? (
              <li><span className="lb-ic neutral">·</span><div className="m">Add landings to your flights to track currency</div></li>
            ) : (
              <>
                <CurrencyLine role="Day" data={currency.day} />
                <CurrencyLine role="Night" data={currency.night} />
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Gauge({ value, limit, cap }) {
  const pct = Math.min(100, (value / limit) * 100);
  const warn = pct >= 85;
  return (
    <div className="lb-g">
      <div className="v"><span className="num">{fmtH(value)}</span> / {limit.toLocaleString()} h</div>
      <div className="gbar"><i className={warn ? 'warn' : ''} style={{ width: `${pct}%` }} /></div>
      <div className="cap">{cap}</div>
    </div>
  );
}

function CurrencyLine({ role, data }) {
  if (data.currentUntil) {
    const until = new Date(data.currentUntil + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return (
      <li><span className="lb-ic ok">✓</span><div>{role}: current until <b>{until}</b> <span className="m">· {data.landings} landings</span></div></li>
    );
  }
  const need = Math.max(0, data.required - data.landings);
  return (
    <li><span className="lb-ic warnc">!</span><div>{role}: <b>{need} more landing{need === 1 ? '' : 's'}</b> needed <span className="m">· {data.landings} of {data.required} logged</span></div></li>
  );
}
