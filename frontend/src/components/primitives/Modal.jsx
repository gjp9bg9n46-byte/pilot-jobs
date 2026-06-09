import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

// Dialog with backdrop. Centered card on desktop, bottom-sheet below 640px.
// isOpen={false} renders nothing. Entrance fade+scale via mount state (no
// keyframes). Closes on backdrop click, Escape, and the X button.
//
// `size` sets the desktop max-width — three sizes; pick the smallest that fits
// the content: sm (480) for confirms, md (680) for detail views/forms, lg (960)
// for data-heavy panels. Default sm keeps all existing callers unchanged. The
// mobile bottom-sheet (<640px, full-width) is identical across every size.
const SIZE_MAP = { sm: 480, md: 680, lg: 960 };

export default function Modal({ isOpen, onClose, title, size = 'sm', children }) {
  const isMobile = useIsMobile(640);
  const cardRef = useRef(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevActive = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);

    // Entrance + focus. Focus the dialog container itself (tabIndex=-1,
    // outline:none) — keeps focus inside the dialog without highlighting the
    // X close button. Tab from here moves to the first child control normally.
    const raf = requestAnimationFrame(() => {
      setShow(true);
      cardRef.current?.focus?.();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      setShow(false);
      if (prevActive && prevActive.focus) prevActive.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const backdrop = {
    position: 'fixed', inset: 0, zIndex: 50,
    background: 'rgba(15,20,25,0.5)',
    display: 'flex',
    alignItems: isMobile ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: isMobile ? 0 : 20,
    opacity: show ? 1 : 0,
    transition: 'opacity 0.2s ease',
  };
  const card = {
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    width: isMobile ? '100%' : '100%',
    maxWidth: isMobile ? '100%' : (SIZE_MAP[size] ?? SIZE_MAP.sm),
    maxHeight: isMobile ? '90vh' : '85vh',
    overflowY: 'auto',
    borderRadius: isMobile ? '14px 14px 0 0' : 8,
    padding: 28,
    boxShadow: '0 20px 60px rgba(15,20,25,0.25)',
    transform: show ? 'none' : (isMobile ? 'translateY(100%)' : 'scale(0.97)'),
    opacity: show ? 1 : 0,
    transition: 'transform 0.2s ease, opacity 0.2s ease',
    outline: 'none',
  };
  const head = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: title ? 16 : 0 };
  const titleStyle = { fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 };
  const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, margin: -4, display: 'inline-flex', flexShrink: 0 };

  return (
    <div style={backdrop} onClick={() => onClose?.()}>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        style={card}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={head}>
          {title && <div style={titleStyle}>{title}</div>}
          <button type="button" aria-label="Close" style={closeBtn} onClick={() => onClose?.()}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
