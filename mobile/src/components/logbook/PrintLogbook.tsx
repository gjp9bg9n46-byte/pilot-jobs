// "Print logbook" — pick a date range, then produce an A4 landscape PDF.
//
// expo-print renders the HTML (it is in build 10, so this ships as an update)
// and expo-sharing hands it to the share sheet. The rows, page breaks and
// totals come from GET /logbook/print — the same payload the web PDF draws
// from, so the two documents are the same.
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../lib/api';
import { DateField, Sheet } from '../ui';
import { logbookPrintHtml } from '../../lib/logbookPrintHtml';
import { tapLight, notifyError } from '../../lib/haptics';
import { fontFamilies, fontSizes, spacing } from '../../theme/tokens';
import { ThemePalette, useThemedStyles } from '../../theme/ThemeContext';

export default function PrintLogbook({ variant = 'button' }: { variant?: 'button' | 'row' }) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = useCallback(async () => {
    tapLight();
    setBusy(true); setNote('Building your logbook…');
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const { data } = await api.get('/logbook/print', { params });
      if (!data?.flightCount) { setNote('No flights in that range.'); setBusy(false); return; }
      const { uri } = await Print.printToFileAsync({ html: logbookPrintHtml(data) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Your logbook', UTI: 'com.adobe.pdf' });
        setNote(`${data.flightCount} flights over ${data.pages.length} page${data.pages.length === 1 ? '' : 's'}.`);
      } else {
        setNote(`Saved to ${uri}`);
      }
    } catch (e) {
      notifyError();
      setNote(`Could not build the PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }, [from, to]);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={variant === 'row' ? styles.row : styles.btn}>
        <Text style={variant === 'row' ? styles.rowText : styles.btnText}>Print logbook</Text>
      </Pressable>

      <Sheet visible={open} title="Print logbook" onClose={() => { setOpen(false); setNote(null); }}>
        <Text style={styles.sub}>An A4 landscape PDF in the EASA layout, with page totals and a signature line.</Text>
        <View style={{ height: spacing.md }} />
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
        <Text style={styles.hint}>Leave both blank for every flight.</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
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
  hint: { color: pilot.muted, fontSize: fontSizes.xs, marginTop: 6 },
  note: { color: pilot.muted, fontSize: fontSizes.sm, marginTop: 12, lineHeight: 19,
    backgroundColor: '#F2F5F9', borderLeftWidth: 3, borderLeftColor: pilot.navy, borderRadius: 8, padding: 10 },
});
