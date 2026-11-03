import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// The printable logbook, A4 landscape, in whichever authority's layout the
// pilot chose.
//
// This file DRAWS and nothing else. The columns, their widths, the two header
// rows, every cell as a finished string, the page breaks and the three totals
// lines all arrive from the server (services/logbookPrint +
// services/logbookFormats). The phone's PDF is drawn from the same payload,
// which is how the two stay identical — and why a new layout needs no change
// here at all.
//
// Blanks are blank. A column the logbook never recorded prints empty, because
// in a logbook an empty cell means "not recorded" and 0:00 means "none, and we
// checked".

Font.registerHyphenationCallback((w) => [w]); // never hyphenate inside a cell

const INK = '#0F1B2D';
const LINE = '#8D9AAC';
const HEAD = '#E7EDF5';
const SOFT = '#F8FAFC';

const s = StyleSheet.create({
  page: { paddingTop: 22, paddingBottom: 20, paddingHorizontal: 22, color: INK, fontFamily: 'Helvetica' },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderBottomWidth: 1.2, borderBottomColor: INK, paddingBottom: 5, marginBottom: 6 },
  title: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  holder: { fontSize: 6.6, color: '#4A5668', marginTop: 2 },
  meta: { fontSize: 6, color: '#4A5668', textAlign: 'right', lineHeight: 1.5 },

  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  cell: { borderRightWidth: 0.5, borderRightColor: LINE, paddingVertical: 2.6, paddingHorizontal: 2, textAlign: 'center' },
  cellL: { textAlign: 'left' },
  first: { borderLeftWidth: 0.5, borderLeftColor: LINE },

  grp: { flexDirection: 'row', backgroundColor: HEAD, borderTopWidth: 0.5, borderTopColor: LINE, borderLeftWidth: 0.5, borderLeftColor: LINE },
  grpCell: { borderRightWidth: 0.5, borderRightColor: LINE, paddingVertical: 2.4, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 5.6 },
  sub: { flexDirection: 'row', backgroundColor: HEAD, borderLeftWidth: 0.5, borderLeftColor: LINE },
  subCell: { borderRightWidth: 0.5, borderRightColor: LINE, paddingVertical: 2.2, textAlign: 'center', fontSize: 5.4, color: '#4A5668' },

  totRow: { flexDirection: 'row', backgroundColor: SOFT, borderBottomWidth: 0.5, borderBottomColor: LINE },
  totLabel: { paddingVertical: 3, paddingHorizontal: 4, textAlign: 'right', fontSize: 6, borderRightWidth: 0.5, borderRightColor: LINE, borderLeftWidth: 0.5, borderLeftColor: LINE },
  bold: { fontFamily: 'Helvetica-Bold' },

  sign: { flexDirection: 'row', justifyContent: 'space-between', gap: 18, marginTop: 12 },
  signBox: { flex: 1, borderTopWidth: 0.6, borderTopColor: '#8592A3', paddingTop: 3, fontSize: 6, color: '#4A5668' },
  foot: { position: 'absolute', bottom: 8, left: 22, right: 22, flexDirection: 'row', justifyContent: 'space-between', fontSize: 5.6, color: '#8592A3' },
});

// A twenty-one column layout needs a little less type than an eighteen.
const bodySize = (n) => (n >= 20 ? 5.9 : 6.2);

const C = ({ w, children, align, first, style }) => (
  <View style={[s.cell, { width: `${w}%` }, align === 'left' && s.cellL, first && s.first, style]}>
    <Text>{children || ' '}</Text>
  </View>
);

function HeaderRows({ header }) {
  return (
    <>
      <View style={s.grp}>
        {header.top.map((h, i) => (
          <View key={`t${i}`} style={[s.grpCell, { width: `${h.w}%` }]}><Text>{h.label || ' '}</Text></View>
        ))}
      </View>
      <View style={s.sub}>
        {header.sub.map((h, i) => (
          <View key={`s${i}`} style={[s.subCell, { width: `${h.w}%` }]}><Text>{h.label || ' '}</Text></View>
        ))}
      </View>
    </>
  );
}

function TotalsRow({ line, format }) {
  const cols = format.columns.slice(format.labelSpan);
  return (
    <View style={s.totRow}>
      <View style={[s.totLabel, { width: `${format.labelWidth}%` }]}>
        <Text style={line.bold ? s.bold : undefined}>{line.label}</Text>
      </View>
      {cols.map((col, i) => (
        <C key={col.key} w={col.w} align={col.align} style={line.bold ? s.bold : undefined}>
          {line.cells[i]}
        </C>
      ))}
    </View>
  );
}

export default function LogbookPdf({ doc }) {
  const { pilot, range, pages, generatedAt, format } = doc;
  const when = new Date(generatedAt).toISOString().slice(0, 10);
  const fontSize = bodySize(format.columns.length);
  return (
    <Document title={`${pilot.name} — flight log`} author="CockpitHire">
      {pages.map((pg, pi) => (
        <Page key={pg.index} size="A4" orientation="landscape" style={[s.page, { fontSize }]}>
          <View style={s.head}>
            <View>
              <Text style={s.title}>{format.title}</Text>
              <Text style={s.holder}>
                Holder: {pilot.name}{pilot.licence ? ` · Licence: ${pilot.licence}` : ''}
              </Text>
            </View>
            <Text style={s.meta}>
              {format.label}{'\n'}
              {range.from && range.to ? `${range.from} to ${range.to}` : 'All flights'}
              {'\n'}Page {pg.index} of {pages.length} · generated {when}
            </Text>
          </View>

          <HeaderRows header={format.header} />

          {pg.cells.map((cells, ri) => (
            <View style={s.row} key={`r${pg.index}-${ri}`}>
              {cells.map((v, ci) => (
                <C key={format.columns[ci].key} w={format.columns[ci].w} align={format.columns[ci].align} first={ci === 0}>
                  {v}
                </C>
              ))}
            </View>
          ))}

          {/* Ruled to the bottom, as a real page is. */}
          {Array.from({ length: pg.blankRows }).map((_, i) => (
            <View style={s.row} key={`blank-${i}`}>
              {format.columns.map((col, n) => <C key={col.key} w={col.w} first={n === 0}>{' '}</C>)}
            </View>
          ))}

          {pg.totalsLines.map((line) => (
            <TotalsRow key={line.label} line={line} format={format} />
          ))}

          {/* The signature block belongs at the end of the book, not on every page. */}
          {pi === pages.length - 1 && (
            <View style={s.sign}>
              <View style={s.signBox}><Text>I certify that the entries in this log are true.</Text></View>
              <View style={s.signBox}><Text>Pilot&apos;s signature</Text></View>
              <View style={s.signBox}><Text>Date</Text></View>
            </View>
          )}

          <View style={s.foot} fixed>
            <Text>CockpitHire · cockpithire.com · {format.note}</Text>
            <Text>Page {pg.index} of {pages.length}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
