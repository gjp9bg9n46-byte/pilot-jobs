import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import SiteFooter from './SiteFooter';

// Slim public chrome for logged-out visitors browsing /airlines and
// /airlines/:id. Reuses the Landing nav design (✈ CockpitHire + Web App →).
// No pilot sidebar, no admin links, no authenticated API calls on mount.
const C = { bg: '#0A1628', accent: '#00B4D8', border: '#243050' };

export default function PublicLayout() {
  const isMobile = useIsMobile();
  const css = {
    page: { minHeight: '100vh', background: C.bg, color: '#E8F0FA', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' },
    nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 16px' : '18px 32px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: 'rgba(10,22,40,0.92)', backdropFilter: 'blur(8px)', zIndex: 20 },
    logo: { fontSize: '1.2rem', fontWeight: 800, color: C.accent, letterSpacing: '-0.3px', textDecoration: 'none' },
    navCta: { background: C.accent, color: '#fff', fontWeight: 700, fontSize: '0.85rem', padding: '8px 16px', borderRadius: 9, textDecoration: 'none' },
    main: { flex: 1, padding: isMobile ? '20px 16px 40px' : '32px', maxWidth: 1040, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  };

  return (
    <div style={css.page}>
      <nav style={css.nav}>
        <Link to="/" style={css.logo}>✈ CockpitHire</Link>
        <Link to="/login" style={css.navCta}>Web App →</Link>
      </nav>
      <main style={css.main}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
