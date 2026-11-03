import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// The printable logbook, EASA Part-FCL layout, A4 landscape.
//
// The rows, the page breaks and the three totals lines all come from the
// server (services/logbookPrint), so this file only draws. The phone's PDF is
// drawn from the same payload, which is how the two stay identical.
//
// Blanks are blank. A column the logbook never recorded prints empty, because
// in a Part-FCL book an empty cell means "not recorded" and 0:00 means "none,
// and we checked".

Font.registerHyphenationCallback((w) => [w]); // never hyphenate inside a cell

const INK = '#0F1B2D';
const LINE = '#8D9AAC';
const HEAD = '#E7EDF5';
const SOFT = '#F8FAFC';

// Column widths in percent, summing to 100. Sized for the real columns:
// the places and times are narrow, remarks takes what is left.
const W = {
  date: 5.2,
  depPlace: 4.2, depTime: 4.2, arrPlace: 4.2, arrTime: 4.2,
  type: 5.4, reg: 6.0,
  multi: 5.0, total: 5.0,
  picName: 9.0,
  ldgDay: 3.6, ldgNight: 3.6,
  night: 5.0, ifr: 5.0,
  fPic: 5.0, fCo: 5.0, fDual: 5.0,
  remarks: 15.4,
};

const s = StyleSheet.create({
  page: { paddingTop: 22, paddingBottom: 20, paddingHorizontal: 22, fontSize: 6.2, color: INK, fontFamily: 'Helvetica' },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderBottomWidth: 1.2, borderBottomColor: INK, paddingBottom: 5, marginBottom: 6 },
  title: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  holder: { fontSize: 6.6, color: '#4A5668', marginTop: 2 },
  meta: { fontSize: 6, color: '#4A5668', textAlign: 'right', lineHeight: 1.5 },

  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  cell: { borderRightWidth: 0.5, borderRightColor: LINE, paddingVertical: 2.6, paddingHorizontal: 2, textAlign: 'center' },
  cellL: { textAlign: 'left' },
  first: { borderLeftWidth: 0.5, borderLeftColor: LINE },

  grp: { flexDirection: 'row', backgroundColor: HEAD, borderTopWidth: 0.5, borderTopColor: LINE },
  grpCell: { borderRightWidth: 0.5, borderRightColor: LINE, paddingVertical: 2.4, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 5.6 },
  sub: { flexDirection: 'row', backgroundColor: HEAD },
  subCell: { borderRightWidth: 0.5, borderRightColor: LINE, paddingVertical: 2.2, textAlign: 'center', fontSize: 5.4, color: '#4A5668' },

  totRow: { flexDirection: 'row', backgroundColor: SOFT, borderBottomWidth: 0.5, borderBottomColor: LINE },
  totLabel: { paddingVertical: 3, paddingHorizontal: 4, textAlign: 'right', fontSize: 6, borderRightWidth: 0.5, borderRightColor: LINE, borderLeftWidth: 0.5, borderLeftColor: LINE },
  bold: { fontFamily: 'Helvetica-Bold' },

  sign: { flexDirection: 'row', justifyContent: 'space-between', gap: 18, marginTop: 12 },
  signBox: { flex: 1, borderTopWidth: 0.6, borderTopColor: '#8592A3', paddingTop: 3, fontSize: 6, color: '#4A5668' },
  foot: { position: 'absolute', bottom: 8, left: 22, right: 22, flexDirection: 'row', justifyContent: 'space-between', fontSize: 5.6, color: '#8592A3' },
});

const C = ({ w, children, left, first, style }) => (
  <View style={[s.cell, { width: `${w}%` }, left && s.cellL, first && s.first, style]}>
    <Text>{children || ' '}</Text>
  </View>
);

function HeaderRows() {
  const g = (w, t, style) => <View style={[s.grpCell, { width: `${w}%` }, style]}><Text>{t}</Text></View>;
  const sc = (w, t) => <View style={[s.subCell, { width: `${w}%` }]}><Text>{t}</Text></View>;
  return (
    <>
      <View style={[s.grp, { borderLeftWidth: 0.5, borderLeftColor: LINE }]}>
        {g(W.date, 'Date')}
        {g(W.depPlace + W.depTime, 'Departure')}
        {g(W.arrPlace + W.arrTime, 'Arrival')}
        {g(W.type + W.reg, 'Aircraft')}
        {g(W.multi, 'Multi-pilot')}
        {g(W.total, 'Total')}
        {g(W.picName, 'PIC name')}
        {g(W.ldgDay + W.ldgNight, 'Landings')}
        {g(W.night + W.ifr, 'Conditions')}
        {g(W.fPic + W.fCo + W.fDual, 'Pilot function')}
        {g(W.remarks, 'Remarks')}
      </View>
      <View style={[s.sub, { borderLeftWidth: 0.5, borderLeftColor: LINE }]}>
        {sc(W.date, '')}
        {sc(W.depPlace, 'Place')}{sc(W.depTime, 'Time')}
        {sc(W.arrPlace, 'Place')}{sc(W.arrTime, 'Time')}
        {sc(W.type, 'Type')}{sc(W.reg, 'Reg')}
        {sc(W.multi, 'time')}{sc(W.total, 'time')}
        {sc(W.picName, '')}
        {sc(W.ldgDay, 'Day')}{sc(W.ldgNight, 'Night')}
        {sc(W.night, 'Night')}{sc(W.ifr, 'IFR')}
        {sc(W.fPic, 'PIC')}{sc(W.fCo, 'Co-pilot')}{sc(W.fDual, 'Dual')}
        {sc(W.remarks, '')}
      </View>
    </>
  );
}

function TotalsRow({ label, t, bold }) {
  const lead = W.date + W.depPlace + W.depTime + W.arrPlace + W.arrTime + W.type + W.reg;
  return (
    <View style={s.totRow}>
      <View style={[s.totLabel, { width: `${lead}%` }]}><Text style={bold && s.bold}>{label}</Text></View>
      <C w={W.multi} style={bold && s.bold}>{t.multiPilot}</C>
      <C w={W.total} style={bold && s.bold}>{t.total}</C>
      <C w={W.picName}>{' '}</C>
      <C w={W.ldgDay} style={bold && s.bold}>{t.landingsDay}</C>
      <C w={W.ldgNight} style={bold && s.bold}>{t.landingsNight}</C>
      <C w={W.night} style={bold && s.bold}>{t.night}</C>
      <C w={W.ifr} style={bold && s.bold}>{t.ifr}</C>
      <C w={W.fPic} style={bold && s.bold}>{t.pic}</C>
      <C w={W.fCo} style={bold && s.bold}>{t.coPilot}</C>
      <C w={W.fDual} style={bold && s.bold}>{t.dual}</C>
      <C w={W.remarks}>{' '}</C>
    </View>
  );
}

export default function LogbookPdf({ doc }) {
  const { pilot, range, pages, generatedAt } = doc;
  const when = new Date(generatedAt).toISOString().slice(0, 10);
  return (
    <Document title={`${pilot.name} — flight log`} author="CockpitHire">
      {pages.map((pg, pi) => (
        <Page key={pg.index} size="A4" orientation="landscape" style={s.page}>
          <View style={s.head}>
            <View>
              <Text style={s.title}>Pilot Flight Log</Text>
              <Text style={s.holder}>
                Holder: {pilot.name}{pilot.licence ? ` · Licence: ${pilot.licence}` : ''}
              </Text>
            </View>
            <Text style={s.meta}>
              EASA Part-FCL layout{'\n'}
              {range.from && range.to ? `${range.from} to ${range.to}` : 'All flights'}
              {'\n'}Page {pg.index} of {pages.length} · generated {when}
            </Text>
          </View>

          <HeaderRows />

          {pg.rows.map((r, i) => (
            <View style={s.row} key={`${r.date}-${i}`}>
              <C w={W.date} first>{r.date.slice(8, 10)}/{r.date.slice(5, 7)}/{r.date.slice(2, 4)}</C>
              <C w={W.depPlace}>{r.depPlace}</C><C w={W.depTime}>{r.depTime}</C>
              <C w={W.arrPlace}>{r.arrPlace}</C><C w={W.arrTime}>{r.arrTime}</C>
              <C w={W.type}>{r.type}</C><C w={W.reg}>{r.registration}</C>
              <C w={W.multi}>{r.f.multiPilot}</C>
              <C w={W.total}>{r.f.total}</C>
              <C w={W.picName} left>{r.picName}</C>
              <C w={W.ldgDay}>{r.f.landingsDay}</C><C w={W.ldgNight}>{r.f.landingsNight}</C>
              <C w={W.night}>{r.f.night}</C><C w={W.ifr}>{r.f.ifr}</C>
              <C w={W.fPic}>{r.f.pic}</C><C w={W.fCo}>{r.f.coPilot}</C><C w={W.fDual}>{r.f.dual}</C>
              <C w={W.remarks} left>{r.remarks}</C>
            </View>
          ))}

          {/* Ruled to the bottom, as a real page is. */}
          {Array.from({ length: pg.blankRows }).map((_, i) => (
            <View style={s.row} key={`blank-${i}`}>
              {Object.values(W).map((w, n) => <C key={n} w={w} first={n === 0}>{' '}</C>)}
            </View>
          ))}

          <TotalsRow label="This page" t={pg.totals.thisPage} />
          <TotalsRow label="Previous pages" t={pg.totals.previousPages} />
          <TotalsRow label="Total to date" t={pg.totals.toDate} bold />

          {/* The signature block belongs at the end of the book, not on every page. */}
          {pi === pages.length - 1 && (
            <View style={s.sign}>
              <View style={s.signBox}><Text>I certify that the entries in this log are true.</Text></View>
              <View style={s.signBox}><Text>Pilot&apos;s signature</Text></View>
              <View style={s.signBox}><Text>Date</Text></View>
            </View>
          )}

          <View style={s.foot} fixed>
            <Text>CockpitHire · cockpithire.com</Text>
            <Text>Page {pg.index} of {pages.length}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
