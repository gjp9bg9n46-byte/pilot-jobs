import React, { useEffect, useRef, useState } from 'react';
import { jobApi } from '../../services/api';

// Hours filter popover — the key filter for low-hour pilots. Shows the distribution
// of jobs by required total-time (histogram, current filters EXCLUDING hours), a
// "You · {n} h" marker at the pilot's hours, an "up to X" range, presets, and a
// "Show N jobs" apply button. maxReqHours is inclusive of jobs with NO hours
// requirement (they always show). value = current maxReqHours ('' = Any).
const HARD_MAX = 5000;

export default function HoursPopover({ params, pilotHours, value, onApply, onClose }) {
  const [hist, setHist] = useState(null);
  const [max, setMax] = useState(value ? Number(value) : HARD_MAX);
  const ref = useRef(null);

  useEffect(() => {
    let active = true;
    jobApi.hoursHistogram(params).then(({ data }) => { if (active) setHist(data); }).catch(() => {});
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const buckets = hist?.buckets || [];
  const noReq = hist?.noRequirement || 0;
  const peak = Math.max(1, ...buckets.map((b) => b.count));
  const isAny = max >= HARD_MAX;
  // Jobs shown with "up to max" = buckets whose lower edge < max, + no-requirement jobs.
  const shown = buckets.filter((b) => b.min < max).reduce((s, b) => s + b.count, 0) + (isAny ? 0 : noReq) + (isAny ? noReq : 0);
  const youPct = Math.min(100, (pilotHours || 0) / HARD_MAX * 100);
  const maxPct = Math.min(100, max / HARD_MAX * 100);

  const presets = [
    { label: 'Under 500 h', v: 500 },
    { label: 'Under 1,500 h', v: 1500 },
    ...(pilotHours ? [{ label: `Up to my hours (${pilotHours.toLocaleString()} h)`, v: pilotHours }] : []),
    { label: 'Any', v: HARD_MAX },
  ];

  return (
    <div className="pop" ref={ref} role="dialog" aria-label="Hours filter">
      <div className="pt">Required total time</div>
      <div className="pfine">Jobs asking for up to <b>{isAny ? 'any' : `${max.toLocaleString()} h`}</b>. Jobs with no stated hours always show.</div>

      <div className="hist">
        {buckets.map((b, i) => (
          <i key={i} className={b.min < max ? 'in' : ''} style={{ height: `${Math.max(3, (b.count / peak) * 100)}%` }} title={`${b.min}–${b.max ?? '+'} h: ${b.count}`} />
        ))}
        {pilotHours > 0 && <div className="youm" style={{ left: `${youPct}%` }}><span>You · {pilotHours.toLocaleString()} h</span></div>}
      </div>
      <div className="axis"><span>0</span><span>1,500</span><span>3,000</span><span>5,000+</span></div>

      <input type="range" className="hrange" min="0" max={HARD_MAX} step="100" value={max} onChange={(e) => setMax(Number(e.target.value))} aria-label="Maximum required hours" />

      <div className="presets">
        {presets.map((p) => (
          <button key={p.label} className={(p.v === max || (p.v === HARD_MAX && isAny)) ? 'on' : ''} onClick={() => setMax(p.v)}>{p.label}</button>
        ))}
      </div>

      <div className="pfoot">
        <button className="plink" onClick={() => { onApply(''); onClose(); }}>Clear</button>
        <button className="pshow" onClick={() => { onApply(isAny ? '' : String(max)); onClose(); }}>Show {shown.toLocaleString()} jobs</button>
      </div>
    </div>
  );
}
