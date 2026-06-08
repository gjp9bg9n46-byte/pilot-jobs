import React from 'react';

// Semantic status pill. The ONE place status colors are defined — using this
// prevents typo'd hex values across the app's ~183 status indicators.
// Colors are intentionally hardcoded here (not tokenized) until another
// primitive needs to share them.
const VARIANTS = {
  success: { bg: '#DCFCE7', fg: '#166534' },
  warning: { bg: '#FEF3C7', fg: '#92400E' },
  error:   { bg: '#FEE2E2', fg: '#991B1B' },
  info:    { bg: '#DBEAFE', fg: '#1E40AF' },
  neutral: { bg: '#E5E7EB', fg: '#374151' },
};

export default function Badge({ variant = 'neutral', children, style, ...props }) {
  let v = VARIANTS[variant];
  if (!v) {
    if (import.meta.env?.DEV) {
      console.warn(`[Badge] invalid variant "${variant}" — falling back to "neutral". Valid: ${Object.keys(VARIANTS).join(', ')}`);
    }
    v = VARIANTS.neutral;
  }
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    background: v.bg,
    color: v.fg,
    padding: '4px 10px',
    borderRadius: 12,
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '0.02em',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
  };
  return <span style={{ ...base, ...style }} {...props}>{children}</span>;
}
