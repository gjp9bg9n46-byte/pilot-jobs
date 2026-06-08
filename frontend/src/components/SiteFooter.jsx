import React from 'react';
import { Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';

// Shared marketing footer — used by the landing page and the public airline
// shell (PublicLayout) so logged-out visitors get a consistent bottom chrome.
const C = { accent: '#00B4D8', text: '#E8F0FA', muted: '#7A8CA0', border: '#243050' };

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

export default function SiteFooter() {
  const isMobile = useIsMobile();
  const css = {
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
    <footer style={css.footer}>
      <div style={css.footerTop}>
        <div style={css.fBrand}>
          <Link to="/" style={{ ...css.fLogo, textDecoration: 'none' }}>✈ CockpitHire</Link>
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
  );
}
