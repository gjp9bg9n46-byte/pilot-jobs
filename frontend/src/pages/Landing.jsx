import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, MinusCircle, X, Bell, Plus, ArrowRight, Menu } from 'lucide-react';
import PlaneMark from '../components/PlaneMark';
import { statsApi } from '../services/api';
import '../styles/landing-v2.css';

const num = (n) => (typeof n === 'number' ? n.toLocaleString('en') : '');
const initials = (name) => {
  const words = (name || '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || '').slice(0, 2).toUpperCase() || '✈';
};

const REQ_ICON = {
  met: <Check size={18} strokeWidth={2.4} color="#15803D" />,
  notmet: <X size={18} strokeWidth={2.4} color="#B42318" />,
  notstated: <MinusCircle size={18} strokeWidth={2.2} color="#9AA5B4" />,
};

const FAQ = [
  { q: 'Is CockpitHire free for pilots?', a: 'Yes. Creating a profile, matching, alerts and the logbook are free.' },
  { q: 'Where do the jobs come from?', a: 'Airline career pages and job platforms. Every job links to its original source.' },
  { q: 'Who can see my profile?', a: 'Nobody, unless you turn on Open to work or share it yourself.' },
  { q: 'Do you handle my application?', a: "No. You apply on the airline's own site, and your application goes straight to them." },
];

export default function Landing() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    statsApi.landing().then((res) => { if (alive) setData(res.data); }).catch(() => { /* graceful: render without live numbers */ });
    return () => { alive = false; };
  }, []);

  const d = data || {};
  const counts = d.counts || {};
  const hero = d.hero || null;
  const notif = d.notif || null;
  const alert = d.alert || null;
  const operators = d.topOperators || [];
  const factfiles = d.factfiles || [];
  const jobsLabel = typeof counts.liveJobs === 'number' ? `Browse ${num(counts.liveJobs)} live jobs` : 'Browse live jobs';

  return (
    <div className="lp">
      <nav><div className="wrap">
        <Link className="logo" to="/"><PlaneMark size={20} /> CockpitHire</Link>
        <div className="links"><a href="#how">How it works</a><Link to="/jobs">Jobs</Link><Link to="/airlines">Airlines</Link><Link to="/employer/register">For employers</Link></div>
        <div className="navr">
          <Link className="btn ghost" to="/login">Log in</Link>
          <Link className="btn primary" to="/register">Create free profile</Link>
          <Link className="menu" to="/login" aria-label="Menu"><Menu size={18} color="#0F1B2D" /></Link>
        </div>
      </div></nav>

      <main>
      <header className="hero"><div className="wrap">
        <div>
          <p className="eyebrow">Pilot jobs, checked against your licence</p>
          <h1>Your next command, matched to your licence.</h1>
          <p className="lead">Every airline job is checked against your ratings, hours and licence authority, requirement by requirement. You see what you qualify for, what you are missing, and what the airline did not say.</p>
          <div className="ctas">
            <Link className="btn primary" to="/register">Create your free pilot profile</Link>
            <Link className="btn ghost" to="/jobs">{jobsLabel}</Link>
          </div>
          <p className="small">Free for pilots. You apply on the airline's own site.</p>
        </div>

        <div className="vis">
          <div className="photo">
            <picture>
              <source media="(max-width:820px)" type="image/avif" srcSet="/hero/flightdeck-wide-800.avif 800w, /hero/flightdeck-wide-1280.avif 1280w, /hero/flightdeck-wide-1640.avif 1640w" sizes="100vw" />
              <source media="(max-width:820px)" type="image/webp" srcSet="/hero/flightdeck-wide-800.webp 800w, /hero/flightdeck-wide-1280.webp 1280w, /hero/flightdeck-wide-1640.webp 1640w" sizes="100vw" />
              <source type="image/avif" srcSet="/hero/flightdeck-port-640.avif 640w, /hero/flightdeck-port-960.avif 960w, /hero/flightdeck-port-1280.avif 1280w" sizes="46vw" />
              <source type="image/webp" srcSet="/hero/flightdeck-port-640.webp 640w, /hero/flightdeck-port-960.webp 960w, /hero/flightdeck-port-1280.webp 1280w" sizes="46vw" />
              <img src="/hero/flightdeck-port-960.webp" width="525" height="700" alt="View out of an airliner flight-deck windscreen at golden hour: a sunset horizon above a cloud layer" fetchpriority="high" decoding="async" />
            </picture>
          </div>
          {/* Card / notification / label render ALWAYS (skeleton until data) so the
              hero reserves its space — no layout shift when the live job arrives. */}
          <div className="job">
            <div className="jhead">
              <div className="mark">{hero ? initials(hero.operator) : ''}</div>
              <div className="jtwrap">
                {hero
                  ? <><div className="jt" title={hero.title}>{hero.title}</div><div className="jm">{hero.operator}{hero.location ? ` · ${hero.location}` : ''}</div></>
                  : <><span className="sk" style={{ width: '72%' }} /><span className="sk" style={{ width: '46%', marginTop: 8 }} /></>}
              </div>
              {hero && <span className="fit">You qualify</span>}
            </div>
            <ul className="reqs">
              {(hero ? hero.reqs : [0, 1, 2, 3, 4]).map((r, i) => (hero
                ? <li key={i} className={r.status === 'notstated' ? 'unk' : ''}>{REQ_ICON[r.status]}{r.label}<span className="v">{r.value}</span></li>
                : <li key={i}><span className="sk sk-dot" /><span className="sk" style={{ width: '52%' }} /><span className="v"><span className="sk" style={{ width: 64 }} /></span></li>))}
            </ul>
            <div className="jfoot"><span>Source: {hero ? `${hero.operator} careers` : 'airline careers'}</span><Link className="btn primary" to="/jobs">Apply on airline site</Link></div>
          </div>
          <div className="notif">
            <div className="ic"><Bell size={16} color="#fff" /></div>
            <div className="ntxt"><b>New job you qualify for</b>{notif
              ? <span>{notif.title}{notif.operator ? ` · ${notif.operator}` : ''}{notif.location ? `, ${notif.location}` : ''}</span>
              : <span className="sk" style={{ width: '90%', marginTop: 4 }} />}</div><em>now</em>
          </div>
          <p className="exlabel"><MinusCircle size={13} color="#5E6A7B" /> Example match for a sample A320 First Officer profile</p>
        </div>
      </div></header>

      <div className="proof"><div className="wrap">
        <div className="counts">
          <div className="count"><b>{num(counts.liveJobs)}</b><span>live pilot jobs</span></div>
          <div className="count"><b>{num(counts.factfiles)}</b><span>airline factfiles</span></div>
          <div className="count"><b>Daily</b><span>sources refreshed</span></div>
        </div>
        {operators.length > 0 && (
          <div className="hiring"><p>Hiring now on CockpitHire</p>
            <div className="names">{operators.map((o) => <span key={o}>{o}</span>)}</div>
          </div>
        )}
      </div></div>

      <section className="block" id="how"><div className="wrap">
        <div className="sechead"><p className="eyebrow">How it works</p><h2>Four steps from logbook to application</h2>
          <p>No CV upload, no guessing which job is worth your time.</p></div>

        <div className="step">
          <div><span className="num">01</span><h3>Enter your licence once</h3><p>Licences, ratings, medical and English level go into your profile. Your hours come straight from your logbook, so they are always current.</p></div>
          <div className="panel"><div className="card">
            <div className="row"><span className="k">Licence</span><span className="val">ATPL · EASA</span></div>
            <div className="row"><span className="k">Type rating</span><span className="val">Airbus A320</span></div>
            <div className="row"><span className="k">Total time</span><span className="val">1,515 h</span></div>
            <div className="row"><span className="k">PIC</span><span className="val">From logbook</span></div>
            <div className="row"><span className="k">Medical</span><span className="val">Class 1 · Nov 2026</span></div>
          </div></div>
        </div>

        <div className="step">
          <div><span className="num">02</span><h3>Every job is checked, requirement by requirement</h3><p>We compare each listing with your profile and show the result plainly. If an airline did not state a requirement, we say so instead of guessing.</p></div>
          <div className="panel"><div className="card">
            <div className="row"><span><span className="dot" style={{ background: '#15803D' }} />Total time 500 h</span><span className="k">1,515 h · Met</span></div>
            <div className="row"><span><span className="dot" style={{ background: '#15803D' }} />EASA ATPL</span><span className="k">Met</span></div>
            <div className="row"><span><span className="dot" style={{ background: '#B42318' }} />500 h PIC</span><span className="k">Not met</span></div>
            <div className="row"><span><span className="dot" style={{ background: '#9AA5B4' }} />Type rating</span><span className="k">Not stated</span></div>
          </div>
          <div className="legend"><span><span className="dot" style={{ background: '#15803D' }} />Met</span><span><span className="dot" style={{ background: '#B42318' }} />Not met</span><span><span className="dot" style={{ background: '#9AA5B4' }} />Not stated</span></div></div>
        </div>

        <div className="step">
          <div><span className="num">03</span><h3>An alert when a job fits</h3><p>When a new job matches your profile, your phone tells you. Only jobs you qualify for, not a daily digest of everything.</p></div>
          <div className="panel"><div className="phone-mini"><div className="scr"><div className="time">09:41</div>
            <div className="pn"><b>CockpitHire</b>{alert && alert.operator ? `${alert.title} at ${alert.operator} matches your profile.` : 'A new job that matches your profile.'}<br /><small>{alert ? `${alert.location || ''}${alert.postedToday ? ' · posted today' : ''}` : 'posted today'}</small></div></div></div></div>
        </div>

        <div className="step">
          <div><span className="num">04</span><h3>Apply at the source</h3><p>One tap opens the airline's own posting. Your application goes straight to the employer. We never sit in the middle.</p></div>
          <div className="panel"><div className="src"><span className="url">{hero && hero.apply ? `${hero.apply.host}${hero.apply.path}` : "the airline's own careers page"}</span><Link className="btn primary" to="/jobs" style={{ height: 42 }}>Apply</Link></div></div>
        </div>
      </div></section>

      <section className="block alt"><div className="wrap">
        <div className="sechead"><p className="eyebrow">Airline factfiles</p><h2>Know the airline before you apply</h2>
          <p>Fleet, bases and open pilot jobs for {typeof counts.factfiles === 'number' ? num(counts.factfiles) : 'hundreds of'} airlines, in one place.</p></div>
        {factfiles.length > 0 && (
          <div className="ff">
            {factfiles.map((f) => (
              <div className="ffc" key={f.id}><h3>{f.name}</h3><div className="c">{f.country}</div>
                <dl><dt>Fleet</dt><dd>{f.fleet}</dd><dt>Base</dt><dd>{f.base}</dd><dt>Pilot jobs</dt><dd>{f.open} open</dd></dl>
                <Link className="open" to={`/airlines/${f.id}`}>View factfile<ArrowRight size={15} /></Link></div>
            ))}
          </div>
        )}
        <Link className="more" to="/airlines">Browse all {typeof counts.factfiles === 'number' ? num(counts.factfiles) : ''} airlines <ArrowRight size={15} style={{ verticalAlign: 'middle' }} /></Link>
      </div></section>

      <section className="block"><div className="wrap faq">
        <div><p className="eyebrow">Questions</p><h2 style={{ fontSize: 40, lineHeight: 1.1 }}>Straight answers</h2></div>
        <div className="qa">
          {FAQ.map((f, i) => (
            <details key={i} open={i === 0}><summary>{f.q}<Plus size={18} color="#4A5668" /></summary><p>{f.a}</p></details>
          ))}
        </div>
      </div></section>

      <div className="emp"><div className="wrap">
        <div><h2>Hiring pilots?</h2><p>Post your openings and they are shown to pilots whose licence, ratings and hours meet your minimums.</p></div>
        <Link className="btn" to="/employer/register">Post a job</Link>
      </div></div>
      </main>

      <footer><div className="wrap">
        <div className="fgrid">
          <div><span className="logo"><PlaneMark size={20} /> CockpitHire</span><p style={{ color: 'var(--sub)', margin: '12px 0 0', maxWidth: '22em', lineHeight: 1.6 }}>Built by pilots, for pilots. Aviation careers worldwide.</p></div>
          <nav aria-label="Pilots"><p className="fh">Pilots</p><ul><li><Link to="/register">Create profile</Link></li><li><Link to="/jobs">Browse jobs</Link></li><li><Link to="/airlines">Airline factfiles</Link></li><li><Link to="/login">Log in</Link></li></ul></nav>
          <nav aria-label="Employers"><p className="fh">Employers</p><ul><li><Link to="/employer/register">Post a job</Link></li><li><Link to="/employer/login">Employer login</Link></li></ul></nav>
          <nav aria-label="Company"><p className="fh">Company</p><ul><li><Link to="/about">About</Link></li><li><a href="mailto:contact@cockpithire.com">Contact</a></li><li><Link to="/privacy">Privacy</Link></li><li><Link to="/terms">Terms</Link></li></ul></nav>
        </div>
        <div className="fbot"><span>© 2026 CockpitHire</span><span>Photo: Benjamin Chambon / Unsplash &nbsp;·&nbsp; contact@cockpithire.com</span></div>
      </div></footer>
    </div>
  );
}
