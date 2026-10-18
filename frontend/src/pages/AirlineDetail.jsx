import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import LightPage from '../components/primitives/LightPage';
import { useIsMobile } from '../hooks/useIsMobile';
import { HiringPill, LogoTile, RequirementRow } from '../components/airlines/AirlineBits';
import { airlineApi, adminApi } from '../services/api';
import { formatFieldDate, hashStage, resolveFieldDate } from '../lib/fieldDates';
import {
  aircraftTotal, contractLabel, fleetRows, missingFacts, parseStages, readPay, upgradeLabel,
} from '../lib/airlineFacts';
import '../components/airlines/airlines.css';

/**
 * One airline's fact file. The order answers a pilot's questions as they ask
 * them: can I apply here, what do they want, what is it like, how does hiring
 * go — and then, honestly, what nobody has told us yet.
 *
 * Every fact keeps the date it was recorded, and empty fields are never
 * rendered as blank rows: they are collected into one "not recorded yet" line.
 */
export default function AirlineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  // One column on a phone or tablet, two from 1024 — decided here rather than
  // in CSS, so each box is rendered exactly once in exactly one place.
  const narrow = useIsMobile(1024);
  const [airline, setAirline] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    airlineApi.get(id)
      .then(({ data }) => setAirline(data))
      .catch(() => setMissing(true));
  }, [id]);

  const reaffirm = useCallback(async (field) => {
    try {
      const { data } = await adminApi.reaffirm(id, field);
      setAirline((a) => ({ ...a, fieldDates: { ...(a.fieldDates || {}), [data.field]: data.recordedAt } }));
    } catch { /* the date simply stays as it was */ }
  }, [id]);

  if (missing) {
    return (
      <LightPage className="af">
        <button type="button" className="af-back" onClick={() => navigate('/airlines')}><ChevronLeft size={16} /> Airlines</button>
        <p style={{ color: 'var(--text-secondary)', marginTop: 24 }}>That airline is no longer listed.</p>
      </LightPage>
    );
  }
  if (!airline) {
    return <LightPage className="af"><p style={{ color: 'var(--text-secondary)' }}>Loading…</p></LightPage>;
  }

  const fd = airline.fieldDates || {};
  const jobs = airline.jobs || { open: 0, qualify: 0, close: 0 };
  const checks = airline.requirementChecks || [];
  const derived = airline.derivedRequirements;
  const pay = readPay(airline.payRanges);
  const fleet = fleetRows(airline);
  const stages = parseStages(airline.interviewStages);
  const gaps = missingFacts(airline);
  const aircraft = aircraftTotal(airline);
  const bases = (airline.bases || []).length;

  const dateNote = (logical, item) => {
    const d = resolveFieldDate(fd, logical, item);
    return d ? `recorded ${formatFieldDate(d)}` : null;
  };

  // ── the boxes, written once and placed differently on phone and desktop ──
  const requirementsBox = checks.length > 0 && (
    <div className="af-box">
      <h3>
        What they ask for
        {derived?.vacancyCount ? <em>from {derived.vacancyCount} current job{derived.vacancyCount === 1 ? '' : 's'}</em> : null}
      </h3>
      {checks.map((c, i) => <RequirementRow key={i} {...c} />)}
      <p className="note" style={{ marginTop: 8 }}>Worked out from the airline&apos;s current job ads, not typed in by hand.</p>
    </div>
  );

  const payBox = pay.length > 0 && (
    <div className="af-box">
      <h3>
        Pay
        <em>{[pay[0].period, pay[0].currency].filter(Boolean).join(', ')}</em>
      </h3>
      {pay.map((p) => (
        <div className="af-kv" key={p.key}>
          <span className="k">{p.label}</span>
          <span className="v mono">
            {p.value}
            <span className="d">
              {dateNote('payRanges', p.key) || 'no date recorded'}
              <button type="button" onClick={() => reaffirm(`payRanges:${p.key}`)}>still right?</button>
            </span>
          </span>
        </div>
      ))}
    </div>
  );

  const fleetBox = fleet.length > 0 && (
    <div className="af-box">
      <h3>Fleet {dateNote('fleet') ? <em>{dateNote('fleet')}</em> : null}</h3>
      <table className="af-fleet">
        <tbody>
          <tr><th>Type</th><th>In service</th><th>On order</th></tr>
          {fleet.map((f) => (
            <tr key={f.type}>
              <td>{f.type}</td>
              <td className="mono">{f.inService ?? '—'}</td>
              <td className="mono">{f.ordered ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const contractBox = (bases || airline.contractType || airline.rosterPattern
    || airline.upgradeTimeMinYears != null || airline.upgradeTimeMaxYears != null) && (
    <div className="af-box">
      <h3>Contract and roster</h3>
      {bases > 0 && (
        <div className="af-kv"><span className="k">Bases</span><span className="v">{airline.bases.join(', ')}
          {dateNote('bases') && <span className="d">{dateNote('bases')}</span>}</span></div>
      )}
      {contractLabel(airline.contractType) && (
        <div className="af-kv"><span className="k">Contract</span><span className="v">{contractLabel(airline.contractType)}
          {dateNote('contractType') && <span className="d">{dateNote('contractType')}</span>}</span></div>
      )}
      {airline.rosterPattern && (
        <div className="af-kv"><span className="k">Roster</span><span className="v">{airline.rosterPattern}
          {dateNote('rosterPattern') && <span className="d">{dateNote('rosterPattern')}</span>}</span></div>
      )}
      {upgradeLabel(airline.upgradeTimeMinYears, airline.upgradeTimeMaxYears) && (
        <div className="af-kv"><span className="k">Upgrade to Captain</span><span className="v">
          {upgradeLabel(airline.upgradeTimeMinYears, airline.upgradeTimeMaxYears)}
          {dateNote('upgradeTime') && <span className="d">{dateNote('upgradeTime')}</span>}</span></div>
      )}
    </div>
  );

  // The sim type belongs to the stage that mentions a simulator; if no stage
  // does, it is stated once at the end rather than lost.
  const simStageIndex = stages.findIndex((s) => /sim/i.test(s.title));
  const hiringBox = (stages.length > 0 || airline.simType) && (
    <div className="af-box">
      <h3>Hiring process</h3>
      {stages.map((s, i) => (
        <div className="af-stage" key={`${s.title}-${i}`}>
          <i>{i + 1}</i>
          <span>
            {s.title}{i === simStageIndex && airline.simType ? ` · ${airline.simType}` : ''}
            {s.points.length > 0 && (
              <span style={{ display: 'block', color: 'var(--text-faint)', fontSize: 12.5, marginTop: 3 }}>
                {s.points.join(' · ')}
              </span>
            )}
            {dateNote('interviewStages', hashStage(s.title)) && (
              <span style={{ display: 'block', color: 'var(--text-faint)', fontSize: 11.5, marginTop: 2 }}>
                {dateNote('interviewStages', hashStage(s.title))}
              </span>
            )}
          </span>
        </div>
      ))}
      {airline.simType && simStageIndex === -1 && (
        <div className="af-stage"><i>{stages.length + 1}</i><span>Simulator: {airline.simType}</span></div>
      )}
    </div>
  );

  const unknownBox = gaps.length > 0 && (
    <div className="af-unknown">
      <b>Not recorded yet:</b> {gaps.join(', ')}. Flown for them?{' '}
      <button type="button" onClick={() => navigate(`/airlines/${id}/contribute`)}>Add what you know</button>
    </div>
  );

  const ctaBox = jobs.open > 0 && (
    <button type="button" className="af-cta" onClick={() => navigate(`/jobs?company=${encodeURIComponent(airline.name)}`)}>
      <span>
        <b>{jobs.open} open job{jobs.open === 1 ? '' : 's'}</b>
        <span>
          {jobs.matchable
            ? `You qualify for ${jobs.qualify}${jobs.close ? ` · ${jobs.close} more are close` : ''}`
            : 'Add your licence and hours to see which are open to you'}
        </span>
      </span>
      <ArrowRight size={18} />
    </button>
  );

  const quickTiles = [
    aircraft ? { value: aircraft, label: 'Aircraft' } : null,
    bases ? { value: bases, label: bases === 1 ? 'Base' : 'Bases' } : null,
    airline.avgResponseDays ? { value: `~${airline.avgResponseDays} d`, label: 'Reply time' } : null,
  ].filter(Boolean);

  return (
    <LightPage className="af">
      <button type="button" className="af-back" onClick={() => navigate('/airlines')}><ChevronLeft size={16} /> Airlines</button>

      <div className="af-hero">
        <LogoTile logoUrl={airline.logoUrl} iataCode={airline.iataCode} name={airline.name} />
        <div style={{ minWidth: 0 }}>
          <h1>{airline.name}</h1>
          <div className="c">{[airline.iataCode, airline.icaoCode, airline.headquarters || airline.country].filter(Boolean).join(' · ')}</div>
        </div>
      </div>

      <div className="af-status">
        <HiringPill status={airline.hiringStatus} long />
        {dateNote('hiringStatus') && <span>checked {formatFieldDate(resolveFieldDate(fd, 'hiringStatus'))}</span>}
      </div>

      {/* Phone: one column, in reading order. Desktop: two, as the mockup. */}
      {narrow ? (
        <div style={{ marginTop: 14 }}>
          {ctaBox}
          {quickTiles.length > 0 && (
            <div className="af-quick">
              {quickTiles.map((t) => <div key={t.label}><b>{t.value}</b><span>{t.label}</span></div>)}
            </div>
          )}
          {requirementsBox}
          {payBox}
          {fleetBox}
          {contractBox}
          {hiringBox}
          {unknownBox}
        </div>
      ) : (
        <div className="af-grid" style={{ marginTop: 14 }}>
          <div>
            {quickTiles.length > 0 && (
              <div className="af-quick" style={{ marginTop: 0 }}>
                {quickTiles.map((t) => <div key={t.label}><b>{t.value}</b><span>{t.label}</span></div>)}
              </div>
            )}
            {requirementsBox}
            <div className="af-pair">
              {fleetBox}
              {hiringBox}
            </div>
          </div>
          <div>
            {ctaBox}
            {payBox}
            {contractBox}
            {unknownBox}
          </div>
        </div>
      )}
    </LightPage>
  );
}
