import { useRef, useCallback } from 'react';

export function useAutoSave<T>(saveFn: (data: T) => Promise<void>, delay = 400) {
  const timer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(saveFn);
  latest.current = saveFn;

  return useCallback((data: T) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(data), delay);
  }, [delay]);
}
