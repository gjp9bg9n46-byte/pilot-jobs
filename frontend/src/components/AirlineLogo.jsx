import React from 'react';

// Airline logo with initials fallback (shared by the Airlines list card + the
// AirlineDetail hero, so the treatment stays identical).
//   - logoUrl present → self-hosted logo on a bordered white box that is
//     HEIGHT-fixed and WIDTH-auto (capped at maxW), so wide wordmark logos
//     (Qantas, Singapore, Delta…) don't get squished into a square.
//   - logoUrl null     → a fixed SQUARE box × box neutral circle with the IATA
//     code (or first 2 letters of name) in JetBrains Mono. No colour hashing.
// `box` = fixed height (px); `maxW` = max logo width (px); `font` = initials size.
// frameless defaults ON (owner directive 2026-07: logos float on the card,
// no bordered box anywhere).
export default function AirlineLogo({ logoUrl, iataCode, name, box = 44, maxW = 64, font = 13, frameless = true, hideIfMissing = false }) {
  const initials = (iataCode && iataCode.slice(0, 2).toUpperCase())
    || ((name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase())
    || '—';

  if (!logoUrl && hideIfMissing) return null;

  if (logoUrl) {
    return (
      <div style={{
        height: box, maxWidth: maxW, flexShrink: 0,
        borderRadius: 6,
        border: frameless ? 'none' : '1px solid var(--border)',
        background: frameless ? 'transparent' : 'var(--surface)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: frameless ? 0 : 4, boxSizing: 'border-box',
      }}>
        <img
          src={logoUrl}
          alt={`${name} logo`}
          loading="lazy"
          style={{ maxHeight: frameless ? box : box - 8, maxWidth: frameless ? maxW : maxW - 8, objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width: box, height: box, flexShrink: 0,
        borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: font, fontWeight: 600,
        color: 'var(--text-secondary)', letterSpacing: 0.5, boxSizing: 'border-box',
      }}
    >
      {initials}
    </div>
  );
}
