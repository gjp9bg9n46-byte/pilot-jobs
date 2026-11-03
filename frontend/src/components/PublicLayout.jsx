import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import SiteFooter from './SiteFooter';
import PlaneMark from './PlaneMark';

// PublicLayout shell — used only by logged-out airline pages
// (factfile + detail). Migrated to light in Phase 12 alongside
// the airline pages themselves; the dual-shell pattern (Layout
// for authed, PublicLayout for public) now resolves to light
// surfaces in both shells. If a future route adopts PublicLayout,
// it inherits the editorial-light identity by default. Grep
// `import PublicLayout` before adding new consumers — adding a
// dark-aesthetic surface to PublicLayout would re-create the
// dual-shell mismatch this commit closed.
export default function PublicLayout() {
  const isMobile = useIsMobile();
  const css = {
    page: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
    nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 16px' : '18px 32px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 20 },
    logo: { fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', textDecoration: 'none' },
    navRight: { display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 20 },
    // Plain text, secondary colour: Tools sits beside the CTA without
    // competing with it. Two filled buttons in one bar is one too many.
    navLink: { fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 15, color: 'var(--text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap' },
    navCta: { fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 15, background: 'var(--accent)', color: '#fff', padding: '9px 18px', borderRadius: 4, textDecoration: 'none', whiteSpace: 'nowrap' },
    main: { flex: 1, background: 'var(--bg)', color: 'var(--text-primary)' },
    inner: { padding: isMobile ? '20px 16px 40px' : '32px', maxWidth: 1040, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  };

  return (
    <div className="app-light" style={css.page}>
      <nav style={css.nav}>
        <Link to="/" style={css.logo}><PlaneMark size={16} style={{ marginRight: 8 }} /> CockpitHire</Link>
        <div style={css.navRight}>
          <Link to="/tools/pf-pm" style={css.navLink}>Tools</Link>
          <Link to="/login" style={css.navCta}>Web App →</Link>
        </div>
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
