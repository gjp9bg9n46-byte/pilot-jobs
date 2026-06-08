import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Target, Bell, ClipboardList, Globe, Lock } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

// Marketing landing — same palette/copy as the app. Lucide icons (no emoji).
const C = { bg: '#0A1628', surface: '#1B2B4B', accent: '#00B4D8', text: '#E8F0FA', muted: '#7A8CA0', border: '#243050' };

const FEATURES = [
  [RefreshCw, 'Always-fresh listings', 'We scrape Lever, Greenhouse, and direct airline career boards every 6 hours and deduplicate across sources — no stale postings, no duplicates.'],
  [Target, 'Matched to your ratings', 'Enter your certificates (ATPL, CPL), total hours, PIC time, aircraft type ratings, and issuing authority. We surface only the jobs you meet the minimums for.'],
  [Bell, 'Instant push alerts', 'New job that matches your profile? You get a push notification within minutes of it hitting the board — before the rush of applicants.'],
  [ClipboardList, 'Digital logbook', 'Log flights directly in the app. Import from ForeFlight CSV or manual entry. Your totals update in real-time and power the matching engine.'],
  [Globe, 'Global coverage', 'Jobs across FAA, EASA, GCAA, CAAC, and CASA authorities. Regional airlines, flag carriers, cargo operators, and eVTOL companies.'],
  [Lock, 'Private by default', 'Your profile is invisible until you choose to share it. Anonymous browsing mode lets you research jobs without leaving a trace.'],
];
const SOURCES = ['Shield AI', 'United Airlines', 'Southwest Airlines', 'Joby Aviation', 'Wisk Aero', 'Textron Aviation', 'Ameriflight', 'Contour Aviation', 'Sun Country', 'Flexjet', 'NetJets', '+ more added weekly'];

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

// Adaptive freshness label from lastScrapedAt. Returns null when the data is
// missing or stale (>7 days) — better to hide than to advertise a stalled scraper.
function freshnessLabel(lastScrapedAt) {
  if (!lastScrapedAt) return null;
  const ageMs = Date.now() - new Date(lastScrapedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) return null;
  const HOUR = 36 * 60 * 60 * 1000;
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  if (ageMs <= HOUR) return 'Updated today';
  if (ageMs <= WEEK) return 'Updated within the week';
  return null;
}

export default function Landing() {
  const isMobile = useIsMobile();
  const [stats, setStats] = useState(null);

  // Graceful, non-blocking: fetch public aggregates on mount with a short
  // timeout. On any failure/slowness the strip simply never appears — the
  // landing always renders without it. No spinner, no error UI.
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

  const statItems = stats ? [
    Number.isFinite(stats.airlinesCount) && stats.airlinesCount > 0
      ? `${stats.airlinesCount} airlines tracked` : null,
    Number.isFinite(stats.fleetProfilesCount) && stats.fleetProfilesCount > 0
      ? `${stats.fleetProfilesCount} with detailed fleets` : null,
    freshnessLabel(stats.lastScrapedAt),
  ].filter(Boolean) : [];

  const css = {
    page: { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1.6 },
    nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '16px 20px' : '20px 40px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: 'rgba(10,22,40,0.92)', backdropFilter: 'blur(8px)', zIndex: 10 },
    logo: { fontSize: '1.2rem', fontWeight: 800, color: C.accent, letterSpacing: '-0.3px' },
    navCta: { background: C.accent, color: '#fff', fontWeight: 700, fontSize: '0.85rem', padding: '8px 16px', borderRadius: 9, textDecoration: 'none' },
    hero: { maxWidth: 720, margin: '0 auto', padding: isMobile ? '56px 20px 56px' : '96px 24px 80px', textAlign: 'center' },
    tag: { display: 'inline-block', background: 'rgba(0,180,216,0.12)', border: '1px solid rgba(0,180,216,0.3)', color: C.accent, fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', borderRadius: 20, marginBottom: 28 },
    h1: { fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.5px', marginBottom: 20 },
    sub: { fontSize: '1.05rem', color: C.muted, maxWidth: 520, margin: '0 auto 48px', lineHeight: 1.7 },
    ctaGroup: { display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' },
    primary: { display: 'inline-flex', alignItems: 'center', gap: 8, background: C.accent, color: '#fff', fontWeight: 700, fontSize: '0.95rem', padding: '14px 28px', borderRadius: 10, textDecoration: 'none' },
    ghost: { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: C.muted, fontWeight: 600, fontSize: '0.95rem', padding: '14px 28px', borderRadius: 10, border: `1px solid ${C.border}`, textDecoration: 'none' },
    statStrip: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: isMobile ? '6px 14px' : '8px 18px', marginTop: 36, color: C.muted, fontSize: '0.85rem', fontWeight: 600 },
    statItem: { whiteSpace: 'nowrap' },
    statNum: { color: C.accent, fontWeight: 700 },
    statDot: { color: C.border },
    features: { maxWidth: 960, margin: '0 auto', padding: '0 24px 96px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 },
    card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 26px' },
    cardIcon: { color: C.accent, marginBottom: 16 },
    cardH3: { fontSize: '1rem', fontWeight: 700, marginBottom: 8 },
    cardP: { fontSize: '0.9rem', color: C.muted, lineHeight: 1.65 },
    sources: { textAlign: 'center', padding: '0 24px 96px' },
    sourcesLabel: { fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 24 },
    chips: { display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    chip: { background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: '0.82rem', fontWeight: 600, padding: '6px 16px', borderRadius: 20 },
    download: { background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, textAlign: 'center', padding: '80px 24px' },
    downloadH2: { fontSize: '1.8rem', fontWeight: 800, marginBottom: 12 },
    comingSoon: { color: C.muted, fontSize: '0.95rem', marginTop: 20 },
    // footer
    footer: { borderTop: `1px solid ${C.border}` },
    footerTop: { maxWidth: 960, margin: '0 auto', padding: isMobile ? '40px 24px 28px' : '52px 40px 36px', display: isMobile ? 'block' : 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: isMobile ? 28 : 32 },
    fBrand: { marginBottom: isMobile ? 28 : 0 },
    fLogo: { fontSize: '1.05rem', fontWeight: 800, color: C.accent, letterSpacing: '-0.3px' },
    fTagline: { color: C.muted, fontSize: '0.82rem', marginTop: 8 },
    fColTitle: { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 14, marginTop: isMobile ? 4 : 0 },
    fLink: { display: 'block', color: C.text, fontSize: '0.88rem', textDecoration: 'none', marginBottom: 10, opacity: 0.85 },
    footerStrip: { borderTop: `1px solid ${C.border}`, textAlign: 'center', padding: '18px 24px', color: C.muted, fontSize: '0.8rem' },
    footerA: { color: C.accent, textDecoration: 'none' },
  };

  return (
    <div style={css.page}>
      <nav style={css.nav}>
        <span style={css.logo}>✈ CockpitHire</span>
        <Link to="/login" style={css.navCta}>Web App →</Link>
      </nav>

      <section style={css.hero}>
        <div style={css.tag}>Pilot job search, reimagined</div>
        <h1 style={css.h1}>Your next command,<br /><span style={{ color: C.accent }}>matched to your licence</span></h1>
        <p style={css.sub}>Filtered by your ratings, hours, and authority. No noise.</p>
        <div style={css.ctaGroup}>
          <Link to="/login" style={css.primary}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" /><path d="M12 8v8M8 12l4 4 4-4" /></svg>
            Open the Web App
          </Link>
          <a href="#features" style={css.ghost}>See how it works</a>
        </div>
        {statItems.length > 0 && (
          <div style={css.statStrip}>
            {statItems.map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <span style={css.statDot} aria-hidden>·</span>}
                <span style={css.statItem}>{s}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </section>

      <section style={css.features} id="features">
        {FEATURES.map(([Icon, title, body]) => (
          <div key={title} style={css.card}>
            <div style={css.cardIcon}><Icon size={26} /></div>
            <h3 style={css.cardH3}>{title}</h3>
            <p style={css.cardP}>{body}</p>
          </div>
        ))}
      </section>

      <section style={css.sources}>
        <p style={css.sourcesLabel}>Sources we monitor</p>
        <div style={css.chips}>{SOURCES.map((s) => <span key={s} style={css.chip}>{s}</span>)}</div>
      </section>

      <section style={css.download} id="download">
        <h2 style={css.downloadH2}>Ready when you are</h2>
        <p style={{ color: C.muted }}>Set up your profile in under a minute — right in your browser.</p>
        <p style={css.comingSoon}>Mobile apps coming soon — bookmark cockpithire.com for now.</p>
      </section>

      <footer style={css.footer}>
        <div style={css.footerTop}>
          <div style={css.fBrand}>
            <span style={css.fLogo}>✈ CockpitHire</span>
            <div style={css.fTagline}>Built by pilots, for pilots</div>
          </div>
          {FOOTER_COLS.map(([title, links]) => (
            <div key={title}>
              <div style={css.fColTitle}>{title}</div>
              {links.map((l) => (
                l.to
                  ? <Link key={l.label} to={l.to} style={css.fLink}>{l.label}</Link>
                  : <a key={l.label} href={l.href} style={css.fLink}>{l.label}</a>
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
