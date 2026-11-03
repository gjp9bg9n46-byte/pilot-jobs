// "Print logbook" — pick a layout and a date range, then produce an A4
// landscape PDF.
//
// The layouts come from the server (services/logbookFormats), as does the
// suggestion: a pilot whose licence was issued by the FAA opens this sheet
// with the FAA layout already chosen. expo-print renders the HTML (it is in
// build 10, so this ships as an update) and expo-sharing hands it to the share
// sheet. The rows, page breaks and totals come from GET /logbook/print — the
// same payload the web PDF draws from, so the two documents are the same.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../lib/api';
import { DateField, SelectField, Sheet } from '../ui';
import { logbookPrintHtml } from '../../lib/logbookPrintHtml';
import { tapLight, notifyError } from '../../lib/haptics';
import { fontFamilies, fontSizes, spacing } from '../../theme/tokens';
import { ThemePalette, useThemedStyles } from '../../theme/ThemeContext';

type FormatOption = { id: string; label: string; note: string; missing: string[] };
type Gap = { key: string; column: string; note: string };

/** "a", "a and b", "a, b and c" — a list a person would read aloud. */
function listOf(items: string[]) {
  const x = (items || []).filter(Boolean);
  if (x.length <= 1) return x[0] || '';
  return `${x.slice(0, -1).join(', ')} and ${x[x.length - 1]}`;
}

/** A column name inside a sentence stops shouting ("Dual received" → "dual
 *  received"), while an initialism keeps its capitals. */
function midSentence(label: string) {
  const first = String(label).split(' ')[0];
  if (first.length > 1 && first === first.toUpperCase()) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** The list as it opens a sentence: the first name keeps its capital. */
const sentenceCase = (labels: string[]) => labels.map((l, i) => (i === 0 ? l : midSentence(l)));

export default function PrintLogbook({ variant = 'button' }: { variant?: 'button' | 'row' }) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [format, setFormat] = useState('');
  const [gaps, setGaps] = useState<Gap[]>([]);

  // Reads certificates, not flights, so it is cheap enough to do on open.
  useEffect(() => {
    if (!open || formats.length) return;
    let alive = true;
    api.get('/logbook/print/formats')
      .then(({ data }) => {
        if (!alive) return;
        setFormats(data?.formats || []);
        setFormat((f) => f || data?.suggestedFormat || data?.formats?.[0]?.id || '');
      })
      .catch(() => { /* the picker simply stays on the server's default */ });
    return () => { alive = false; };
  }, [open, formats.length]);

  const chosen = formats.find((f) => f.id === format) || null;

  const run = useCallback(async () => {
    tapLight();
    setBusy(true); setNote('Building your logbook…'); setGaps([]);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (format) params.format = format;
      const { data } = await api.get('/logbook/print', { params });
      if (!data?.flightCount) { setNote('No flights in that range.'); setBusy(false); return; }
      const { uri } = await Print.printToFileAsync({ html: logbookPrintHtml(data) });
      setGaps(data.gaps || []);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Your logbook', UTI: 'com.adobe.pdf' });
        setNote(`${data.flightCount} flights over ${data.pages.length} page${data.pages.length === 1 ? '' : 's'} · ${data.format.label}.`);
      } else {
        setNote(`Saved to ${uri}`);
      }
    } catch (e) {
      notifyError();
      setNote(`Could not build the PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }, [from, to, format]);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={variant === 'row' ? styles.row : styles.btn}>
        <Text style={variant === 'row' ? styles.rowText : styles.btnText}>Print logbook</Text>
      </Pressable>

      <Sheet visible={open} title="Print logbook" onClose={() => { setOpen(false); setNote(null); setGaps([]); }}>
        <Text style={styles.sub}>An A4 landscape PDF with page totals and a signature line.</Text>
        <View style={{ height: spacing.md }} />

        <SelectField
          label="Layout"
          value={format}
          options={formats.map((f) => [f.id, f.label] as [string, string])}
          placeholder={formats.length ? 'Select…' : 'Loading…'}
          onSelect={(v) => { setFormat(v); setGaps([]); setNote(null); }}
        />
        {chosen ? (
          <Text style={styles.hint}>
            {chosen.note}
            {chosen.missing?.length
              ? ` ${listOf(sentenceCase(chosen.missing))} ${chosen.missing.length === 1 ? 'is' : 'are'} not in your logbook yet, so ${chosen.missing.length === 1 ? 'that column prints' : 'those columns print'} blank.`
              : ''}
          </Text>
        ) : null}
        <View style={{ height: spacing.md }} />

        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
        <Text style={styles.hint}>Leave both blank for every flight.</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}

        {gaps.length > 0 ? (
          <View style={styles.gaps}>
            <Text style={styles.gapsHead}>Printed blank, because we do not hold them yet</Text>
            {gaps.map((g) => (
              <Text key={g.key} style={styles.gapLine}>
                <Text style={styles.gapName}>{g.column}</Text> — {g.note}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={{ height: spacing.md }} />
        <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={run} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Building…' : 'Create PDF'}</Text>
        </Pressable>
      </Sheet>
    </>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  btn: { backgroundColor: pilot.navy, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  btnOff: { opacity: 0.55 },
  btnText: { color: '#fff', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },
  row: { paddingVertical: 12 },
  rowText: { color: pilot.navy, fontSize: fontSizes.base, fontFamily: fontFamilies.bodyMedium },
  sub: { color: pilot.muted, fontSize: fontSizes.sm, lineHeight: 20 },
  hint: { color: pilot.muted, fontSize: fontSizes.xs, marginTop: 6, lineHeight: 17 },
  note: { color: pilot.muted, fontSize: fontSizes.sm, marginTop: 12, lineHeight: 19,
    backgroundColor: '#F2F5F9', borderLeftWidth: 3, borderLeftColor: pilot.navy, borderRadius: 8, padding: 10 },
  gaps: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pilot.line, paddingTop: 10 },
  gapsHead: { color: pilot.muted, fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemiBold, letterSpacing: 0.4, textTransform: 'uppercase' },
  gapLine: { color: pilot.muted, fontSize: fontSizes.xs, lineHeight: 18, marginTop: 4 },
  gapName: { color: pilot.ink, fontFamily: fontFamilies.bodySemiBold },
});
