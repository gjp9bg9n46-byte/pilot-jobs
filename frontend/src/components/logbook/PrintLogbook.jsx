import React, { useCallback, useEffect, useState } from 'react';
import { logbookApi } from '../../services/api';
import './printLogbook.css';

// "Print logbook" — pick a layout and a date range, then download an A4
// landscape PDF.
//
// The layouts come from the server (services/logbookFormats), as does the
// suggestion: a pilot whose licence was issued by the FAA opens this dialog
// with the FAA layout already chosen. The rows, page breaks and totals come
// from GET /logbook/print; this only asks and renders.
//
// @react-pdf/renderer is imported lazily because it is large and most visits
// never export anything.

/** "a", "a and b", "a, b and c" — a list a person would read aloud. */
function listOf(items) {
  const x = items.filter(Boolean);
  if (x.length <= 1) return x[0] || '';
  return `${x.slice(0, -1).join(', ')} and ${x[x.length - 1]}`;
}

/** A column name inside a sentence stops shouting ("Dual received" → "dual
 *  received"), while an initialism keeps its capitals. */
function midSentence(label) {
  const first = String(label).split(' ')[0];
  if (first.length > 1 && first === first.toUpperCase()) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** The list as it opens a sentence: the first name keeps its capital. */
const sentenceCase = (labels) => labels.map((l, i) => (i === 0 ? l : midSentence(l)));

export default function PrintLogbook({ variant = 'button' }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [formats, setFormats] = useState([]);
  const [format, setFormat] = useState('');
  const [gaps, setGaps] = useState([]);

  // Reads certificates, not flights, so it is cheap enough to do on open.
  useEffect(() => {
    if (!open || formats.length) return;
    let alive = true;
    logbookApi.printFormats()
      .then(({ data }) => {
        if (!alive) return;
        setFormats(data.formats || []);
        setFormat((f) => f || data.suggestedFormat || (data.formats?.[0]?.id ?? ''));
      })
      .catch(() => { /* the picker simply stays on the server's default */ });
    return () => { alive = false; };
  }, [open, formats.length]);

  const chosen = formats.find((f) => f.id === format) || null;

  const run = useCallback(async () => {
    setBusy(true); setNote('Building your logbook…'); setGaps([]);
    try {
      const { data } = await logbookApi.printable({
        from: from || undefined, to: to || undefined, format: format || undefined,
      });
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
      a.href = url; a.download = `logbook-${data.format.id}${span}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      setGaps(data.gaps || []);
      setNote(`Downloaded · ${data.flightCount} flights over ${data.pages.length} page${data.pages.length === 1 ? '' : 's'} · ${data.format.label}`);
    } catch (e) {
      setNote(`Could not build the PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }, [from, to, format]);

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
            <p className="pl-sub">An A4 landscape PDF with page totals and a signature line.</p>

            <div className="pl-field">
              <label htmlFor="pl-format"><span>Layout</span></label>
              <select
                id="pl-format"
                value={format}
                onChange={(e) => { setFormat(e.target.value); setGaps([]); setNote(null); }}
                disabled={!formats.length}
              >
                {formats.length
                  ? formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)
                  : <option value="">Loading…</option>}
              </select>
              {chosen && (
                <p className="pl-hint">
                  {chosen.note}
                  {chosen.missing?.length
                    ? ` ${listOf(sentenceCase(chosen.missing))} ${chosen.missing.length === 1 ? 'is' : 'are'} not in your logbook yet, so ${chosen.missing.length === 1 ? 'that column prints' : 'those columns print'} blank.`
                    : ''}
                </p>
              )}
            </div>

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

            {gaps.length > 0 && (
              <div className="pl-gaps">
                <p className="pl-gaps-head">Printed blank, because we do not hold them yet</p>
                <ul>
                  {gaps.map((g) => (
                    <li key={g.key}><strong>{g.column}</strong> — {g.note}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pl-actions">
              <button type="button" className="pl-ghost" onClick={() => { setOpen(false); setNote(null); setGaps([]); }} disabled={busy}>Close</button>
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
