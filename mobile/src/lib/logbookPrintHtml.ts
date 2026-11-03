// The printable logbook as HTML, for expo-print.
//
// The rows, page breaks and the three totals lines all come from the server
// (services/logbookPrint), the same payload the web PDF draws from — which is
// how a logbook printed from the phone and one downloaded on the web stay the
// same document.
//
// Blanks stay blank. In a Part-FCL book an empty cell means "not recorded";
// 0:00 would mean "none, and we checked".
//
// Unlike the share cards this document embeds no script, so ordinary
// interpolation is safe here.

// The payload is server-shaped JSON; typing each cell adds nothing here.
type Any = any;

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** DD/MM/YY, the way a logbook writes a date. */
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

export function logbookPrintHtml(doc: Any): string {
  const pilot = doc.pilot as Any;
  const range = doc.range as Any;
  const pages = doc.pages as Any[];
  const when = new Date(String(doc.generatedAt)).toISOString().slice(0, 10);

  const totalsRow = (label: string, t: Any, bold = false) => `
    <tr class="tot${bold ? ' b' : ''}">
      <td class="lbl" colspan="7">${esc(label)}</td>
      <td>${esc(t.multiPilot)}</td><td>${esc(t.total)}</td><td></td>
      <td>${esc(t.landingsDay)}</td><td>${esc(t.landingsNight)}</td>
      <td>${esc(t.night)}</td><td>${esc(t.ifr)}</td>
      <td>${esc(t.pic)}</td><td>${esc(t.coPilot)}</td><td>${esc(t.dual)}</td>
      <td></td>
    </tr>`;

  const body = pages.map((pg, pi) => {
    const rows = (pg.rows as Any[]).map((r) => {
      const f = r.f as Any;
      return `<tr>
        <td>${esc(shortDate(String(r.date)))}</td>
        <td>${esc(r.depPlace)}</td><td>${esc(r.depTime)}</td>
        <td>${esc(r.arrPlace)}</td><td>${esc(r.arrTime)}</td>
        <td>${esc(r.type)}</td><td>${esc(r.registration)}</td>
        <td>${esc(f.multiPilot)}</td><td>${esc(f.total)}</td>
        <td class="l">${esc(r.picName)}</td>
        <td>${esc(f.landingsDay)}</td><td>${esc(f.landingsNight)}</td>
        <td>${esc(f.night)}</td><td>${esc(f.ifr)}</td>
        <td>${esc(f.pic)}</td><td>${esc(f.coPilot)}</td><td>${esc(f.dual)}</td>
        <td class="l">${esc(r.remarks)}</td>
      </tr>`;
    }).join('');

    // Ruled to the bottom, as a real page is.
    const blanks = Array.from({ length: Number(pg.blankRows) || 0 })
      .map(() => `<tr>${'<td>&nbsp;</td>'.repeat(18)}</tr>`).join('');

    const t = pg.totals as Any;
    const last = pi === pages.length - 1;
    return `
    <section class="page">
      <div class="head">
        <div>
          <div class="title">Pilot Flight Log</div>
          <div class="holder">Holder: ${esc(pilot.name)}${pilot.licence ? ` &middot; Licence: ${esc(pilot.licence)}` : ''}</div>
        </div>
        <div class="meta">
          EASA Part-FCL layout<br/>
          ${range.from && range.to ? `${esc(range.from)} to ${esc(range.to)}` : 'All flights'}<br/>
          Page ${pg.index} of ${pages.length} &middot; generated ${esc(when)}
        </div>
      </div>

      <table>
        <thead>
          <tr class="grp">
            <th rowspan="2">Date</th>
            <th colspan="2">Departure</th>
            <th colspan="2">Arrival</th>
            <th colspan="2">Aircraft</th>
            <th rowspan="2">Multi-pilot</th>
            <th rowspan="2">Total</th>
            <th rowspan="2">PIC name</th>
            <th colspan="2">Landings</th>
            <th colspan="2">Conditions</th>
            <th colspan="3">Pilot function</th>
            <th rowspan="2">Remarks</th>
          </tr>
          <tr class="sub">
            <th>Place</th><th>Time</th><th>Place</th><th>Time</th>
            <th>Type</th><th>Reg</th>
            <th>Day</th><th>Night</th>
            <th>Night</th><th>IFR</th>
            <th>PIC</th><th>Co-pilot</th><th>Dual</th>
          </tr>
        </thead>
        <tbody>${rows}${blanks}</tbody>
        <tfoot>
          ${totalsRow('This page', t.thisPage)}
          ${totalsRow('Previous pages', t.previousPages)}
          ${totalsRow('Total to date', t.toDate, true)}
        </tfoot>
      </table>

      ${last ? `<div class="sign">
        <div>I certify that the entries in this log are true.</div>
        <div>Pilot's signature</div>
        <div>Date</div>
      </div>` : ''}

      <div class="foot"><span>CockpitHire &middot; cockpithire.com</span><span>Page ${pg.index} of ${pages.length}</span></div>
    </section>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F1B2D; font-size: 6.4pt; }
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
  th { background: #E7EDF5; font-size: 5.6pt; font-weight: 700; }
  tr.sub th { font-weight: 400; font-size: 5.4pt; color: #4A5668; }
  td.l { text-align: left; }
  tfoot td { background: #F8FAFC; }
  tfoot .lbl { text-align: right; padding-right: 4px; }
  tfoot tr.b td { font-weight: 700; }
  .sign { display: flex; justify-content: space-between; gap: 18px; margin-top: 12px; }
  .sign div { flex: 1; border-top: 0.6px solid #8592A3; padding-top: 3px; font-size: 6pt; color: #4A5668; }
  .foot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 5.6pt; color: #8592A3; }
  /* Column widths, matching the web PDF so the two documents line up. */
  col.date{width:5.2%} col.p{width:4.2%} col.t{width:4.2%} col.ty{width:5.4%} col.rg{width:6%}
</style>
</head><body>${body}</body></html>`;
}
