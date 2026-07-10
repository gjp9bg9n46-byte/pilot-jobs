import React from 'react';
import { Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile';

// Shared shell for the public About / Privacy / Terms pages: slim header with
// the wordmark, readable single-column prose, and a small footer strip.
export default function LegalShell({ title, updated, children }) {
  const isMobile = useIsMobile();
  const css = {
    page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' },
    nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 16px' : '18px 32px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' },
    logo: { fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', textDecoration: 'none' },
    cta: { fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 15, background: 'var(--accent)', color: '#fff', padding: '8px 16px', borderRadius: 4, textDecoration: 'none' },
    main: { flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: isMobile ? '36px 20px 72px' : '56px 32px 96px', boxSizing: 'border-box' },
    h1: { fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? 30 : 40, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 },
    updated: { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 32 },
    body: { fontFamily: 'var(--font-body)', fontSize: 16, lineHeight: 1.75, color: 'var(--text-primary)' },
    strip: { borderTop: '1px solid var(--border)', textAlign: 'center', padding: 18, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)' },
  };

  return (
    <div style={css.page}>
      <nav style={css.nav}>
        <Link to="/" style={css.logo}>✈ CockpitHire</Link>
        <Link to="/register" style={css.cta}>Register</Link>
      </nav>
      <main style={css.main}>
        <h1 style={css.h1}>{title}</h1>
        {updated && <div style={css.updated}>Last updated: {updated}</div>}
        <div style={css.body} className="legal-prose">{children}</div>
      </main>
      <div style={css.strip}>© 2026 CockpitHire · <a href="mailto:contact@cockpithire.com" style={{ color: 'var(--accent)', textDecoration: 'none' }}>contact@cockpithire.com</a></div>
      <style>{`
        .legal-prose h2 { font-family: var(--font-display); font-weight: 500; font-size: 22px; margin: 36px 0 12px; }
        .legal-prose p, .legal-prose li { color: var(--text-primary); }
        .legal-prose ul { padding-left: 22px; }
        .legal-prose a { color: var(--accent); }
      `}</style>
    </div>
  );
}
