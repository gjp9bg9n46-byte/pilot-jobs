import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaneMark from '../components/PlaneMark';
import SiteFooter from '../components/SiteFooter';
import PfPmDial from '../components/tools/PfPmDial';
import './pfpm.css';
import { DEFAULT_NAMES, MAX_SECTORS, decide, formatAll, normaliseSector } from '../lib/pfpm';
import { CARD_H, CARD_W, cardBlob, renderCard } from '../lib/pfpmCard';

const SPIN_MS = 1700;

// Public tool — no auth, no backend, nothing stored. A logged-out visitor is
// the expected case: this page exists to be shared.
export default function PfPmTool() {
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [sectors, setSectors] = useState(['']);
  const [alternate, setAlternate] = useState(true);
  const [phase, setPhase] = useState('idle');   // idle | spinning | done
  const [rotation, setRotation] = useState(0);
  const [legs, setLegs] = useState(null);
  const [shareNote, setShareNote] = useState('');
  const [dialSize, setDialSize] = useState(280);
  const timer = useRef(null);

  const signedIn = useMemo(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  }, []);

  // The dial sizes itself to the viewport, between a readable floor and a
  // ceiling that stops it dominating a desktop window.
  useEffect(() => {
    const fit = () => {
      const vw = Math.min(window.innerWidth, 720);
      setDialSize(Math.max(220, Math.min(320, Math.round(vw * 0.70))));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const cleanSectors = useMemo(
    () => sectors.map(normaliseSector).filter((s, i) => s || sectors.length === 1 || i === 0),
    [sectors],
  );

  const run = useCallback(() => {
    if (phase === 'spinning') return;
    const result = decide({
      names: names.map((n, i) => (n.trim() || DEFAULT_NAMES[i])),
      sectors: sectors.map(normaliseSector),
      alternate,
    });
    // Land the card with leg 1's PF under the lubber line: name A sits at the
    // card's top, so 0° shows A and 180° shows B. Four whole turns first, then
    // whatever part-turn carries the current angle to the one we want.
    const want = result[0].pf === 0 ? 0 : 180;
    const target = rotation + 4 * 360 + (want - (rotation % 360));
    setLegs(null);
    setShareNote('');
    setPhase('spinning');
    setRotation(target);
    timer.current = setTimeout(() => {
      setLegs(result);
      setPhase('done');
    }, SPIN_MS);
  }, [alternate, names, phase, rotation, sectors]);

  const share = useCallback(async () => {
    if (!legs) return;
    setShareNote('Preparing…');
    try {
      const canvas = await renderCard(legs, { alternate: alternate && legs.length > 1 });
      const blob = await cardBlob(canvas);
      const file = new File([blob], 'pf-pm-cockpithire.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Who’s flying today?' });
        setShareNote('');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pf-pm-cockpithire.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setShareNote(`Saved · ${CARD_W}×${CARD_H}`);
    } catch (e) {
      if (e?.name === 'AbortError') { setShareNote(''); return; }
      setShareNote('Could not create the image.');
    }
  }, [alternate, legs]);

  const copyText = useCallback(async () => {
    if (!legs) return;
    try {
      await navigator.clipboard.writeText(formatAll(legs));
      setShareNote('Result copied.');
    } catch { setShareNote('Could not copy.'); }
  }, [legs]);

  const setSector = (i, v) => setSectors((s) => s.map((x, k) => (k === i ? v : x)));
  const addSector = () => setSectors((s) => (s.length >= MAX_SECTORS ? s : [...s, '']));
  const removeSector = (i) => setSectors((s) => (s.length <= 1 ? s : s.filter((_, k) => k !== i)));

  const multi = sectors.length > 1;

  return (
    <div className="app-light pfpm">
      <nav className="pfpm-nav">
        <Link to="/" className="pfpm-brand"><PlaneMark size={16} /> CockpitHire</Link>
        <Link to={signedIn ? '/jobs' : '/login'} className="pfpm-navcta">
          {signedIn ? 'Jobs' : 'Web App →'}
        </Link>
      </nav>

      <main className="pfpm-main">
        <div className="pfpm-wrap">
          <header className="pfpm-head">
            <h1>PF / PM</h1>
            <p>Who flies, who monitors. One fair spin of the dial.</p>
          </header>

          <section className="pfpm-card" aria-label="Crew">
            <h2 className="pfpm-label">Crew</h2>
            <div className="pfpm-names">
              {[0, 1].map((i) => (
                <label key={i} className="pfpm-field">
                  <span>{i === 0 ? 'Pilot 1' : 'Pilot 2'}</span>
                  <input
                    value={names[i]}
                    maxLength={28}
                    placeholder={DEFAULT_NAMES[i]}
                    onChange={(e) => setNames((n) => n.map((x, k) => (k === i ? e.target.value : x)))}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="pfpm-card" aria-label="Sectors">
            <h2 className="pfpm-label">Sectors <span className="pfpm-opt">optional</span></h2>
            {sectors.map((s, i) => (
              <div key={i} className="pfpm-sectorrow">
                <input
                  value={s}
                  maxLength={24}
                  placeholder={i === 0 ? 'CAI–MXP' : 'MXP–HRG'}
                  aria-label={`Sector ${i + 1}`}
                  onChange={(e) => setSector(i, e.target.value)}
                />
                {sectors.length > 1 ? (
                  <button type="button" className="pfpm-x" onClick={() => removeSector(i)}
                          aria-label={`Remove sector ${i + 1}`}>✕</button>
                ) : null}
              </div>
            ))}
            {sectors.length < MAX_SECTORS ? (
              <button type="button" className="pfpm-add" onClick={addSector}>+ Add sector</button>
            ) : (
              <p className="pfpm-hint">Six sectors is the limit.</p>
            )}

            {multi ? (
              <label className="pfpm-alt">
                <input type="checkbox" checked={alternate} onChange={(e) => setAlternate(e.target.checked)} />
                <span>
                  <strong>Alternate legs</strong>
                  <em>One spin decides the first leg; the roles swap after it.</em>
                </span>
              </label>
            ) : null}
          </section>

          <div className="pfpm-dialwrap">
            <PfPmDial
              size={dialSize}
              rotation={rotation}
              spinning={phase === 'spinning'}
              names={[names[0].trim() || DEFAULT_NAMES[0], names[1].trim() || DEFAULT_NAMES[1]]}
            />
          </div>

          <button type="button" className="pfpm-go" onClick={run} disabled={phase === 'spinning'}>
            {phase === 'spinning' ? 'Deciding…' : legs ? 'Decide again' : 'Decide'}
          </button>

          <div className="pfpm-result" aria-live="polite">
            {phase === 'spinning' ? <p className="pfpm-waiting">The dial is settling…</p> : null}
            {legs ? (
              <>
                <ul className="pfpm-legs">
                  {legs.map((leg, i) => (
                    <li key={i}>
                      {leg.sector ? <span className="pfpm-sector">{leg.sector}</span> : null}
                      <span className="pfpm-roles">
                        <strong>PF {leg.pfName}</strong>
                        <span className="pfpm-dot">·</span>
                        <span className="pfpm-pm">PM {leg.pmName}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="pfpm-actions">
                  <button type="button" className="pfpm-secondary" onClick={share}>Share</button>
                  <button type="button" className="pfpm-secondary" onClick={copyText}>Copy text</button>
                </div>
                {shareNote ? <p className="pfpm-note">{shareNote}</p> : null}
                {!signedIn ? (
                  <p className="pfpm-madeby">
                    Made by <Link to="/">CockpitHire</Link> — <Link to="/login">find pilot jobs you qualify for</Link>
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
