import React, { useCallback, useMemo, useRef, useState } from 'react';
import RouteMapCard from './RouteMapCard';
import { renderYearCard, cardBlob, STORY, FEED } from '../../lib/yearCard';
import './yearInTheSky.css';

// "Your year in the sky" — a story-style deck, one figure per slide.
//
// Every number comes from the Reports endpoint, which the career cards also
// read, so a year slide and a career card cannot disagree. Logged flights
// only: carry-forward has no date and belongs to no year.
//
// Celebratory but calm: the slide changes with a short cross-fade and nothing
// else moves. No confetti. The figure is the event.

const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '—');
const num1 = (n) => (Number.isFinite(Number(n))
  ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (ym) => (ym ? `${MONTHS[Number(ym.split('-')[1]) - 1]} ${ym.split('-')[0]}` : null);
const dateLabel = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
};

/** The slides, in order, with anything that has no data dropped. */
export function buildSlides(y) {
  if (!y?.enough) return [];
  const s = [];
  s.push({ key: 'intro', kind: 'intro', eyebrow: `${y.year}`, head: 'Your year in the sky',
    body: `From ${dateLabel(y.first)} to ${dateLabel(y.last)}.` });

  if (y.hours > 0) {
    s.push({ key: 'hours', eyebrow: 'Hours flown', fig: num1(y.hours), unit: 'h',
      body: `Across ${num(y.sectors)} sector${y.sectors === 1 ? '' : 's'}.` });
  }
  if (y.distance?.km > 0) {
    s.push({ key: 'distance', eyebrow: 'Distance', fig: num(y.distance.km), unit: 'km',
      body: `${y.distance.moonPhrase}. ${num1(y.distance.earthLaps)} times around the Earth.` });
  }
  if (y.places?.airportCount > 0) {
    s.push({ key: 'places', kind: 'map', eyebrow: 'Places', fig: num(y.places.airportCount), unit: 'airports',
      body: `In ${num(y.places.countryCount)} countr${y.places.countryCount === 1 ? 'y' : 'ies'}.`,
      routes: y.places.routes });
  }
  if (y.topAirport) {
    s.push({ key: 'top', eyebrow: 'Most visited', fig: y.topAirport.code, mono: true,
      body: `${y.topAirport.name || y.topAirport.city || 'Your home field'} — ${num(y.topAirport.visits)} visits.` });
  }
  if (y.distance?.longest) {
    const L = y.distance.longest;
    s.push({ key: 'longest', eyebrow: 'Longest flight', fig: `${L.from}–${L.to}`, mono: true,
      body: `${num(L.km)} km on ${dateLabel(L.date)}.` });
  }
  if (y.favouriteTail) {
    s.push({ key: 'tail', eyebrow: 'Favourite aircraft', fig: y.favouriteTail.registration, mono: true,
      body: `${num(y.favouriteTail.sectors)} sector${y.favouriteTail.sectors === 1 ? '' : 's'} on this one tail.` });
  }
  if (y.sun && (y.sun.sunrises > 0 || y.sun.sunsets > 0)) {
    s.push({ key: 'sun', eyebrow: 'Sunrises from the flight deck', fig: num(y.sun.sunrises),
      body: `And ${num(y.sun.sunsets)} sunset${y.sun.sunsets === 1 ? '' : 's'}, counted along your routes.` });
  }
  if (y.night?.percent != null) {
    s.push({ key: 'night', eyebrow: 'After dark', fig: `${y.night.percent}%`,
      body: `${num1(y.night.nightHours)} of your ${num1(y.night.totalHours)} hours were at night.` });
  }
  if (y.busiestMonth) {
    s.push({ key: 'busiest', eyebrow: 'Busiest month', fig: monthName(y.busiestMonth.month), small: true,
      body: `${num1(y.busiestMonth.hours)} hours in one month.` });
  }
  s.push({ key: 'end', kind: 'end', eyebrow: 'Your year', head: `${y.year} in the sky` });
  return s;
}

export default function YearInTheSky({ year, years = [], onYearChange, basis }) {
  const [i, setI] = useState(0);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const liveRef = useRef(null);

  const slides = useMemo(() => buildSlides(year), [year]);
  const at = slides[Math.min(i, slides.length - 1)];

  const go = useCallback((n) => {
    setI((cur) => Math.max(0, Math.min(slides.length - 1, cur + n)));
  }, [slides.length]);

  const share = useCallback(async (size) => {
    setBusy(true); setNote(null);
    try {
      const canvas = await renderYearCard(year, size);
      const blob = await cardBlob(canvas);
      const name = `cockpithire-${year.year}-${size === STORY ? 'story' : 'feed'}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setNote('Shared.');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setNote(`Saved · ${size.w}×${size.h}`);
      }
    } catch (e) {
      setNote(`Could not make the card: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }, [year]);

  const picker = years.length > 1 ? (
    <div className="yis-years" role="group" aria-label="Choose a year">
      {years.map((yr) => (
        <button
          key={yr} type="button" className={yr === year?.year ? 'on' : ''}
          aria-pressed={yr === year?.year}
          onClick={() => { setI(0); onYearChange?.(yr); }}
        >{yr}</button>
      ))}
    </div>
  ) : null;

  if (!year) return null;

  if (!year.enough) {
    return (
      <section className="lbr-card">
        {picker}
        <h2>Your {year.year} in the sky</h2>
        <p className="lbr-sub">
          {year.flightCount === 0
            ? `No flights logged in ${year.year} yet. Once you have a few, this becomes your year in review.`
            : `Only ${num(year.flightCount)} flight${year.flightCount === 1 ? '' : 's'} logged in ${year.year} so far — too few to make a year of it. Come back after ${num(year.minFlights)}.`}
        </p>
      </section>
    );
  }

  return (
    <section className="lbr-card yis">
      {picker}

      <div className="yis-rail" role="tablist" aria-label="Slides">
        {slides.map((s, n) => (
          <button
            key={s.key} type="button" role="tab" aria-selected={n === i} aria-label={`Slide ${n + 1}`}
            className={`yis-pip${n === i ? ' on' : ''}`} onClick={() => setI(n)}
          />
        ))}
      </div>

      <div className={`yis-slide${at.kind === 'intro' || at.kind === 'end' ? ' navy' : ''}`} key={at.key}>
        <div className="yis-eyebrow">{at.eyebrow}</div>
        {at.kind === 'intro' || at.kind === 'end' ? (
          <div className="yis-head">{at.head}</div>
        ) : (
          <div className={`yis-fig${at.mono ? ' mono' : ''}${at.small ? ' small' : ''}`}>
            {at.fig}{at.unit ? <span className="yis-unit"> {at.unit}</span> : null}
          </div>
        )}
        {at.kind === 'map' && at.routes?.length ? (
          <div className="yis-map">
            <RouteMapCard sectors={at.routes.map((r) => ({ from: r.from, to: r.to }))} scope="all" label="" />
          </div>
        ) : null}
        {at.body ? <p className="yis-body">{at.body}</p> : null}
        <div className="yis-brand">CockpitHire</div>
      </div>

      <div className="yis-nav">
        <button type="button" onClick={() => go(-1)} disabled={i === 0} className="yis-arrow">← Back</button>
        <span className="yis-count" aria-live="polite" ref={liveRef}>{i + 1} of {slides.length}</span>
        <button type="button" onClick={() => go(1)} disabled={i === slides.length - 1} className="yis-arrow">Next →</button>
      </div>

      {(at.kind === 'end' || i === slides.length - 1) && (
        <div className="yis-share">
          <button type="button" className="yis-sharebtn" onClick={() => share(STORY)} disabled={busy}>
            {busy ? 'Making the card…' : 'Share — story 1080×1920'}
          </button>
          <button type="button" className="yis-sharebtn ghost" onClick={() => share(FEED)} disabled={busy}>
            Feed 1080×1350
          </button>
        </div>
      )}
      {note ? <p className="lbr-note">{note}</p> : null}

      <p className="lbr-note">
        Based on {num(year.flightCount)} logged flight{year.flightCount === 1 ? '' : 's'} in {year.year}.
        {year.basis?.withoutAirports
          ? ` ${num(year.basis.withoutAirports)} without airports aren’t included in the distance or the map.`
          : ''}
        {basis?.carryForwardHours > 0
          ? ' Carry-forward hours have no date, so they are not part of any year.'
          : ''}
      </p>
    </section>
  );
}
