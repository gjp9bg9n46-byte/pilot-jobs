import React from 'react';

// Shared plane wordmark glyph — the single brand mark used next to
// "CockpitHire" everywhere (was duplicated in Layout.jsx and a plain ✈ emoji
// elsewhere). Stroke defaults to the accent token; pass style={{ stroke }} to
// recolor on dark/navy surfaces.
export default function PlaneMark({ size = 18, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ stroke: 'var(--accent)', display: 'inline', verticalAlign: 'middle', ...style }}
    >
      <path d="M16 9H3.5M10 4L16 9l-6 5M7 6L2 9l5 3" />
    </svg>
  );
}
