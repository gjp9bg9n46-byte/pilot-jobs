import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Target, Globe, Lock } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import '../styles/landing-tokens.css';

// ── Content (copy preserved verbatim from the previous landing) ──────────────
const FEATURES = [
  { icon: RefreshCw,    title: 'Always-fresh listings',    body: 'We scrape Lever, Greenhouse, and direct airline career boards daily and deduplicate across sources — no stale postings, no duplicates.', photo: 'feature-fresh.webp' },
  { icon: Target,       title: 'Matched to your ratings',  body: 'Enter your certificates (ATPL, CPL), total hours, PIC time, aircraft type ratings, and issuing authority. We surface only the jobs you meet the minimums for.', photo: 'feature-ratings.webp' },
  { title: 'Instant push alerts',      body: 'New job that matches your profile? You get a push notification within minutes of it hitting the board — before the rush of applicants.', photo: 'feature-alerts.webp' },
  { title: 'Digital logbook',         body: 'Log flights directly in the app. Import from ForeFlight CSV or manual entry. Your totals update in real-time and power the matching engine.', photo: 'feature-logbook.webp' },
  { icon: Globe,        title: 'Global coverage',          body: 'Jobs across FAA, EASA, GCAA, CAAC, and CASA authorities. Regional airlines, flag carriers, cargo operators, and eVTOL companies.', photo: 'feature-coverage.webp' },
  { icon: Lock,         title: 'Private by default',       body: 'Your profile is invisible until you choose to share it. Anonymous browsing mode lets you research jobs without leaving a trace.', photo: 'feature-private.webp' },
];

const SOURCES = ['Shield AI', 'United Airlines', 'Southwest Airlines', 'Joby Aviation', 'Wisk Aero', 'Textron Aviation', 'Ameriflight', 'Contour Aviation', 'Sun Country', 'Flexjet', 'NetJets', '+ more added weekly'];

const FACTFILES = [
  { id: 'b86ff04a-8cee-4b71-aab6-1efead27e138', name: 'Emirates',        country: 'UAE',           iso: 'ae', fleet: '8 aircraft types · 117 777-300ER · 116 A380-800' },
  { id: 'f0def0a6-6e74-4ff8-a465-8f5c1b46d464', name: 'Lufthansa',       country: 'Germany',       iso: 'de', fleet: '16 aircraft types · 44 A320-200 · 41 A320neo' },
  { id: 'ac423eec-2a7a-43c4-b11f-1fb5cb92b004', name: 'Delta Air Lines', country: 'United States', iso: 'us', fleet: '20 aircraft types · 163 737-900ER · 127 A321-200' },
];

const FOOTER_COLS = [
  ['Product', [
    { label: 'Web App', to: '/login' },
    { label: 'Browse Jobs', to: '/jobs' },
    { label: 'Browse Airlines', to: '/airlines' },
  ]],
  ['For Employers', [
    { label: 'Post a Job', to: '/employer/register' },
    { label: 'Employer Login', to: '/login?as=employer' },
  ]],
  ['Company', [
    { label: 'About', href: '#' },
    { label: 'Contact', href: 'mailto:contact@cockpithire.com' },
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms', href: '#' },
  ]],
];

// Adaptive freshness — drives whether the third data-strip stat appears.
// Returns a cadence word when recent, null when stale (>7d) or missing.
function freshnessLabel(lastScrapedAt) {
  if (!lastScrapedAt) return null;
  const ageMs = Date.now() - new Date(lastScrapedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) return null;
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  if (ageMs <= WEEK) return 'Daily';
  return null;
}

// One-time fade-in on scroll (IntersectionObserver). Styling lives in landing-tokens.css.
function Reveal({ children, as: Tag = 'div', className = '', style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { el.classList.add('is-visible'); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { el.classList.add('is-visible'); io.unobserve(el); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal ${className}`} style={style}>{children}</Tag>;
}

export default function Landing() {
  const isMobile = useIsMobile();
  const [stats, setStats] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  // Prevent the shared dark body bg from showing through (iOS rubber-band).
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#F8F6F1';
    return () => { document.body.style.background = prev; };
  }, []);

  // Nav: transparent over hero, solid on scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Public aggregates for the data strip. Graceful: strip hides on failure.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    fetch('/api/stats', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setStats(d); })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, []);

  // Hero/CTA copy uses the live airline count; fall back to a sane default while
  // /api/stats is in flight so we never render "0 airlines".
  const airlineCount = (Number.isFinite(stats?.airlinesCount) && stats.airlinesCount > 0)
    ? stats.airlinesCount : 185;

  const freshness = stats ? freshnessLabel(stats.lastScrapedAt) : null; // cadence word | null
  const statEntries = stats ? [
    Number.isFinite(stats.airlinesCount) && stats.airlinesCount > 0
      ? { num: String(stats.airlinesCount), label: 'Airlines tracked', amber: true } : null,
    Number.isFinite(stats.fleetProfilesCount) && stats.fleetProfilesCount > 0
      ? { num: String(stats.fleetProfilesCount), label: 'With detailed fleets' } : null,
    freshness ? { num: freshness, label: 'Data refreshed' } : null,
  ].filter(Boolean) : [];

  // ── Type scale (desktop / mobile ~0.65× on display sizes) ─────────────────
  const display = 'var(--font-display)';
  const body = 'var(--font-body)';
  const mono = 'var(--font-mono)';
  const padY = isMobile ? 80 : 128;

  const css = {
    root: { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: body, lineHeight: 1.6, overflowX: 'hidden' },
    container: { maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 20px' : '0 40px' },

    // Nav
    nav: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 20px' : '20px 40px', background: scrolled ? 'var(--bg)' : 'transparent', borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`, transition: 'background 0.3s ease, border-color 0.3s ease' },
    wordmark: { fontFamily: display, fontWeight: 600, fontSize: isMobile ? 19 : 22, letterSpacing: '-0.01em', color: scrolled ? 'var(--text-primary)' : '#fff', textDecoration: 'none', transition: 'color 0.3s ease' },
    navCta: { fontFamily: body, fontWeight: 500, fontSize: 15, background: 'var(--accent)', color: '#fff', padding: '9px 18px', borderRadius: 4, textDecoration: 'none' },

    // Hero
    hero: { position: 'relative', width: '100%', height: isMobile ? 'auto' : '80vh', aspectRatio: isMobile ? '4 / 5' : 'auto', minHeight: isMobile ? undefined : 480, overflow: 'hidden', display: 'flex', alignItems: 'flex-end' },
    heroImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' },
    heroScrim: { position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0) 22%), linear-gradient(to top, rgba(0,0,0,0.64) 0%, rgba(0,0,0,0.12) 42%, rgba(0,0,0,0) 62%)' },
    heroContent: { position: 'relative', zIndex: 2, width: '100%', maxWidth: 760, padding: isMobile ? '0 24px 32px' : '0 64px 64px' },
    heroH1: { fontFamily: display, fontWeight: 500, fontSize: isMobile ? 44 : 72, lineHeight: 1.04, letterSpacing: '-0.02em', color: '#fff', marginBottom: isMobile ? 16 : 22 },
    heroSub: { fontFamily: body, fontWeight: 500, fontSize: isMobile ? 16 : 19, color: 'rgba(255,255,255,0.9)', maxWidth: 540, marginBottom: isMobile ? 24 : 32, lineHeight: 1.5 },

    // Data strip
    dataStrip: { borderTop: '1px solid var(--border)', padding: isMobile ? '56px 0' : '88px 0' },
    dataRow: { display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 36 : 96 },
    dataNum: { fontFamily: mono, fontWeight: 500, fontSize: isMobile ? 39 : 56, letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--text-primary)' },
    dataLabel: { fontFamily: body, fontWeight: 500, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: 14 },

    // Section primitives
    section: { padding: `${padY}px 0` },
    eyebrow: { fontFamily: body, fontWeight: 500, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-secondary)' },
    h2: { fontFamily: display, fontWeight: 500, fontSize: isMobile ? 29 : 44, letterSpacing: '-0.01em', lineHeight: 1.1, color: 'var(--text-primary)' },
    lead: { fontFamily: body, fontWeight: 400, fontSize: isMobile ? 16 : 17, lineHeight: 1.6, color: 'var(--text-secondary)' },

    // Feature grid
    grid: { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 32 },
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' },
    cardMedia: { width: '100%', height: 240, objectFit: 'cover', display: 'block' },
    cardIconPanel: { width: '100%', height: 240, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)' },
    cardBody: { padding: 32 },
    cardTitle: { fontFamily: display, fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 10 },
    cardText: { fontFamily: body, fontWeight: 400, fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)' },

    // Screenshot
    shotFrame: { display: 'block', width: '100%', maxWidth: 1000, margin: '48px auto 0', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 16px rgba(15,20,25,0.06)' },

    // Factfile teaser
    ffGrid: { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 32, marginTop: 28 },
    ffCardOuter: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' },
    ffCardLink: { display: 'block', padding: 28, textDecoration: 'none', color: 'var(--text-primary)' },
    ffTop: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 },
    flag: { width: 28, height: 21, borderRadius: 3, border: '1px solid var(--border)', display: 'block', flexShrink: 0 },
    ffName: { fontFamily: display, fontWeight: 500, fontSize: 20, letterSpacing: '-0.01em' },
    ffCountry: { fontFamily: body, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 },
    ffFleet: { fontFamily: mono, fontWeight: 400, fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' },

    // Sources
    chips: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 },
    chip: { fontFamily: body, fontWeight: 500, fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '7px 14px', borderRadius: 4 },

    // Employer CTA
    employerCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)', borderRadius: 6, padding: isMobile ? '32px 24px' : '44px 48px' },
    employerH: { fontFamily: display, fontWeight: 500, fontSize: isMobile ? 24 : 32, letterSpacing: '-0.01em', lineHeight: 1.15, color: 'var(--text-primary)', marginBottom: 12, maxWidth: 620 },
    employerSub: { fontFamily: body, fontWeight: 400, fontSize: isMobile ? 16 : 17, color: 'var(--text-secondary)', marginBottom: 28 },

    // Buttons
    btnPrimary: { display: 'inline-block', fontFamily: body, fontWeight: 500, fontSize: 16, background: 'var(--accent)', color: '#fff', padding: '14px 28px', borderRadius: 4, textDecoration: 'none' },

    // Footer
    footer: { background: 'var(--bg)', borderTop: '1px solid var(--border)' },
    footerTop: { maxWidth: 1200, margin: '0 auto', padding: isMobile ? '56px 20px 36px' : '72px 40px 48px', display: isMobile ? 'block' : 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: isMobile ? 32 : 40 },
    fBrandName: { fontFamily: display, fontWeight: 600, fontSize: 20, color: 'var(--text-primary)', textDecoration: 'none' },
    fTagline: { fontFamily: body, fontSize: 14, color: 'var(--text-secondary)', marginTop: 10 },
    fColTitle: { fontFamily: body, fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 16, marginTop: isMobile ? 28 : 0 },
    fLink: { display: 'block', fontFamily: body, fontSize: 15, color: 'var(--text-primary)', textDecoration: 'none', marginBottom: 11 },
    footerStrip: { borderTop: '1px solid var(--border)', textAlign: 'center', padding: '20px', fontFamily: body, fontSize: 13, color: 'var(--text-secondary)' },
    footerA: { color: 'var(--accent)', textDecoration: 'none' },
  };

  return (
    <div className="landing-root" style={css.root}>
      {/* 1 — Nav */}
      <nav style={css.nav}>
        <Link to="/" style={css.wordmark}>✈ CockpitHire</Link>
        <Link to="/login" className="btn-primary" style={css.navCta}>Web App →</Link>
      </nav>

      {/* 2 — Hero */}
      <header className="hero" style={css.hero}>
        <img src="/landing-photos/hero.webp" alt="Airliner taxiing on the runway at sunrise" style={css.heroImg} loading="eager" />
        <div style={css.heroScrim} />
        <div style={css.heroContent}>
          <h1 className="hero-headline" style={css.heroH1}>Your next command,<br />matched to your licence</h1>
          <p style={css.heroSub}>Filtered by your ratings, hours, and authority. No noise.</p>
          <Link to="/login" className="btn-primary" style={css.btnPrimary}>Open the Web App</Link>
        </div>
      </header>

      {/* 3 — Data strip */}
      {statEntries.length > 0 && (
        <section style={css.dataStrip}>
          <div style={css.container}>
            <Reveal style={css.dataRow}>
              {statEntries.map((s) => (
                <div key={s.label}>
                  <div style={{ ...css.dataNum, ...(s.amber ? { color: 'var(--accent-amber)' } : {}) }}>{s.num}</div>
                  <div style={css.dataLabel}>{s.label}</div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {/* 4 — Why CockpitHire */}
      <section style={css.section} id="features">
        <div style={css.container}>
          <Reveal>
            <div style={css.eyebrow}>Why CockpitHire</div>
            <h2 style={{ ...css.h2, marginTop: 14, maxWidth: 640 }}>Built for the flight deck, not a job board</h2>
          </Reveal>
          <div style={{ ...css.grid, marginTop: isMobile ? 40 : 56 }}>
            {FEATURES.map(({ icon: Icon, title, body: text, photo }) => (
              <Reveal key={title} className="card" style={css.card}>
                {photo
                  ? <img src={`/landing-photos/${photo}`} alt={title} style={css.cardMedia} loading="lazy" />
                  : <div style={css.cardIconPanel}><Icon size={40} color="var(--accent)" strokeWidth={1.5} /></div>}
                <div style={css.cardBody}>
                  <h3 style={css.cardTitle}>{title}</h3>
                  <p style={css.cardText}>{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — Screenshot section */}
      <section style={{ ...css.section, paddingTop: 0 }}>
        <div style={css.container}>
          <Reveal style={{ maxWidth: 680 }}>
            <div style={css.eyebrow}>Airline factfiles</div>
            <h2 style={{ ...css.h2, marginTop: 14 }}>Research before you apply</h2>
            <p style={{ ...css.lead, marginTop: 18 }}>Fleet, hubs, hiring status, and pilot insights for {airlineCount} airlines worldwide. Updated by pilots who actually fly them.</p>
          </Reveal>
          <Reveal>
            <img src="/screenshot-hero.webp" alt="CockpitHire airline factfile — Emirates fleet breakdown" style={css.shotFrame} loading="lazy" />
          </Reveal>
        </div>
      </section>

      {/* 6 — Factfile teaser */}
      <section style={{ ...css.section, paddingTop: 0 }}>
        <div style={css.container}>
          <div style={css.ffGrid}>
            {FACTFILES.map((a) => (
              <Reveal key={a.id} className="card" style={css.ffCardOuter}>
                <Link to={`/airlines/${a.id}`} style={css.ffCardLink}>
                  <div style={css.ffTop}>
                    <img src={`https://flagcdn.com/w40/${a.iso}.png`} srcSet={`https://flagcdn.com/w80/${a.iso}.png 2x`} alt="" style={css.flag} loading="lazy" width="28" height="21" />
                    <span style={css.ffName}>{a.name}</span>
                  </div>
                  <div style={css.ffCountry}>{a.country}</div>
                  <div style={css.ffFleet}>{a.fleet}</div>
                </Link>
              </Reveal>
            ))}
          </div>
          <div style={{ marginTop: 40 }}>
            <Link to="/airlines" className="btn-primary" style={css.btnPrimary}>Browse {airlineCount} airlines →</Link>
          </div>
        </div>
      </section>

      {/* 7 — Sources strip */}
      <section style={{ ...css.section, paddingTop: 0 }}>
        <div style={css.container}>
          <Reveal>
            <div style={css.eyebrow}>Sources we monitor</div>
            <div style={css.chips}>{SOURCES.map((s) => <span key={s} style={css.chip}>{s}</span>)}</div>
          </Reveal>
        </div>
      </section>

      {/* 8 — Employer CTA */}
      <section style={{ ...css.section, paddingTop: 0 }}>
        <div style={css.container}>
          <Reveal style={css.employerCard}>
            <h2 style={css.employerH}>Are you an airline, charter operator, or flight school?</h2>
            <p style={css.employerSub}>Post pilot openings directly to our community.</p>
            <Link to="/employer/register" className="btn-primary" style={css.btnPrimary}>Apply to post jobs →</Link>
          </Reveal>
        </div>
      </section>

      {/* 9 — Footer (landing-only light footer; shared SiteFooter left untouched) */}
      <footer style={css.footer}>
        <div style={css.footerTop}>
          <div>
            <Link to="/" style={css.fBrandName}>✈ CockpitHire</Link>
            <div style={css.fTagline}>Built by pilots, for pilots</div>
          </div>
          {FOOTER_COLS.map(([title, links]) => (
            <div key={title}>
              <div style={css.fColTitle}>{title}</div>
              {links.map((l) => (
                l.to
                  ? <Link key={l.label} to={l.to} className="ls-link" style={css.fLink}>{l.label}</Link>
                  : <a key={l.label} href={l.href} className="ls-link" style={css.fLink}>{l.label}</a>
              ))}
            </div>
          ))}
        </div>
        <div style={css.footerStrip}>
          © 2026 CockpitHire &nbsp;·&nbsp; <a href="mailto:contact@cockpithire.com" style={css.footerA}>contact@cockpithire.com</a>
        </div>
      </footer>
    </div>
  );
}
