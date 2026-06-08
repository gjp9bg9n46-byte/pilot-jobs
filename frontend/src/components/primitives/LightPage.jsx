import React from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

// COUPLING: This component full-bleeds over Layout's content <div> padding
// (32px desktop / 16px 16px 24px mobile). If Layout.jsx changes those
// padding values, update the `bleed` object below to match. Standalone
// pages (Landing/Login/Register) do NOT use LightPage — they use the
// body-bg pattern in their own mount/unmount effects.
//
// Wraps an inside-Layout page in a light-theme surface that covers Layout's
// dark content area edge-to-edge (no dark frame / seam at the sidebar).
export default function LightPage({ children, className = '', style, ...props }) {
  const isMobile = useIsMobile();
  const bleed = isMobile
    ? { margin: '-16px -16px -24px', padding: '16px 16px 24px', minHeight: 'calc(100% + 40px)' }
    : { margin: '-32px', padding: '32px', minHeight: 'calc(100% + 64px)' };
  return (
    <div
      className={`app-light ${className}`.trim()}
      style={{ background: 'var(--bg)', color: 'var(--text-primary)', boxSizing: 'border-box', ...bleed, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
