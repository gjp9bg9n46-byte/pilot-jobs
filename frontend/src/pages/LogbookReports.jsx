import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { logbookApi } from '../services/api';
import LightPage from '../components/primitives/LightPage';
import './logbookReports.css';

// Logbook Reports — phase 1.
//
// Every number on this page comes from GET /logbook/reports. Nothing is
// computed here and nothing is rounded here: the app renders the same payload,
// and a figure that differed between the two would be a bug a pilot could not
// explain. See backend/src/services/logbookReports.js for the rules.

// The house number format. A bare toLocaleString() follows the DEVICE locale,
// which renders 1592 as "1.592" on a phone set to German — read as 1.5 by a
// pilot scanning hours. The locale is pinned for that reason.
const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '—');
const num1 = (n) => (Number.isFinite(Number(n))
  ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (ym) => {
  if (!ym) return null;
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
const dateLabel = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
};

/** A value the logbook never recorded is not zero, and must not read as zero. */
function Stat({ k, v, unit }) {
  const missing = v == null;
  return (
    <div>
      <div className={`sv${missing ? ' sv-missing' : ''}`}>
        {missing ? 'Not recorded' : num1(v)}{!missing && unit ? <span className="su"> {unit}</span> : null}
      </div>
      <div className="sk">{k}</div>
    </div>
  );
}

function Limit({ label, hours, limit }) {
  const pct = limit > 0 ? Math.min(100, (hours / limit) * 100) : 0;
  const over = hours > limit;
  return (
    <div className="lim">
      <div className="lim-row">
        <span className="lim-k">{label}</span>
        <span className="lim-v">{num1(hours)} of {num(limit)} h</span>
      </div>
      <div className="track"><div className={`fill${over ? ' over' : ''}${pct < 50 ? ' soft' : ''}`} style={{ width: `${pct}%` }} /></div>
      <div className="lim-left">{over ? `${num1(hours - limit)} h over` : `${num1(limit - hours)} h remaining`}</div>
    </div>
  );
}

export default function LogbookReports() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    logbookApi.reports()
      .then((r) => { if (alive) setData(r.data); })
      .catch((e) => { if (alive) setErr(e?.response?.data?.error || 'Could not load your reports.'); });
    return () => { alive = false; };
  }, []);

  if (err) {
    return (
      <LightPage className="lbr">
        <div className="lbr-wrap"><p className="lbr-err">{err}</p></div>
      </LightPage>
    );
  }
  if (!data) {
    return (
      <LightPage className="lbr">
        <div className="lbr-wrap"><p className="lbr-loading">Working out your numbers…</p></div>
      </LightPage>
    );
  }

  const { basis, limits, recency, totals, milestone, jobsUnlocked, command, almostThere } = data;
  const t = totals || {};

  return (
    <LightPage className="lbr">
      <div className="lbr-wrap">
        <header className="lbr-head">
          <Link to="/logbook" className="lbr-back">← Logbook</Link>
          <h1>Reports</h1>
          <p className="lbr-lead">What your logbook says about where you are and what you can fly next.
            Figures come from your logged flights; nothing here is an official record.</p>
          <p className="lbr-basis">
            Based on {num(basis.flightCount)} logged flight{basis.flightCount === 1 ? '' : 's'}
            {basis.firstFlight ? ` · ${dateLabel(basis.firstFlight)} – ${dateLabel(basis.lastFlight)}` : ''}
          </p>
        </header>

        <div className="lbr-grid">

          {limits && (
            <section className="lbr-card">
              <h2>Flight time</h2>
              <p className="lbr-sub">Block hours against the EASA ORO.FTL.210 ceilings. A helper for your own
                planning — your operator holds the official record.</p>
              <Limit label="Last 28 days" hours={limits.last28Days.hours} limit={limits.last28Days.limit} />
              <Limit label={`Calendar year ${limits.calendarYear.year}`} hours={limits.calendarYear.hours} limit={limits.calendarYear.limit} />
              <Limit label="Last 12 months" hours={limits.last12Months.hours} limit={limits.last12Months.limit} />
              <p className="lbr-note">Carry-forward hours are excluded — these windows count logged flights only.</p>
            </section>
          )}

          {recency && (
            <section className="lbr-card">
              <h2>Recency</h2>
              <p className="lbr-sub">Take-offs and landings in the last {recency.windowDays} days, by type.</p>
              {!recency.trackable ? (
                <>
                  <p className="lbr-flag">Landings aren’t recorded on most of your flights. Add them to track recency.</p>
                  <p className="lbr-note">{num(recency.flightsWithLandings)} of your {num(recency.flightCount)} flights
                    have landings recorded. We would rather show nothing than a currency date built on a fraction
                    of your flying.</p>
                </>
              ) : recency.byType.length === 0 ? (
                <p className="lbr-flag">No landings in the last {recency.windowDays} days.</p>
              ) : (
                <>
                  <div className="rows">
                    {recency.byType.map((r) => (
                      <React.Fragment key={r.type}>
                        <div className="r">
                          <span className="r-n">{r.type} · day landings</span>
                          <span className="r-h">{num(r.day.count)} landing{r.day.count === 1 ? '' : 's'}</span>
                          <span className={r.day.current ? 'r-ok' : 'r-no'}>{r.day.current ? '· current' : '· not current'}</span>
                        </div>
                        <div className="r">
                          <span className="r-n">{r.type} · night landings</span>
                          <span className="r-h">{num(r.night.count)} landing{r.night.count === 1 ? '' : 's'}</span>
                          <span className={r.night.current ? 'r-ok' : 'r-no'}>{r.night.current ? '· current' : '· not current'}</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="strip">
                    {recency.byType.slice(0, 1).map((r) => (
                      <React.Fragment key={r.type}>
                        <div><div className="sv sv-sm">{dateLabel(r.day.lapsesOn) || '—'}</div><div className="sk">Day currency lapses</div></div>
                        <div><div className="sv sv-sm">{dateLabel(r.night.lapsesOn) || '—'}</div><div className="sk">Night currency lapses</div></div>
                      </React.Fragment>
                    ))}
                  </div>
                  <p className="lbr-note">Counted from landings recorded in your logbook.</p>
                </>
              )}
            </section>
          )}

          <section className="lbr-card">
            <h2>Totals</h2>
            <p className="lbr-sub">Every hour in your logbook, split the way an application form asks for it.</p>
            <div className="kcap">Total time</div>
            <div className="big">{num1(t.totalTime)}<span className="bu"> h</span></div>
            <div className="strip">
              <Stat k="PIC" v={t.picTime} />
              <Stat k="SIC" v={t.sicTime} />
              <Stat k="Other" v={t.otherTime} />
            </div>
            <div className="strip">
              <Stat k="Night" v={t.nightTime} />
              <Stat k="IFR" v={t.instrumentTime} />
              <Stat k="Multi-engine" v={t.multiEngineTime} />
              <Stat k="Turbine" v={t.turbineTime} />
              <Stat k="Jet" v={t.jetTime} />
            </div>
            {t.byType?.length > 0 && (
              <>
                <div className="kcap">By type</div>
                <div className="rows">
                  {t.byType.map((r) => {
                    const top = t.byType[0].hours || 1;
                    return (
                      <div className="r" key={r.type}>
                        <span className="r-n">{r.type}</span>
                        <span className="r-bar"><i style={{ width: `${Math.max(4, (r.hours / top) * 100)}%` }} /></span>
                        <span className="r-h">{num1(r.hours)} h</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <p className="lbr-note">
              Carry-forward hours are included here, because these are career totals.
              {t.carryForward > 0 ? ` ${num1(t.carryForward)} h of your total was carried forward.` : ''}
            </p>
          </section>

          {milestone && (
            <section className="lbr-card">
              <h2>Next milestone</h2>
              <p className="lbr-sub">Your pace over the last {milestone.paceWindowMonths || 12} calendar months, carried forward.</p>
              <div className="kcap">{num(milestone.next)} hours</div>
              <div className="big">{num1(milestone.remaining)}<span className="bu"> h to go</span></div>
              <div className="track" style={{ marginTop: 16 }}>
                <div className="fill" style={{ width: `${Math.min(100, (milestone.current / milestone.next) * 100)}%` }} />
              </div>
              <div className="lim-left">{num1(milestone.current)} of {num(milestone.next)} h</div>
              {milestone.pace ? (
                <p className="lbr-flag">At <b>{num1(milestone.pace)} hours a month</b>, you reach {num(milestone.next)} hours
                  around <b>{monthName(milestone.eta)}</b>.</p>
              ) : (
                <p className="lbr-note">Too few months of flying in the last year to project a date.</p>
              )}
            </section>
          )}

          {jobsUnlocked && (
            <section className="lbr-card">
              <h2>Jobs unlocked this year</h2>
              <p className="lbr-sub">Live jobs you qualify for today that your hours on 1 January would not have reached.</p>
              <div className="kcap">Since {dateLabel(jobsUnlocked.since)}</div>
              <div className="big">{jobsUnlocked.delta >= 0 ? '+' : ''}{num(jobsUnlocked.delta)}<span className="bu"> jobs</span></div>
              <div className="strip">
                <div><div className="sv">{num(jobsUnlocked.onJan1)}</div><div className="sk">On 1 Jan</div></div>
                <div><div className="sv">{num(jobsUnlocked.today)}</div><div className="sk">Today</div></div>
                <div><div className="sv">{num(jobsUnlocked.activeJobs)}</div><div className="sk">Live jobs</div></div>
              </div>
              <p className="lbr-note">The same matching rules the Jobs tab uses, re-run against your totals as they
                stood on 1 January. Licences and ratings are taken as they are today.</p>
            </section>
          )}

          {command && (
            <section className="lbr-card">
              <h2>Command</h2>
              <p className="lbr-sub">
                Where you stand against the stated minimums in our live{command.type ? ` ${command.type}` : ''} Captain
                vacancies. Median of {num(command.sampleSize)} job{command.sampleSize === 1 ? '' : 's'}, not a rule of thumb.
              </p>
              {command.medianTotalHours
                ? <Limit label="Total time" hours={command.yourTotalHours} limit={command.medianTotalHours} />
                : null}
              {command.medianPicHours
                ? <Limit label="PIC time" hours={command.yourPicHours} limit={command.medianPicHours} />
                : null}
              <p className="lbr-note">A median, so half those vacancies ask for less.</p>
            </section>
          )}

          {almostThere?.length > 0 && (
            <section className="lbr-card">
              <h2>Almost there</h2>
              <p className="lbr-sub">Live jobs you meet on every requirement but one.</p>
              <div className="rows">
                {almostThere.map((j) => (
                  <Link className="r r-link" key={j.id} to={`/jobs/${j.id}`}>
                    <span className="r-n">{j.title}{j.company ? ` — ${j.company}` : ''}</span>
                    <span className="r-gap">{j.gapHours != null ? `+${num(j.gapHours)} h` : j.shortfall}</span>
                  </Link>
                ))}
              </div>
              <p className="lbr-note">Ordered by how close the gap is. Fixed-wing roles only.</p>
            </section>
          )}

        </div>
      </div>
    </LightPage>
  );
}
