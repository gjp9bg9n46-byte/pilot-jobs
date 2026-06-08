import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import SiteFooter from './SiteFooter';

// Slim public chrome for logged-out visitors browsing /airlines and
// /airlines/:id. Light nav (matches Landing) + light footer wrapping a still-dark
// page body — the airline pages migrate to light in a later phase.
export default function PublicLayout() {
  const isMobile = useIsMobile();
  const css = {
    page: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
    nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 16px' : '18px 32px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 20 },
    logo: { fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', textDecoration: 'none' },
    navCta: { fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 15, background: 'var(--accent)', color: '#fff', padding: '9px 18px', borderRadius: 4, textDecoration: 'none' },
    // intentional — dark page body; airline pages migrate to light later
    main: { flex: 1, background: '#0A1628', color: '#E8F0FA' },
    inner: { padding: isMobile ? '20px 16px 40px' : '32px', maxWidth: 1040, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  };

  return (
    <div className="app-light" style={css.page}>
      <nav style={css.nav}>
        <Link to="/" style={css.logo}>✈ CockpitHire</Link>
        <Link to="/login" style={css.navCta}>Web App →</Link>
      </nav>
      <main style={css.main}>
        <div style={css.inner}>
          <Outlet />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
