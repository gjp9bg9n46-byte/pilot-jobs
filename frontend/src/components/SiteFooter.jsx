import React from 'react';
import { Link } from 'react-router-dom';
import PlaneMark from './PlaneMark';
import { useIsMobile } from '../hooks/useIsMobile';

// Shared marketing footer (light theme). Currently rendered only by PublicLayout
// (the landing has its own inline footer). Must sit inside an .app-light subtree
// so the .footer-link hover utility resolves.
const FOOTER_COLS = [
  ['Product', [
    { label: 'Web App', to: '/login' },
    { label: 'Browse Jobs', to: '/jobs' },
    { label: 'Browse Airlines', to: '/airlines' },
  ]],
  ['For Employers', [
    { label: 'Post a Job', to: '/employer/register' },
    { label: 'Employer Login', to: '/employer/login' },
  ]],
  ['Company', [
    { label: 'About', href: '#' },
    { label: 'Contact', href: 'mailto:contact@cockpithire.com' },
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms', href: '#' },
  ]],
];

export default function SiteFooter() {
  const isMobile = useIsMobile();
  const css = {
    footer: { background: 'var(--bg)', borderTop: '1px solid var(--border)' },
    footerTop: { maxWidth: 960, margin: '0 auto', padding: isMobile ? '40px 24px 28px' : '52px 40px 36px', display: isMobile ? 'block' : 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: isMobile ? 28 : 32 },
    fBrand: { marginBottom: isMobile ? 28 : 0 },
    fLogo: { fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', textDecoration: 'none' },
    fTagline: { color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 8 },
    fColTitle: { fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 14, marginTop: isMobile ? 4 : 0 },
    fLink: { display: 'block', fontSize: '0.88rem', marginBottom: 10 },
    footerStrip: { borderTop: '1px solid var(--border)', textAlign: 'center', padding: '18px 24px', color: 'var(--text-secondary)', fontSize: '0.8rem' },
    footerA: { color: 'var(--accent)', textDecoration: 'none' },
  };

  return (
    <footer style={css.footer}>
      <div style={css.footerTop}>
        <div style={css.fBrand}>
          <Link to="/" style={css.fLogo}><PlaneMark size={15} style={{ marginRight: 7 }} /> CockpitHire</Link>
          <div style={css.fTagline}>Built by pilots, for pilots</div>
        </div>
        {FOOTER_COLS.map(([title, links]) => (
          <div key={title}>
            <div style={css.fColTitle}>{title}</div>
            {links.map((l) => (
              l.to
                ? <Link key={l.label} to={l.to} className="footer-link" style={css.fLink}>{l.label}</Link>
                : <a key={l.label} href={l.href} className="footer-link" style={css.fLink}>{l.label}</a>
            ))}
          </div>
        ))}
      </div>
      <div style={css.footerStrip}>
        © 2026 CockpitHire &nbsp;·&nbsp; <a href="mailto:contact@cockpithire.com" style={css.footerA}>contact@cockpithire.com</a>
      </div>
    </footer>
  );
}
