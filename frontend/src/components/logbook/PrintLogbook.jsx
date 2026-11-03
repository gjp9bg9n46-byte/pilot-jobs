import React, { useCallback, useState } from 'react';
import { logbookApi } from '../../services/api';
import './printLogbook.css';

// "Print logbook" — pick a date range, then download an A4 landscape PDF.
//
// The rows, page breaks and totals come from GET /logbook/print; this only
// asks for the range and renders. @react-pdf/renderer is imported lazily
// because it is large and most visits never export anything.

export default function PrintLogbook({ variant = 'button' }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const run = useCallback(async () => {
    setBusy(true); setNote('Building your logbook…');
    try {
      const { data } = await logbookApi.printable({ from: from || undefined, to: to || undefined });
      if (!data.flightCount) { setNote('No flights in that range.'); setBusy(false); return; }
      // Lazy: ~400 kB of renderer that a pilot who never exports should not pay for.
      const [{ pdf }, { default: LogbookPdf }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./LogbookPdf'),
      ]);
      const blob = await pdf(<LogbookPdf doc={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const span = data.range.from && data.range.to ? `-${data.range.from}-to-${data.range.to}` : '';
      a.href = url; a.download = `logbook${span}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      setNote(`Downloaded · ${data.flightCount} flights over ${data.pages.length} page${data.pages.length === 1 ? '' : 's'}`);
    } catch (e) {
      setNote(`Could not build the PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }, [from, to]);

  return (
    <>
      <button
        type="button"
        className={variant === 'link' ? 'pl-link' : 'pl-btn'}
        onClick={() => setOpen(true)}
      >
        Print logbook
      </button>

      {open && (
        <div className="pl-backdrop" role="dialog" aria-modal="true" aria-label="Print logbook">
          <div className="pl-panel">
            <h2>Print logbook</h2>
            <p className="pl-sub">An A4 landscape PDF in the EASA layout, with page totals and a signature line.</p>

            <div className="pl-range">
              <label>
                <span>From</span>
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            <p className="pl-hint">Leave both blank for every flight.</p>

            {note ? <p className="pl-note">{note}</p> : null}

            <div className="pl-actions">
              <button type="button" className="pl-ghost" onClick={() => { setOpen(false); setNote(null); }} disabled={busy}>Close</button>
              <button type="button" className="pl-btn" onClick={run} disabled={busy}>
                {busy ? 'Building…' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
