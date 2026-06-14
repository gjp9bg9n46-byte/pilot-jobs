import React from 'react';

// Airline logo with initials fallback (shared by the Airlines list card + the
// AirlineDetail hero, so the fallback treatment stays identical).
//   - logoUrl present → self-hosted logo, object-fit:contain on a bordered white box.
//   - logoUrl null     → neutral circle with the IATA code (or first 2 letters of
//                        name) in JetBrains Mono. No per-airline colour hashing.
// `box` = outer dimension (px); `font` = initials font-size (px). Callers pass the
// card vs hero vs mobile sizes.
export default function AirlineLogo({ logoUrl, iataCode, name, box = 44, font = 13 }) {
  const initials = (iataCode && iataCode.slice(0, 2).toUpperCase())
    || ((name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase())
    || '—';

  if (logoUrl) {
    return (
      <div style={{
        width: box, height: box, flexShrink: 0,
        borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 4, boxSizing: 'border-box',
      }}>
        <img
          src={logoUrl}
          alt={`${name} logo`}
          loading="lazy"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
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
