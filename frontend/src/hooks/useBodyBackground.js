import { useEffect } from 'react';

// Standalone full-page surfaces (no Layout/PublicLayout wrapper) sit on top of
// index.html's global dark body (#0A1628). To keep overscroll/behind from
// flashing dark, set document.body's background on mount and restore on unmount
// — same pattern as Login/Landing. Employer (cool-operator) pages pass #F3F4F6.
export function useBodyBackground(color) {
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = color;
    return () => { document.body.style.background = prev; };
  }, [color]);
}
