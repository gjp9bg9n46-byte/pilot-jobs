import React from 'react';

// A heading-indicator, not a prize wheel.
//
// The card carries the two names 180° apart and rotates under a fixed lubber
// line at the top, the way a DG reads. It spins several whole turns and eases
// to a stop with the winner under the line — the deceleration is the drama,
// so there is no bounce, no flashing and no colour change on landing.
//
// `size` is set by the caller from the viewport; everything inside is drawn in
// a 200-unit viewBox and scales with it.
export default function PfPmDial({ size = 280, rotation = 0, spinning = false, names }) {
  const [a, b] = names;
  const dur = 1700; // ms — long enough to read as an instrument settling

  const face = {
    width: size,
    height: size,
    transform: `rotate(${rotation}deg)`,
    transition: spinning ? `transform ${dur}ms cubic-bezier(.17,.72,.21,1)` : 'none',
    display: 'block',
  };

  // Minor ticks every 10°, major every 30°, as on a real card.
  const ticks = [];
  for (let deg = 0; deg < 360; deg += 10) {
    const major = deg % 30 === 0;
    ticks.push(
      <line
        key={deg}
        x1="100" y1={major ? 12 : 15} x2="100" y2={major ? 23 : 20}
        stroke={major ? '#0B1F3A' : '#8592A3'}
        strokeWidth={major ? 1.6 : 1}
        transform={`rotate(${deg} 100 100)`}
      />,
    );
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      {/* Rotating card */}
      <svg viewBox="0 0 200 200" style={face} aria-hidden="true">
        <circle cx="100" cy="100" r="96" fill="#FFFFFF" stroke="#0B1F3A" strokeWidth="3" />
        <circle cx="100" cy="100" r="86" fill="none" stroke="#E3E8EF" strokeWidth="1" />
        {ticks}
        {/* The two names, 180° apart. The lower one is drawn upside-down on the
            card exactly as a real compass card is, so it reads correctly when
            it rotates to the top. */}
        <text x="100" y="52" textAnchor="middle" fontSize="13" fontWeight="700"
              fontFamily="Inter, system-ui, sans-serif" fill="#003F88">{trunc(a)}</text>
        <text x="100" y="155" textAnchor="middle" fontSize="13" fontWeight="700"
              fontFamily="Inter, system-ui, sans-serif" fill="#003F88"
              transform="rotate(180 100 148)">{trunc(b)}</text>
        {/* Aircraft symbol at the centre — fixed to the card, like a DG */}
        <g stroke="#0B1F3A" strokeWidth="2.4" strokeLinecap="round" fill="none">
          <line x1="100" y1="86" x2="100" y2="118" />
          <line x1="82" y1="100" x2="118" y2="100" />
          <line x1="92" y1="114" x2="108" y2="114" />
        </g>
      </svg>

      {/* Fixed lubber line — does NOT rotate. This is what the result lands under. */}
      <svg viewBox="0 0 200 200" width={size} height={size}
           style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true">
        <polygon points="100,6 94,20 106,20" fill="#003F88" />
      </svg>
    </div>
  );
}

// A long name must not overflow the card; the full name is always in the text
// result underneath, so clipping here costs nothing.
function trunc(s) {
  const t = String(s || '').trim();
  return t.length > 14 ? `${t.slice(0, 13)}…` : t;
}
