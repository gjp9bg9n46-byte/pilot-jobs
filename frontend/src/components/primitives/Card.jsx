import React, { useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

// Light-theme surface container. `hover` opts into a subtle shadow lift (no
// translate). Hover handled with React state to stay inline-styles-only.
export default function Card({ as = 'div', hover = false, children, style, onMouseEnter, onMouseLeave, ...props }) {
  const isMobile = useIsMobile();
  const [hovered, setHovered] = useState(false);
  const Tag = as;
  const base = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: isMobile ? 20 : 24,
    boxShadow: hover && hovered ? '0 4px 12px rgba(15,20,25,0.06)' : 'none',
    transition: 'box-shadow 0.2s ease',
  };
  return (
    <Tag
      style={{ ...base, ...style }}
      onMouseEnter={hover ? (e) => { setHovered(true); onMouseEnter?.(e); } : onMouseEnter}
      onMouseLeave={hover ? (e) => { setHovered(false); onMouseLeave?.(e); } : onMouseLeave}
      {...props}
    >
      {children}
    </Tag>
  );
}
