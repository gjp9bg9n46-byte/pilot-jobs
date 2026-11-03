// The printable logbook as HTML, for expo-print.
//
// The layout — which columns, how wide, both header rows, every cell as a
// finished string, the page breaks and the three totals lines — all comes from
// the server (services/logbookPrint + services/logbookFormats), the same
// payload the web PDF draws from. That is how a logbook printed from the phone
// and one downloaded on the web stay the same document, and why adding an
// authority's layout needs no change here.
//
// Blanks stay blank. In a logbook an empty cell means "not recorded"; 0:00
// would mean "none, and we checked".
//
// Unlike the share cards this document embeds no script, so ordinary
// interpolation is safe here.

// The payload is server-shaped JSON; typing each cell adds nothing here.
type Any = any;

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export function logbookPrintHtml(doc: Any): string {
  const pilot = doc.pilot as Any;
  const range = doc.range as Any;
  const pages = doc.pages as Any[];
  const format = doc.format as Any;
  const columns = format.columns as Any[];
  const when = new Date(String(doc.generatedAt)).toISOString().slice(0, 10);

  // A twenty-one column layout needs a little less type than an eighteen.
  const bodyPt = columns.length >= 20 ? 5.9 : 6.4;

  const cols = columns.map((c) => `<col style="width:${c.w}%" />`).join('');

  const head = `
    <tr class="grp">
      ${(format.header.top as Any[]).map((h) => (
    // colspan matters: without it the browser puts a three-column group in
    // one slot and every column after it lands in the wrong place.
    `<th${h.rowspan === 2 ? ' rowspan="2"' : ''}${h.span > 1 ? ` colspan="${h.span}"` : ''}>${esc(h.label)}</th>`
  )).join('')}
    </tr>
    <tr class="sub">
      ${(format.header.sub as Any[]).filter((h) => !h.spacer)
    .map((h) => `<th style="width:${h.w}%">${esc(h.label)}</th>`).join('')}
    </tr>`;

  const totalsRow = (line: Any) => `
    <tr class="tot${line.bold ? ' b' : ''}">
      <td class="lbl" colspan="${format.labelSpan}">${esc(line.label)}</td>
      ${(line.cells as string[]).map((v, i) => {
    const col = columns[format.labelSpan + i];
    return `<td class="${col.align === 'left' ? 'l' : ''}">${esc(v)}</td>`;
  }).join('')}
    </tr>`;

  const body = pages.map((pg, pi) => {
    const rows = (pg.cells as string[][]).map((cells) => `<tr>${
      cells.map((v, i) => `<td class="${columns[i].align === 'left' ? 'l' : ''}">${esc(v)}</td>`).join('')
    }</tr>`).join('');

    // Ruled to the bottom, as a real page is.
    const blanks = Array.from({ length: Number(pg.blankRows) || 0 })
      .map(() => `<tr>${'<td>&nbsp;</td>'.repeat(columns.length)}</tr>`).join('');

    const last = pi === pages.length - 1;
    return `
    <section class="page">
      <div class="head">
        <div>
          <div class="title">${esc(format.title)}</div>
          <div class="holder">Holder: ${esc(pilot.name)}${pilot.licence ? ` &middot; Licence: ${esc(pilot.licence)}` : ''}</div>
        </div>
        <div class="meta">
          ${esc(format.label)}<br/>
          ${range.from && range.to ? `${esc(range.from)} to ${esc(range.to)}` : 'All flights'}<br/>
          Page ${pg.index} of ${pages.length} &middot; generated ${esc(when)}
        </div>
      </div>

      <table>
        <colgroup>${cols}</colgroup>
        <thead>${head}</thead>
        <tbody>${rows}${blanks}</tbody>
        <tfoot>${(pg.totalsLines as Any[]).map(totalsRow).join('')}</tfoot>
      </table>

      ${last ? `<div class="sign">
        <div>I certify that the entries in this log are true.</div>
        <div>Pilot's signature</div>
        <div>Date</div>
      </div>` : ''}

      <div class="foot">
        <span>CockpitHire &middot; cockpithire.com &middot; ${esc(format.note)}</span>
        <span>Page ${pg.index} of ${pages.length}</span>
      </div>
    </section>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F1B2D; font-size: ${bodyPt}pt; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .head { display: flex; align-items: flex-end; justify-content: space-between;
    border-bottom: 1.2px solid #0F1B2D; padding-bottom: 5px; margin-bottom: 6px; }
  .title { font-size: 12pt; font-weight: 700; }
  .holder { font-size: 6.8pt; color: #4A5668; margin-top: 2px; }
  .meta { font-size: 6pt; color: #4A5668; text-align: right; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 0.5px solid #8D9AAC; padding: 2.4px 2px; text-align: center; overflow: hidden;
    white-space: nowrap; text-overflow: ellipsis; }
  /* Only the header may wrap: a two-word column title would otherwise be cut
     off mid-word ("Cross-coun…"). The body stays on one line, and the page
     still holds its 32 rows — the print check counts the sheets. */
  th { background: #E7EDF5; font-size: 5.6pt; font-weight: 700; white-space: normal; line-height: 1.12; }
  tr.sub th { font-weight: 400; font-size: 5.4pt; color: #4A5668; }
  td.l { text-align: left; }
  tfoot td { background: #F8FAFC; }
  tfoot .lbl { text-align: right; padding-right: 4px; }
  tfoot tr.b td { font-weight: 700; }
  .sign { display: flex; justify-content: space-between; gap: 18px; margin-top: 12px; }
  .sign div { flex: 1; border-top: 0.6px solid #8592A3; padding-top: 3px; font-size: 6pt; color: #4A5668; }
  .foot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 5.6pt; color: #8592A3; }
</style>
</head><body>${body}</body></html>`;
}
