import React from 'react';
import { matchStyle } from '../lib/jobMatch';

// Editorial typographic match-score lockup (no ring/fill/border): a JetBrains Mono
// percentage over an Inter caps tier label, both in the tier's semantic color.
// This is the treatment Alerts uses on each match card's right cluster.
//   size 'sm' → 26px number (Alerts mobile / inline)
//   size 'lg' → 34px number (JobDetail match section)
// The Math.min(...,100) clamp mirrors Alerts — computeAlertScore is un-normalised
// (max 135) so the displayed % is capped at 100 in the interim.
export default function MatchScore({ score, label, size = 'sm' }) {
  const m = matchStyle(score);
  const tierLabel = label ?? m.label;
  const numFont = size === 'lg' ? 34 : 26;
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: numFont, fontWeight: 600, color: m.color, lineHeight: 1 }}>
        {Math.min(Math.round(score), 100)}%
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: m.color, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>
        {tierLabel}
      </div>
    </div>
  );
}
