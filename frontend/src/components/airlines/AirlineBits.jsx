import React from 'react';
import { Check, HelpCircle, X } from 'lucide-react';

/**
 * The pieces the Airlines list and the fact file share, so the two cannot
 * drift: the hiring pill, the logo tile, and one checked requirement row.
 */

const HIRING = {
  ACTIVELY_HIRING: { cls: 'g', label: 'Hiring', long: 'Actively hiring' },
  OCCASIONAL: { cls: 'a', label: 'Occasional', long: 'Hires occasionally' },
  PAUSED: { cls: 'r', label: 'Paused', long: 'Hiring paused' },
  UNKNOWN: { cls: 'n', label: 'Status unknown', long: 'Status unknown' },
};

export function HiringPill({ status, long = false }) {
  const h = HIRING[status] || HIRING.UNKNOWN;
  return (
    <span className={`af-pill ${h.cls}`}>
      {h.cls !== 'n' && <span className="dot" />}
      {long ? h.long : h.label}
    </span>
  );
}

// A light tile, height-fixed and width-capped, so a wide wordmark reads at the
// same weight as a square logo and every title starts at the same x.
export function LogoTile({ logoUrl, iataCode, name, className = '' }) {
  const initials = (iataCode && iataCode.slice(0, 3).toUpperCase())
    || String(name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()
    || '—';
  return (
    <div className={`af-tile ${className}`}>
      {logoUrl
        ? <img src={logoUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        : <span className="initials">{initials}</span>}
    </div>
  );
}

// met / not-met / unknown, with the pilot's own value on the right.
export function RequirementRow({ label, status, you }) {
  const Icon = status === 'met' ? Check : status === 'not-met' ? X : HelpCircle;
  const cls = status === 'met' ? 'af-ok' : status === 'not-met' ? 'af-no' : 'af-q';
  return (
    <div className="af-req">
      <Icon size={15} className={cls} aria-hidden />
      <span>{label}</span>
      {you && <span className="v">{you}</span>}
    </div>
  );
}

export { HIRING };
