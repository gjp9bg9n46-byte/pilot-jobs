import React, { useState } from 'react';

// Light-theme button. Variants: primary (solid accent), secondary (outlined,
// fills on hover), ghost (transparent, subtle hover), danger (solid red).
// Hover handled with React state to stay inline-styles-only.
const VARIANTS = {
  primary:   { bg: 'var(--accent)', fg: '#fff', border: 'transparent', hoverBg: 'var(--accent-hover)' },
  secondary: { bg: 'transparent', fg: 'var(--text-primary)', border: 'var(--text-primary)', hoverBg: 'var(--text-primary)', hoverFg: '#fff' },
  ghost:     { bg: 'transparent', fg: 'var(--text-primary)', border: 'transparent', hoverBg: 'rgba(0,63,136,0.05)' },
  danger:    { bg: '#991B1B', fg: '#fff', border: 'transparent', hoverBg: '#7F1616' },
};

export default function Button({ variant = 'primary', type = 'button', disabled = false, style, className = '', onMouseEnter, onMouseLeave, children, ...props }) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const [hover, setHover] = useState(false);
  const on = hover && !disabled;
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 14,
    padding: '11px 20px', borderRadius: 4,
    border: `1px solid ${v.border}`,
    background: on ? v.hoverBg : v.bg,
    color: on && v.hoverFg ? v.hoverFg : v.fg,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'background 0.15s ease, color 0.15s ease',
  };
  return (
    <button
      type={type}
      className={`ch-btn ${className}`.trim()}
      disabled={disabled}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      style={{ ...base, ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
