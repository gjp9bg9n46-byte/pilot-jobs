import React from 'react';
import { Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';

// Marketing landing — ported from backend/public/index.html (same palette/copy),
// with a "Web App" CTA into /login. Store badges stay placeholder (no URLs).
const C = { bg: '#0A1628', surface: '#1B2B4B', accent: '#00B4D8', text: '#E8F0FA', muted: '#7A8CA0', border: '#243050' };

const FEATURES = [
  ['🔍', 'Always-fresh listings', 'We scrape Lever, Greenhouse, and direct airline career boards every 6 hours and deduplicate across sources — no stale postings, no duplicates.'],
  ['🎯', 'Matched to your ratings', 'Enter your certificates (ATPL, CPL), total hours, PIC time, aircraft type ratings, and issuing authority. We surface only the jobs you meet the minimums for.'],
  ['🔔', 'Instant push alerts', 'New job that matches your profile? You get a push notification within minutes of it hitting the board — before the rush of applicants.'],
  ['📋', 'Digital logbook', 'Log flights directly in the app. Import from ForeFlight CSV or manual entry. Your totals update in real-time and power the matching engine.'],
  ['🌍', 'Global coverage', 'Jobs across FAA, EASA, GCAA, CAAC, and CASA authorities. Regional airlines, flag carriers, cargo operators, and eVTOL companies.'],
  ['🔒', 'Private by default', 'Your profile is invisible until you choose to share it. Anonymous browsing mode lets you research jobs without leaving a trace.'],
];
const SOURCES = ['Shield AI', 'United Airlines', 'Southwest Airlines', 'Joby Aviation', 'Wisk Aero', 'Textron Aviation', 'Ameriflight', 'Contour Aviation', 'Sun Country', 'Flexjet', 'NetJets', '+ more added weekly'];

const AppleIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.19 1.31-2.16 3.91.03 3.09 2.61 4.12 2.64 4.13l-.03.08zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>);
const PlayIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.3.17.64.23.99.17l12.5-7.08-2.62-2.62-10.87 9.53zm-1.81-20.3C1.13 3.8 1 4.18 1 4.64v14.72c0 .46.13.84.37 1.18l.06.06L9.15 12.9v-.2L1.43 3.4l-.06.06zm18.33 8.78l-2.53-1.44-2.93 2.93 2.93 2.93 2.56-1.45c.73-.42.73-1.55-.03-1.97zm-17.19 9.52l10.87-9.53-2.62-2.62L.31 3.07c-.3-.16-.53-.04-.53.29v18.14c0 .34.23.6.53.26z" /></svg>);

export default function Landing() {
  const isMobile = useIsMobile();
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
    features: { maxWidth: 960, margin: '0 auto', padding: '0 24px 96px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 },
    card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 26px' },
    cardIcon: { fontSize: '1.6rem', marginBottom: 16 },
    cardH3: { fontSize: '1rem', fontWeight: 700, marginBottom: 8 },
    cardP: { fontSize: '0.9rem', color: C.muted, lineHeight: 1.65 },
    sources: { textAlign: 'center', padding: '0 24px 96px' },
    sourcesLabel: { fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 24 },
    chips: { display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    chip: { background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: '0.82rem', fontWeight: 600, padding: '6px 16px', borderRadius: 20 },
    download: { background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, textAlign: 'center', padding: '80px 24px' },
    downloadH2: { fontSize: '1.8rem', fontWeight: 800, marginBottom: 12 },
    storeButtons: { display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 36 },
    storeBtn: { display: 'inline-flex', alignItems: 'center', gap: 10, background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontWeight: 600, fontSize: '0.9rem', padding: '13px 22px', borderRadius: 10, textDecoration: 'none', opacity: 0.6, cursor: 'default' },
    storeSoon: { display: 'block', fontSize: '0.7rem', fontWeight: 400, color: C.muted, marginTop: 2 },
    footer: { textAlign: 'center', padding: '36px 24px', color: C.muted, fontSize: '0.82rem' },
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
        <p style={css.sub}>CockpitHire searches airline and aviation career boards worldwide, then filters by your ratings, flight hours, and issuing authority — so you only see jobs you actually qualify for.</p>
        <div style={css.ctaGroup}>
          <Link to="/login" style={css.primary}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" /><path d="M12 8v8M8 12l4 4 4-4" /></svg>
            Open the Web App
          </Link>
          <a href="#features" style={css.ghost}>See how it works</a>
        </div>
      </section>

      <section style={css.features} id="features">
        {FEATURES.map(([icon, title, body]) => (
          <div key={title} style={css.card}>
            <div style={css.cardIcon}>{icon}</div>
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
        <p style={{ color: C.muted }}>Use the web app now, or grab the mobile apps when they land.</p>
        <div style={css.storeButtons}>
          <span style={css.storeBtn}><AppleIcon /><span>App Store<span style={css.storeSoon}>Coming soon</span></span></span>
          <span style={css.storeBtn}><PlayIcon /><span>Google Play<span style={css.storeSoon}>Coming soon</span></span></span>
        </div>
      </section>

      <footer style={css.footer}>
        <p>© 2026 CockpitHire &nbsp;·&nbsp; <a href="mailto:contact@cockpithire.com" style={css.footerA}>contact@cockpithire.com</a></p>
      </footer>
    </div>
  );
}
