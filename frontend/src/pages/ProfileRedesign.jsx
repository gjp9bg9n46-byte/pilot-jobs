import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Pencil, ExternalLink, Download, ChevronRight, Check,
} from 'lucide-react';
import { profileApi, logbookApi } from '../services/api';
import { LightPage } from '../components/primitives';
import ProfileEditSheet, { pilotNationalities } from './ProfileEditSheets';
import './profileRedesign.css';

// ── formatting helpers (display only; data is stored as entered) ──────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d) {
  if (!d) return null;
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}
function fmtDue(d) {
  if (!d) return null;
  const t = new Date(d);
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}
// Proper capitals for places / aircraft ("cairo" → "Cairo", "CESSNA-172" → "Cessna
// 172"); short all-caps tokens (A320, IR, UAE) are kept as codes.
function properCase(s) {
  return String(s || '').split(/\s+/).map((w) => w.split('-').map((p) => {
    if (!p) return p;
    if (/\d/.test(p)) return p.toUpperCase();
    if (p === p.toUpperCase() && p.length <= 4) return p;
    return p[0].toUpperCase() + p.slice(1).toLowerCase();
  }).join(' ')).join(' ').trim();
}
const ROLE_LABEL = { FIRST_OFFICER: 'First Officer', CAPTAIN: 'Captain' };
const EDU_LABEL = { high_school: 'High school', technical: 'Technical', bachelor: "Bachelor's degree", masters: "Master's degree", doctorate: 'Doctorate' };
const medicalLabel = (c) => `Class ${String(c || '').replace(/^CLASS[_\s-]?/i, '')}`;
const hrs = (n) => `${Math.round(Number(n) || 0).toLocaleString()} h`;
const normType = (t) => String(t || '').toUpperCase().split(/[\s\-/]+/)[0];
const maskEmail = (e) => { const [u, d] = String(e || '').split('@'); return u ? `${u[0]}•••@${d || ''}` : ''; };
const notExpired = (d) => !d || new Date(d) >= new Date();

// Training validity defaults (months) — mirror the backend; explicit expiresAt wins.
const TRAINING_VALIDITY = { CRM: 12, DGR: 24, 'FIRST AID': 24, SMS: 12 };
function trainingDue(t) {
  if (t.expiresAt) return new Date(t.expiresAt);
  const m = TRAINING_VALIDITY[String(t.type || '').trim().toUpperCase()];
  if (!m || !t.completedAt) return null;
  const d = new Date(t.completedAt);
  d.setMonth(d.getMonth() + m);
  return d;
}
function dueLevel(due) {
  if (!due) return null;
  const days = Math.floor((new Date(due).getTime() - Date.now()) / 86400000);
  if (days <= 7) return 'r'; if (days <= 90) return 'a'; return 'g';
}

const LICENCE_RANK = ['ATPL', 'ATP', 'MPL', 'CPL', 'PPL'];
const LICENCE_NAME = { ATPL: 'Airline Transport Pilot', ATP: 'Airline Transport Pilot', MPL: 'Multi-crew Pilot', CPL: 'Commercial Pilot', PPL: 'Private Pilot' };
const rankOf = (t) => { const i = LICENCE_RANK.indexOf(t); return i === -1 ? 99 : i; };

export default function ProfileRedesign() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [otwSaving, setOtwSaving] = useState(false);
  const [photoOk, setPhotoOk] = useState(true);
  const [editing, setEditing] = useState(null); // { kind, id? }
  const [toast, setToast] = useState(null);

  const load = () => Promise.all([
    profileApi.get().then((r) => r.data).catch(() => null),
    profileApi.readiness().then((r) => r.data).catch(() => null),
    logbookApi.summary().then((r) => r.data).catch(() => null),
  ]).then(([p, rd, s]) => { if (p) setProfile(p); if (rd) setReadiness(rd); if (s) setSummary(s); });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const byTypeHours = useMemo(() => {
    const m = new Map();
    (summary?.byType || []).forEach((b) => m.set(normType(b.type), b.hours));
    return m;
  }, [summary]);

  if (loading) return <LightPage><div style={{ textAlign: 'center', padding: 60, color: 'var(--accent)' }}>Loading…</div></LightPage>;
  if (!profile) return <LightPage><div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Couldn’t load your profile.</div></LightPage>;

  const certs = (profile.certificates || []);
  const licences = certs.filter((c) => !['ELP', 'IR', 'ME', 'SE'].includes(c.type));
  const supportingCerts = certs.filter((c) => ['IR', 'ME', 'SE'].includes(c.type));
  const elp = certs.find((c) => c.type === 'ELP');
  const ratings = profile.ratings || [];
  const medicals = [...(profile.medicals || [])].sort((a, b) => new Date(b.expiryDate) - new Date(a.expiryDate));
  const training = profile.trainingRecords || [];
  const rtw = profile.rightToWork || [];
  const prefs = profile.preferences || null;
  const totals = summary?.totals || null;
  const mainType = summary?.byType?.[0]?.type || ratings[0]?.aircraftType || null;

  // highest licence held (drives supersession + where null-linked ratings nest)
  const highest = LICENCE_RANK.map((t) => licences.find((c) => c.type === t)).find(Boolean) || licences[0] || null;
  const highestRank = highest ? rankOf(highest.type) : 99;
  const nullRatings = ratings.filter((r) => !r.licenceId);

  const name = properCase(`${profile.firstName || ''} ${profile.lastName || ''}`.trim());
  const initials = (`${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`).toUpperCase();
  const place = [profile.city, profile.country].filter(Boolean).map(properCase).join(', ');
  const headline = [profile.role && ROLE_LABEL[profile.role], mainType && properCase(mainType), place || null].filter(Boolean).join(' · ');

  // hero chips — stored, NON-EXPIRED data only (readiness covers expired items)
  const activeLicence = LICENCE_RANK.map((t) => licences.find((c) => c.type === t && notExpired(c.expiryDate))).find(Boolean) || null;
  const chips = [];
  if (activeLicence) chips.push(activeLicence.issuingAuthority && activeLicence.issuingAuthority.toLowerCase() !== 'unknown' ? `${activeLicence.type} · ${activeLicence.issuingAuthority}` : activeLicence.type);
  if (medicals[0] && notExpired(medicals[0].expiryDate)) chips.push(`${medicalLabel(medicals[0].medicalClass)} medical`);
  if (rtw[0]) chips.push(`Right to work: ${properCase(rtw[0].country)}`);
  if (elp?.englishLevel && notExpired(elp.expiryDate)) chips.push(`English: ${elp.englishLevel}`);

  const otwParts = [];
  if (prefs?.preferredCountries?.length) otwParts.push(prefs.preferredCountries.map(properCase).join(', '));
  if (prefs?.preferredAircraft?.length) otwParts.push(prefs.preferredAircraft.join(', '));
  const otwSummary = otwParts.join(' · ');

  const toggleOtw = async () => {
    if (otwSaving) return;
    const next = !profile.openToWork;
    setProfile((p) => ({ ...p, openToWork: next }));
    setOtwSaving(true);
    try { await profileApi.update({ openToWork: next }); } catch { setProfile((p) => ({ ...p, openToWork: !next })); }
    finally { setOtwSaving(false); }
  };

  const items = readiness?.items || [];
  const strength = readiness?.strength || null;
  const nudge = readiness?.nudge || null;

  // Header describes exactly what's shown, by severity.
  const lv = { expired: 0, due: 0, missing: 0 };
  items.forEach((it) => { if (it.level === 'expired' || it.level === 'expiring') lv.expired++; else if (it.level === 'due') lv.due++; else if (it.level === 'missing') lv.missing++; });
  const attnHeader = [lv.expired && `${lv.expired} expired`, lv.due && `${lv.due} due soon`, lv.missing && `${lv.missing} to add`].filter(Boolean).join(' · ');

  const readinessText = (it) => {
    if (it.level === 'expired') return { cls: 'r', txt: it.date ? `Expired ${fmtDate(it.date)}` : 'Expired' };
    if (it.level === 'expiring') return { cls: 'r', txt: it.days === 0 ? 'Expires today' : `Expires in ${it.days} day${it.days === 1 ? '' : 's'}` };
    if (it.level === 'due') return { cls: 'a', txt: `${it.days} days left` };
    return { cls: 'n', txt: it.type === 'authority' ? 'Pick authority' : it.type === 'passport' ? 'Add date' : 'Add' };
  };

  // Card-level Edit — only single-record cards (Personal details, Job preferences).
  const EditBtn = ({ kind }) => (
    <button type="button" className="edit" onClick={() => setEditing({ kind })}><Pencil size={13} /> Edit</button>
  );
  const openEdit = (kind, id) => () => setEditing({ kind, id });
  const Chev = () => <ChevronRight size={16} className="chev" />;

  const ratingRow = (r) => {
    const h = byTypeHours.get(normType(r.aircraftType));
    return (
      <div className="row tappable" key={r.id} role="button" tabIndex={0} onClick={openEdit('rating', r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing({ kind: 'rating', id: r.id }); }}>
        <div className="main"><div className="n">{properCase(r.aircraftType)} {r.category && /single|multi/i.test(r.category) ? 'rating' : 'type rating'}</div>{h != null && <div className="d">Hours from your logbook</div>}</div>
        {h != null ? <div className="h">{hrs(h)}</div> : (r.expiryDate ? <div className="st g"><span className="dot g" />Valid</div> : null)}
        <Chev />
      </div>
    );
  };

  // ── cards as elements, placed into two independent columns on desktop ────────
  const cardLicences = (
    <div className="card" key="lic">
      <div className="card-h"><h4>Licences &amp; ratings</h4></div>
      {licences.length === 0 && ratings.length === 0
        ? <div className="empty">No licences added yet.</div>
        : licences.map((c) => {
          const superseded = highest && c.id !== highest.id && rankOf(c.type) > highestRank;
          const isHighest = highest && c.id === highest.id;
          const item = items.find((x) => x.type === 'licence' && x.itemId === c.id);
          const st = superseded ? { cls: 'n', txt: `Superseded by ${highest.type}` }
            : item ? readinessText(item) : (c.expiryDate ? { cls: notExpired(c.expiryDate) ? 'g' : 'r', txt: notExpired(c.expiryDate) ? `Valid until ${fmtDate(c.expiryDate)}` : `Expired ${fmtDate(c.expiryDate)}` } : null);
          const nested = isHighest ? [...ratings.filter((r) => r.licenceId === c.id), ...nullRatings] : ratings.filter((r) => r.licenceId === c.id);
          return (
            <React.Fragment key={c.id}>
              <div className={`row tappable${superseded ? ' superseded' : ''}`} role="button" tabIndex={0} onClick={openEdit('licence', c.id)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing({ kind: 'licence', id: c.id }); }}>
                <div className="main"><div className="n">{c.type} · {LICENCE_NAME[c.type] || 'Licence'}</div>{c.issuingAuthority && c.issuingAuthority.toLowerCase() !== 'unknown' && <div className="d">{c.issuingAuthority}</div>}</div>
                {st && <div className={`st ${st.cls}`}><span className={`dot ${st.cls}`} />{st.txt}</div>}
                <Chev />
              </div>
              {(nested.length > 0 || (isHighest && supportingCerts.length > 0)) && (
                <div className="nest">
                  {nested.map(ratingRow)}
                  {isHighest && supportingCerts.map((sc) => (
                    <div className="row" key={sc.id}><div className="main"><div className="n">{sc.type === 'IR' ? 'Instrument rating (IR)' : sc.type === 'ME' ? 'Multi-engine (MEP)' : 'Single-engine (SEP)'}</div></div><div className="st g"><span className="dot g" />{sc.expiryDate ? `Valid until ${fmtDate(sc.expiryDate)}` : 'Valid'}</div></div>
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}
      {/* English proficiency is a licence endorsement, not training */}
      <div className="row tappable" role="button" tabIndex={0} onClick={openEdit('elp', elp?.id)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing({ kind: 'elp', id: elp?.id }); }}>
        <div className="main"><div className="n">English proficiency (ICAO)</div><div className="d">{elp?.englishLevel ? `${elp.englishLevel}${elp.expiryDate ? ` · valid until ${fmtDate(elp.expiryDate)}` : ''}` : 'Required for international operations'}</div></div>
        {!elp?.englishLevel && <span className="link-sm">Add level</span>}
        <Chev />
      </div>
      <div className="addrow">
        <button type="button" className="add" onClick={() => setEditing({ kind: 'licence' })}>+ Add licence</button>
        <button type="button" className="add" onClick={() => setEditing({ kind: 'rating' })}>+ Add rating</button>
      </div>
    </div>
  );

  const cardTraining = (
    <div className="card" key="trn">
      <div className="card-h"><h4>Training</h4></div>
      {training.length === 0 ? <div className="empty">No training records yet.</div> : null}
      {training.map((t) => {
        const due = trainingDue(t);
        const cls = dueLevel(due);
        const months = TRAINING_VALIDITY[String(t.type || '').trim().toUpperCase()];
        const item = items.find((x) => x.type === 'training' && x.itemId === t.id);
        const st = item ? readinessText(item) : null;
        return (
          <div className="row tappable" key={t.id} role="button" tabIndex={0} onClick={openEdit('training', t.id)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing({ kind: 'training', id: t.id }); }}>
            <div className="main"><div className="n">{t.type}</div><div className="d">Completed {fmtDate(t.completedAt)}{months && !t.expiresAt ? ` · due every ${months} months` : ''}</div></div>
            {due ? (st && (st.cls === 'r' || st.cls === 'a')
              ? <div className={`st ${st.cls}`}><span className={`dot ${st.cls}`} />{st.txt}</div>
              : <div className={`st ${cls}`}><span className={`dot ${cls}`} />Due {fmtDue(due)}</div>) : null}
            <Chev />
          </div>
        );
      })}
      <button type="button" className="add" onClick={() => setEditing({ kind: 'training' })}>+ Add training</button>
    </div>
  );

  const hasChecks = ratings.some((r) => r.proficiencyCheckDue || r.lineCheckDate) || summary?.currency?.landingsLogged;
  const cardChecks = hasChecks ? (
    <div className="card" key="chk">
      <div className="card-h"><h4>Checks &amp; recency</h4></div>
      {ratings.filter((r) => r.proficiencyCheckDue).map((r) => (
        <div className="row" key={`p${r.id}`}><div className="main"><div className="n">LPC / OPC · {properCase(r.aircraftType)}</div>{r.proficiencyCheckDate && <div className="d">Last passed {fmtDate(r.proficiencyCheckDate)}</div>}</div><div className="st g"><span className="dot g" />Due {fmtDue(r.proficiencyCheckDue)}</div></div>
      ))}
      {ratings.filter((r) => r.lineCheckDate).map((r) => (
        <div className="row" key={`l${r.id}`}><div className="main"><div className="n">Line check · {properCase(r.aircraftType)}</div><div className="d">Last passed {fmtDate(r.lineCheckDate)}</div></div></div>
      ))}
      {summary?.currency?.day && <div className="row"><div className="main"><div className="n">90-day recency</div><div className="d">From your logbook</div></div><div className="st g"><span className="dot g" />{summary.currency.day.landings} day / {summary.currency.night.landings} night</div></div>}
    </div>
  ) : null;

  const cardMedical = (
    <div className="card" key="med">
      <div className="card-h"><h4>Medical</h4></div>
      {medicals.length === 0 ? <div className="empty">No medical on file.</div> : medicals.map((m) => {
        const item = items.find((x) => x.type === 'medical');
        const st = item ? readinessText(item) : { cls: 'g', txt: `Valid until ${fmtDate(m.expiryDate)}` };
        return <div className="row tappable" key={m.id} role="button" tabIndex={0} onClick={openEdit('medical', m.id)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing({ kind: 'medical', id: m.id }); }}><div className="main"><div className="n">{medicalLabel(m.medicalClass)}</div><div className="d">Valid until {fmtDate(m.expiryDate)}</div></div><div className={`st ${st.cls}`}><span className={`dot ${st.cls}`} />{st.txt}</div><Chev /></div>;
      })}
      <button type="button" className="add" onClick={() => setEditing({ kind: 'medical' })}>+ Add medical</button>
    </div>
  );

  const cardRtw = (
    <div className="card" key="rtw">
      <div className="card-h"><h4>Right to work &amp; passport</h4></div>
      {rtw.map((w) => (
        <div className="row tappable" key={w.id} role="button" tabIndex={0} onClick={openEdit('rtw', w.id)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing({ kind: 'rtw', id: w.id }); }}><div className="main"><div className="n">{properCase(w.country)}</div>{w.documentType && <div className="d">{properCase(w.documentType)}</div>}</div>{w.expiresAt ? <div className="st g"><span className="dot g" />Until {fmtDate(w.expiresAt)}</div> : <div className="st g"><span className="dot g" />No expiry</div>}<Chev /></div>
      ))}
      <div className="row tappable" role="button" tabIndex={0} onClick={openEdit('passport')} onKeyDown={(e) => { if (e.key === 'Enter') setEditing({ kind: 'passport' }); }}><div className="main"><div className="n">Passport</div><div className="d">Used for expiry reminders</div></div>{profile.passportExpiry ? <div className="st g"><span className="dot g" />{fmtDate(profile.passportExpiry)}</div> : <span className="link-sm">Add expiry</span>}<Chev /></div>
      <button type="button" className="add" onClick={() => setEditing({ kind: 'rtw' })}>+ Add right to work</button>
    </div>
  );

  const cardPrefs = (
    <div className="card" key="prf">
      <div className="card-h"><h4>Job preferences</h4><EditBtn kind="prefs" /></div>
      {(!prefs || (!prefs.preferredCountries?.length && !prefs.preferredAircraft?.length && !prefs.preferredContractTypes?.length))
        ? <div className="empty">No preferences set yet.</div>
        : (
          <dl className="kv">
            {prefs.preferredCountries?.length > 0 && <><dt>Regions</dt><dd><div className="tags">{prefs.preferredCountries.map((c, i) => <span key={i} className="tag">{properCase(c)}</span>)}</div></dd></>}
            {prefs.preferredAircraft?.length > 0 && <><dt>Aircraft</dt><dd><div className="tags">{prefs.preferredAircraft.map((a, i) => <span key={i} className="tag">{a}</span>)}</div></dd></>}
            {prefs.preferredContractTypes?.length > 0 && <><dt>Contract</dt><dd>{prefs.preferredContractTypes.map(properCase).join(', ')}</dd></>}
            <dt>Relocate</dt><dd>{profile.willingToRelocate ? 'Yes' : 'No'}</dd>
          </dl>
        )}
    </div>
  );

  const nationalities = pilotNationalities(profile);
  const cardPersonal = (
    <div className="card" key="per">
      <div className="card-h"><h4>Personal details</h4><EditBtn kind="personal" /></div>
      <dl className="kv">
        {place && <><dt>Location</dt><dd>{place}</dd></>}
        {nationalities.length > 0 && <><dt>{nationalities.length > 1 ? 'Nationalities' : 'Nationality'}</dt><dd>{nationalities.map(properCase).join(', ')}<span className="pv">matching only</span></dd></>}
        {profile.phone && <><dt>Phone</dt><dd>{profile.phone}<span className="pv">only you &amp; airlines you apply to</span></dd></>}
        {profile.email && <><dt>Email</dt><dd>{maskEmail(profile.email)}<span className="pv">private</span></dd></>}
        {profile.education && <><dt>Education</dt><dd>{EDU_LABEL[profile.education] || profile.education}</dd></>}
      </dl>
    </div>
  );

  // ONE ordered list — this is the phone order (and the app's), top to bottom.
  // Desktop reflows it into two balanced columns via CSS multicolumn.
  const orderedCards = [cardLicences, cardChecks, cardMedical, cardTraining, cardRtw, cardPrefs, cardPersonal].filter(Boolean);

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <div className="prof-rd">
        {/* HERO — phone/email never here */}
        <div className="herowrap">
          <div className="hero">
            {profile.photoUrl && photoOk
              ? <img className="avatar" src={profile.photoUrl} alt="" onError={() => setPhotoOk(false)} />
              : <div className="avatar initials">{initials || <User size={28} />}</div>}
            <div className="who">
              <h1>{name}</h1>
              {headline && <div className="hl">{headline}</div>}
            </div>
          </div>
          {chips.length > 0 && <div className="chips">{chips.map((c, i) => <span key={i} className="chip">{c}</span>)}</div>}
          <div className="side">
            <div className="otw">
              <button type="button" className={`sw${profile.openToWork ? ' on' : ''}`} aria-pressed={profile.openToWork} onClick={toggleOtw} aria-label="Open to work" />
              <div className="txt"><b>Open to work</b><span>{profile.openToWork ? (otwSummary || 'Visible to airlines') : 'Not visible to airlines'}</span></div>
            </div>
            <div className="hero-actions">
              <button type="button" className="btn link" onClick={() => navigate('/profile/preview')}><ExternalLink size={15} /> Preview as airline</button>
              <button type="button" className="btn" onClick={() => navigate('/cv-builder')}><Download size={15} /> Download CV</button>
              <button type="button" className="btn primary" onClick={() => setEditing({ kind: 'personal' })}><Pencil size={15} /> Edit profile</button>
            </div>
          </div>
        </div>

        {items.length > 0 && (
          <div className="attn">
            <div className="label"><span className="attn-full">Application readiness</span><span className="attn-short">Readiness</span>{attnHeader ? ` · ${attnHeader}` : ''}</div>
            <div className="grid">
              {items.map((it, i) => {
                const s = readinessText(it);
                return (
                  <div key={i} className={`ln ${s.cls}`}>
                    <div className="top"><span className={`dot ${s.cls}`} />{it.label}</div>
                    <span className="rt" style={{ color: s.cls === 'r' ? 'var(--red)' : s.cls === 'a' ? 'var(--amber)' : 'var(--faint)' }}>{it.date && (it.level === 'expiring' || it.level === 'due') ? `${s.txt} · ${fmtDate(it.date)}` : s.txt}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="strength-wrap">
          {totals && (
            <div className="snap">
              <div className="cell"><div className="v">{Math.round(totals.total).toLocaleString()}<small> h</small></div><div className="k">Total time</div></div>
              {mainType && byTypeHours.has(normType(mainType)) && <div className="cell"><div className="v">{Math.round(byTypeHours.get(normType(mainType))).toLocaleString()}<small> h</small></div><div className="k">On {properCase(mainType)}</div></div>}
              <div className="cell"><div className="v">{(totals.flightCount || 0).toLocaleString()}</div><div className="k">Flights logged</div></div>
              {ratings.length > 0 && <div className="cell"><div className="v">{ratings.length}</div><div className="k">Rating{ratings.length === 1 ? '' : 's'}</div></div>}
            </div>
          )}
          {strength && (
            <div className="strength">
              <div className="top"><span>Profile strength</span><b>{strength.pct}%</b></div>
              <div className="bar"><i style={{ width: `${strength.pct}%` }} /></div>
              {nudge?.fields?.length > 0 && (
                <div className="hint">Add {nudge.fields.slice(0, 2).map((f, i) => <React.Fragment key={i}>{i > 0 ? ' and ' : ''}<b>{f.field}</b></React.Fragment>)} to check {nudge.incompleteJobs} more job{nudge.incompleteJobs === 1 ? '' : 's'}. <a href="/jobs" onClick={(e) => { e.preventDefault(); navigate('/jobs'); }}>See jobs</a></div>
              )}
            </div>
          )}
        </div>

        {/* two independent stacking columns on desktop; single flow on phone/iPad */}
        <div className="cards">{orderedCards}</div>
      </div>

      {editing && (
        <ProfileEditSheet
          edit={editing}
          profile={profile}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setToast(msg || 'Saved'); load(); setTimeout(() => setToast(null), 2200); }}
        />
      )}

      {toast && <div className="prof-toast" role="status"><Check size={15} /> {toast}</div>}
    </LightPage>
  );
}
