import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

/**
 * The downloaded PDF. @react-pdf is kept — it lays out real A4 and the output
 * is TEXT-SELECTABLE (it draws glyphs, not a raster), which a screenshot-to-PDF
 * approach would lose. It cannot share CvSheet.jsx because it has no DOM, so
 * the two renderers are kept deliberately parallel: same document, same order,
 * same wording.
 *
 * This is the ONLY surface that shows the real phone and email — the server
 * builds it with audience 'pdf'.
 */

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingHorizontal: 52, paddingBottom: 54, fontSize: 9.5, color: '#141A24', fontFamily: 'Helvetica', lineHeight: 1.5 },
  pageModern: { padding: 0, fontSize: 9.5, color: '#141A24', fontFamily: 'Helvetica', lineHeight: 1.5 },
  row: { flexDirection: 'row' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, paddingBottom: 12 },
  name: { fontSize: 23, fontFamily: 'Helvetica-Bold', letterSpacing: -0.2 },
  hl: { fontSize: 10.5, color: '#3A4658', marginTop: 3 },
  ct: { fontSize: 8.5, color: '#3A4658', textAlign: 'right', lineHeight: 1.6 },
  sec: { marginTop: 16 },
  h2: { fontSize: 7.8, letterSpacing: 1.3, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  hrs: { flexDirection: 'row', borderWidth: 1, borderColor: '#DCE2EA', borderRadius: 4 },
  hrsCell: { flex: 1, padding: 8, borderLeftWidth: 1, borderLeftColor: '#DCE2EA' },
  hrsCell0: { flex: 1, padding: 8 },
  hrsV: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  hrsL: { fontSize: 7.8, color: '#5A6576', marginTop: 2 },
  it: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#EEF1F5' },
  k: { fontFamily: 'Helvetica-Bold', flex: 1, paddingRight: 10 },
  v: { color: '#4A5668', textAlign: 'right' },
  vRed: { color: '#B42318', textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  vAmber: { color: '#B45309', textAlign: 'right' },
  note: { fontSize: 7.8, color: '#8592A3', marginTop: 4 },
  src: { fontSize: 7.5, color: '#8592A3', marginTop: 20, borderTopWidth: 1, borderTopColor: '#EEF1F5', paddingTop: 6 },
  sideCol: { width: 170, padding: 32, color: '#FFFFFF' },
  mainCol: { flex: 1, padding: 36 },
  mName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', lineHeight: 1.2 },
  mHl: { fontSize: 9, color: '#FFFFFF', opacity: 0.85, marginTop: 6 },
  mCt: { fontSize: 8.5, color: '#FFFFFF', opacity: 0.8, marginTop: 14, lineHeight: 1.7 },
  photo: { width: 74, height: 74, objectFit: 'cover', borderRadius: 4, marginBottom: 12 },
});

const TITLE = {
  experience: 'Flight experience', licences: 'Licences & ratings', medical: 'Medical & English',
  training: 'Training', employment: 'Employment history', rtw: 'Right to work', education: 'Education & languages',
};

function Items({ items }) {
  if (!items?.length) return <Text style={s.note}>Not on your profile yet.</Text>;
  return items.map((it, i) => (
    <View style={s.it} key={i}>
      <Text style={s.k}>{it.k}</Text>
      <Text style={it.flag === 'red' ? s.vRed : it.flag === 'amber' ? s.vAmber : s.v}>{it.v}</Text>
    </View>
  ));
}

function Body({ doc, accent }) {
  return doc.order.filter((o) => o.visible && o.key !== 'photo').map((o) => {
    const sec = doc.sections[o.key];
    if (o.key === 'employment' && !sec.items.length) return null;
    if (o.key === 'experience') {
      return (
        <View style={s.sec} key={o.key}>
          <Text style={[s.h2, { color: accent }]}>{TITLE[o.key].toUpperCase()}</Text>
          <View style={s.hrs}>
            {sec.stats.map((st, i) => (
              <View style={i === 0 ? s.hrsCell0 : s.hrsCell} key={st.label}>
                <Text style={s.hrsV}>{st.value}</Text><Text style={s.hrsL}>{st.label}</Text>
              </View>
            ))}
          </View>
          {sec.note ? <Text style={s.note}>{sec.note}</Text> : null}
        </View>
      );
    }
    return (
      <View style={s.sec} key={o.key}>
        <Text style={[s.h2, { color: accent }]}>{TITLE[o.key].toUpperCase()}</Text>
        <Items items={sec.items} />
      </View>
    );
  });
}

export default function CvPdf({ doc }) {
  const accent = doc.accentHex || '#0B1F3A';
  const contact = [doc.header.base, doc.header.phone, doc.header.email].filter(Boolean);
  const photo = doc.order.find((o) => o.key === 'photo' && o.visible) && doc.sections.photo?.url;
  const modern = doc.template === 'modern';

  if (modern) {
    return (
      <Document title={`${doc.header.name} — CV`} author="CockpitHire">
        <Page size="A4" style={s.pageModern}>
          <View style={s.row}>
            <View style={[s.sideCol, { backgroundColor: accent }]}>
              {photo ? <Image style={s.photo} src={doc.sections.photo.url} /> : null}
              <Text style={s.mName}>{doc.header.name}</Text>
              {doc.header.headline ? <Text style={s.mHl}>{doc.header.headline}</Text> : null}
              <View style={s.mCt}>{contact.map((c, i) => <Text key={i}>{c}</Text>)}</View>
            </View>
            <View style={s.mainCol}>
              {doc.summary ? (
                <View style={s.sec}><Text style={[s.h2, { color: accent }]}>SUMMARY</Text><Text>{doc.summary}</Text></View>
              ) : null}
              <Body doc={doc} accent={accent} />
              <Text style={s.src}>Generated by CockpitHire from the pilot's profile and logbook.</Text>
            </View>
          </View>
        </Page>
      </Document>
    );
  }

  return (
    <Document title={`${doc.header.name} — CV`} author="CockpitHire">
      <Page size="A4" style={s.page}>
        {photo ? <Image style={[s.photo, { marginLeft: 'auto' }]} src={doc.sections.photo.url} /> : null}
        <View style={[s.head, { borderBottomColor: accent }]}>
          <View>
            <Text style={s.name}>{doc.header.name}</Text>
            {doc.header.headline ? <Text style={s.hl}>{doc.header.headline}</Text> : null}
          </View>
          <View style={s.ct}>{contact.map((c, i) => <Text key={i}>{c}</Text>)}</View>
        </View>
        {doc.summary ? (
          <View style={s.sec}><Text style={[s.h2, { color: accent }]}>SUMMARY</Text><Text>{doc.summary}</Text></View>
        ) : null}
        <Body doc={doc} accent={accent} />
        <Text style={s.src}>Generated by CockpitHire from the pilot's profile and logbook.</Text>
      </Page>
    </Document>
  );
}
