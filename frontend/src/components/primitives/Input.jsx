import React, { forwardRef, useId, useState } from 'react';

// Light-theme form control. `as` selects the element: 'input' (default),
// 'textarea', or 'select' (pass <option> children). Forwards ref to the
// underlying element for focus management.
const Input = forwardRef(function Input(
  { as = 'input', label, error, id, style, children, onFocus, onBlur, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id || autoId;
  const [focused, setFocused] = useState(false);
  const Tag = as;

  const controlBase = {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--surface)',
    border: `1px solid ${error ? '#991B1B' : (focused ? 'var(--accent)' : 'var(--border)')}`,
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize: 16,
    lineHeight: 1.4,
    padding: '10px 14px',
    outline: 'none',
    boxShadow: focused && !error ? '0 0 0 3px rgba(0,63,136,0.08)' : 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    ...(as === 'textarea' ? { resize: 'vertical' } : null),
    ...(as === 'select' ? { appearance: 'auto', cursor: 'pointer' } : null),
  };

  return (
    <div style={{ display: 'block' }}>
      {label && (
        <label
          htmlFor={fieldId}
          style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}
        >
          {label}
        </label>
      )}
      <Tag
        ref={ref}
        id={fieldId}
        style={{ ...controlBase, ...style }}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </Tag>
      {error && (
        <div aria-live="polite" style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#991B1B', marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
});

export default Input;
