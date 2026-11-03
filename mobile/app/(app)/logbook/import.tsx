// Excel/CSV import — mirrors the SERVER-side two-step flow but with a mobile-native
// UX concession the user approved: tapping Import opens the native file picker
// DIRECTLY (no "pick a format" step). One picker accepts .xlsx/.xls/.csv; the
// backend auto-detects the format by header inspection (detectMapping +
// FIELD_SYNONYMS + stripLeadingMetadata for crew-schedule bands).
//
// (1) pick file → xlsx parsed client-side to CSV → POST /flight-logs/import/parse
// (multipart `file`) → { headers, mapping, rawRows, duplicateIndices }; apply the
// auto-mapping client-side for the preview. (2) POST /flight-logs/import/confirm
// { rows: mappedFields[] } → { imported, skipped }. Cap 5,000 rows.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { isAxiosError } from 'axios';
import api from '../../../src/lib/api';
import { fontFamilies, fontSizes, pilot, semantic, spacing, layout } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';

const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };
const ROW_LIMIT = 5000;
const REQUIRED_FIELDS = ['date'];
// One picker, all three types (Excel + CSV). iOS maps these MIME types to UTIs.
const PICK_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'text/comma-separated-values',
  'public.comma-separated-values-text', // iOS CSV UTI
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Duplicate = { index: number; where: 'logbook' | 'file'; date?: string | null; from?: string | null; to?: string | null; flightNumber?: string | null };
type Parsed = { headers: string[]; mapping: Record<string, string>; rawRows: any[][]; duplicateIndices?: number[]; duplicates?: Duplicate[] };
type DisplayRow = { rowIndex: number; fields: Record<string, string>; error: string | null; duplicate: boolean };

function toCsvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function clientValidate(fields: Record<string, string>): string | null {
  const date = (fields.date || '').toString().trim();
  if (!date) return 'Missing date';
  const ok = /^\d{4}-\d{2}-\d{2}/.test(date) || /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(date) ||
    /^\d{1,2}[\s/\-][A-Za-z]{3}[\s/\-]\d{2,4}$/.test(date) || /^\d{4,5}$/.test(date);
  return ok ? null : `Invalid date: "${date}"`;
}
function applyMapping(rawRows: unknown[][], headers: string[], mapping: Record<string, string>, dupSet: Set<number>): DisplayRow[] {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => { idx[h] = i; });
  return rawRows.map((raw, i) => {
    const fields: Record<string, string> = {};
    for (const [field, header] of Object.entries(mapping)) {
      if (header && idx[header] !== undefined) fields[field] = (raw[idx[header]] ?? '') as string;
    }
    if (Object.values(fields).every((v) => !v)) return null;
    return { rowIndex: i + 1, fields, error: clientValidate(fields), duplicate: dupSet.has(i) };
  }).filter(Boolean) as DisplayRow[];
}
/**
 * What we are skipping, in a sentence. Two kinds of duplicate now exist —
 * one the logbook already holds, and one the file repeats — and a pilot
 * should not have to guess which they are looking at.
 */
function duplicateSentence(total: number, inLogbook: number, inFile: number): string {
  const flights = `${total} flight${total === 1 ? '' : 's'}`;
  if (!inFile) return `${flights} already in your logbook, skipped.`;
  if (!inLogbook) return `${flights} repeated in this file, skipped.`;
  return `${flights} skipped — ${inLogbook} already in your logbook, ${inFile} repeated in this file.`;
}

function formatRoute(f: Record<string, string>): string {
  const dep = (f.departure || '').toUpperCase();
  const arr = (f.arrival || '').toUpperCase();
  return dep && arr ? `${dep} → ${arr}` : dep || arr || '—';
}

export default function ImportFlights() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [step, setStep] = useState<'source' | 'preview' | 'confirming' | 'done'>('source');
  const [busy, setBusy] = useState(true); // starts busy — picker opens on mount
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number; skippedDuplicates?: number } | null>(null);
  const [showDupes, setShowDupes] = useState(false);
  const [includeDupes, setIncludeDupes] = useState(false);
  const launched = useRef(false);

  const dupeInfo = useMemo(() => {
    const list: Duplicate[] = parsed?.duplicates
      || (parsed?.duplicateIndices || []).map((index) => ({ index, where: 'logbook' as const }));
    return new Map(list.map((d) => [d.index, d]));
  }, [parsed]);

  const displayRows = useMemo(() => {
    if (!parsed) return [];
    return applyMapping(parsed.rawRows, parsed.headers, parsed.mapping || {}, new Set(dupeInfo.keys()));
  }, [parsed, dupeInfo]);
  const validRows = useMemo(() => displayRows.filter((r) => !r.error), [displayRows]);
  const errorRows = useMemo(() => displayRows.filter((r) => r.error), [displayRows]);
  const dupRows = useMemo(() => validRows.filter((r) => r.duplicate), [validRows]);
  // Each duplicate carries its reason: already in the logbook, or repeated
  // inside this very file.
  const dupeList = useMemo(() => displayRows
    .map((row, i) => ({ row, info: dupeInfo.get(i) }))
    .filter((x): x is { row: DisplayRow; info: Duplicate } => !!x.info && !x.row.error), [displayRows, dupeInfo]);
  const inFile = dupeList.filter(({ info }) => info.where === 'file').length;
  const inLogbook = dupeList.length - inFile;
  const toImport = useMemo(() => validRows.filter((r) => includeDupes || !r.duplicate), [validRows, includeDupes]);
  const datesMapped = REQUIRED_FIELDS.every((f) => (parsed?.mapping || {})[f]);

  // Open the OS file picker DIRECTLY the moment the screen mounts.
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    pickAndParse(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickAndParse(fromMount = false) {
    setError(''); setNote(''); setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: PICK_TYPES, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) {
        // Cancelled from the initial auto-open → leave the import screen entirely.
        if (fromMount) { router.back(); return; }
        setBusy(false);
        return;
      }
      const asset = res.assets[0];
      const isCsv = /\.csv$/i.test(asset.name) || asset.mimeType === 'text/csv';

      let csvUri = asset.uri;
      if (!isCsv) {
        // xlsx/xls → read base64 → SheetJS → first sheet → CSV → temp file
        const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        const wb = XLSX.read(b64, { type: 'base64', cellDates: true });
        if (!wb.SheetNames?.length) throw new Error('This file has no readable sheets.');
        const first = wb.SheetNames[0];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1, raw: false, dateNF: 'yyyy-mm-dd', blankrows: false });
        const nonEmpty = rows.filter((r) => Array.isArray(r) && r.some((c) => c != null && String(c).trim() !== ''));
        if (nonEmpty.length === 0) throw new Error('The first sheet is empty.');
        if (nonEmpty.length < 2) throw new Error('The first sheet has no data rows — only a header row was found.');
        if (nonEmpty.length - 1 > ROW_LIMIT) throw new Error(`File has ${nonEmpty.length - 1} data rows. The limit is ${ROW_LIMIT} rows per import.`);
        if (wb.SheetNames.length > 1) setNote(`Using sheet "${first}" — ${wb.SheetNames.length - 1} other sheet(s) ignored.`);
        const csv = nonEmpty.map((row) => row.map(toCsvCell).join(',')).join('\r\n');
        csvUri = `${FileSystem.cacheDirectory}logbook-import.csv`;
        await FileSystem.writeAsStringAsync(csvUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      }

      const fd = new FormData();
      if (Platform.OS === 'web') {
        // On web the file part must be a real Blob (RN's {uri} form is native-only).
        const blob = await (await fetch(csvUri)).blob();
        fd.append('file', blob, 'import.csv');
      } else {
        fd.append('file', { uri: csvUri, name: 'import.csv', type: 'text/csv' } as unknown as Blob);
      }
      const { data } = await api.post('/flight-logs/import/parse', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if ((data.rawRows?.length || 0) > ROW_LIMIT) throw new Error(`File has ${data.rawRows.length} data rows. The limit is ${ROW_LIMIT} rows per import.`);
      setParsed(data);
      setStep('preview');
    } catch (err) {
      if (isAxiosError(err)) setError(err.response?.data?.error || 'Could not parse file.');
      else setError((err as Error)?.message || 'Could not read this file.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    setError(''); setStep('confirming');
    try {
      const rows = toImport.map((r) => r.fields);
      const { data } = await api.post('/flight-logs/import/confirm',
        { rows, includeDuplicates: includeDupes }, { timeout: 60000 });
      // The server checks again at the moment of writing, so it may have
      // skipped more than the preview knew about.
      setResult({ imported: data.imported, skipped: data.skipped, skippedDuplicates: data.skippedDuplicates || 0 });
      setStep('done');
    } catch (err) {
      const timedOut = isAxiosError(err) && (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || ''));
      setError(timedOut ? 'Import is taking longer than expected. Please try again or split the file into smaller batches.'
        : (isAxiosError(err) ? err.response?.data?.error : (err as Error)?.message) || 'Import failed. Please try again.');
      setStep('preview');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Ionicons name="close" size={22} color={pilot.ink} /></Pressable>
        <Text style={styles.topTitle}>{step === 'done' ? 'Import Complete' : 'Import Flights'}</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 'source' && (
          <View style={styles.sourceWrap}>
            {busy ? (
              <>
                <ActivityIndicator color={pilot.navy} />
                <Text style={styles.sourceText}>Opening file picker…</Text>
                <Text style={styles.sourceHint}>Choose an .xlsx, .xls, or .csv file. The format is detected automatically.</Text>
              </>
            ) : (
              <>
                {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
                <Text style={styles.sourceText}>Import your logbook</Text>
                <Text style={styles.sourceHint}>.xlsx / .xls / .csv · max 5,000 rows · first sheet only</Text>
                <Pressable style={styles.primaryBtn} onPress={() => pickAndParse(false)}><Text style={styles.primaryBtnText}>Choose a file</Text></Pressable>
              </>
            )}
          </View>
        )}

        {(step === 'preview' || step === 'confirming') && parsed && (
          <>
            {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
            <View style={styles.statsBar}>
              <Text style={[styles.stat, { color: SEM.green }]}>✓ {toImport.length} ready</Text>
              {dupRows.length > 0 ? <Text style={styles.statMuted}>{dupRows.length} already logged</Text> : null}
              {errorRows.length > 0 ? <Text style={[styles.stat, { color: SEM.red }]}>✗ {errorRows.length} error{errorRows.length === 1 ? '' : 's'}</Text> : null}
              <Text style={styles.statMuted}>{parsed.rawRows.length} rows parsed</Text>
            </View>
            {note ? <Text style={styles.note}>{note}</Text> : null}
            {!datesMapped ? <View style={styles.warnBanner}><Text style={styles.warnText}>Couldn't auto-detect a date column — the file may be unsupported.</Text></View> : null}

            {/* What we are going to skip, and why — with the flights one tap
                away, and the pilot still able to overrule it. */}
            {dupeList.length > 0 ? (
              <View style={styles.dupNote}>
                <Text style={styles.dupText}>{duplicateSentence(dupeList.length, inLogbook, inFile)}</Text>
                <Pressable onPress={() => setShowDupes((v) => !v)} hitSlop={8}>
                  <Text style={styles.dupLink}>{showDupes ? 'Hide them' : 'See them'}</Text>
                </Pressable>
                {showDupes ? (
                  <View style={styles.dupList}>
                    {dupeList.slice(0, 25).map(({ row, info }) => (
                      <Text key={info.index} style={styles.dupItem} numberOfLines={2}>
                        {row.fields.date || info.date || '—'} · {formatRoute(row.fields)}
                        {row.fields.flightNumber ? ` · ${row.fields.flightNumber}` : ''}
                        {info.where === 'file' ? ' — repeated in this file' : ' — already in your logbook'}
                      </Text>
                    ))}
                    {dupeList.length > 25 ? <Text style={styles.dupItem}>…and {dupeList.length - 25} more.</Text> : null}
                  </View>
                ) : null}
                <Pressable onPress={() => setIncludeDupes((v) => !v)} hitSlop={8} style={styles.dupCheckRow}>
                  <View style={[styles.checkbox, includeDupes && styles.checkboxOn]}>
                    {includeDupes ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                  </View>
                  <Text style={styles.dupCheckLabel}>Import them anyway</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.previewTitle}>Preview (first 10 of {displayRows.length})</Text>
            <View style={styles.previewTable}>
              <View style={styles.previewHead}>
                <Text style={[styles.pcell, styles.pStatus]}></Text>
                <Text style={[styles.pcell, styles.pDate]}>DATE</Text>
                <Text style={[styles.pcell, styles.pRoute]}>ROUTE</Text>
              </View>
              {displayRows.slice(0, 10).map((r) => (
                <View key={r.rowIndex} style={styles.previewRow}>
                  <Text style={[styles.pcell, styles.pStatus, { color: r.error ? SEM.red : r.duplicate ? pilot.muted : SEM.green }]}>{r.error ? '✗' : r.duplicate ? '–' : '✓'}</Text>
                  <Text style={[styles.pcell, styles.pDate, styles.mono]} numberOfLines={1}>{r.fields.date || '—'}</Text>
                  <Text style={[styles.pcell, styles.pRoute]} numberOfLines={1}>{formatRoute(r.fields)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.footer}>
              <Pressable style={styles.secondaryBtn} onPress={() => pickAndParse(false)} disabled={step === 'confirming'}>
                <Text style={styles.secondaryBtnText}>Choose another</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, (!datesMapped || toImport.length === 0 || step === 'confirming') && styles.btnDisabled]}
                onPress={(!datesMapped || toImport.length === 0 || step === 'confirming') ? undefined : confirmImport}>
                <Text style={styles.primaryBtnText}>{step === 'confirming' ? 'Importing…' : `Import ${toImport.length} ${toImport.length === 1 ? 'Flight' : 'Flights'}`}</Text>
              </Pressable>
            </View>
          </>
        )}

        {step === 'done' && result && (
          <View style={styles.doneWrap}>
            <Ionicons name="checkmark-circle" size={52} color={SEM.green} />
            <Text style={styles.doneTitle}>{result.imported} {result.imported === 1 ? 'flight' : 'flights'} imported</Text>
            {result.skipped > 0 ? <Text style={styles.body}>{result.skipped} {result.skipped === 1 ? 'row' : 'rows'} had errors and were skipped.</Text> : null}
            {result.skippedDuplicates ? (
              <Text style={styles.body}>
                {result.skippedDuplicates} {result.skippedDuplicates === 1 ? 'flight was' : 'flights were'} already in your logbook and {result.skippedDuplicates === 1 ? 'was' : 'were'} skipped.
              </Text>
            ) : null}
            <Text style={styles.body}>Your logbook has been updated.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.replace('/logbook')}><Text style={styles.primaryBtnText}>Done</Text></Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: pilot.line },
  topTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.md, color: pilot.ink },
  content: { padding: layout.screenX, paddingBottom: 60, flexGrow: 1 },
  sourceWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 80 },
  sourceText: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.md, color: pilot.ink, marginTop: 6 },
  sourceHint: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: pilot.muted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  body: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 16, lineHeight: 22, textAlign: 'center' },
  errorBanner: { backgroundColor: semantic.errorBg, borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { color: SEM.red, fontFamily: fontFamilies.body, fontSize: fontSizes.sm, textAlign: 'center' },
  warnBanner: { backgroundColor: 'rgba(146,64,14,0.08)', borderWidth: 1, borderColor: 'rgba(146,64,14,0.3)', borderRadius: 8, padding: 12, marginBottom: 12 },
  warnText: { color: SEM.amber, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  statsBar: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: pilot.surface, borderRadius: 10, padding: 12, marginBottom: 12, flexWrap: 'wrap' },
  stat: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm },
  statMuted: { marginLeft: 'auto', color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.xs },

  // The duplicate note: a quiet panel, not a warning.
  dupNote: { borderWidth: StyleSheet.hairlineWidth, borderColor: pilot.line, borderRadius: 8,
    backgroundColor: pilot.page, padding: 12, marginBottom: spacing.md },
  dupText: { color: pilot.ink, fontFamily: fontFamilies.body, fontSize: fontSizes.sm, lineHeight: 20 },
  dupLink: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, marginTop: 6 },
  dupList: { marginTop: 8, gap: 3 },
  dupItem: { color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.xs, lineHeight: 17 },
  dupCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: pilot.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: pilot.surface },
  checkboxOn: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  dupCheckLabel: { color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  note: { color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.xs, marginBottom: 12 },
  previewTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, color: pilot.ink, marginBottom: 8 },
  previewTable: { borderWidth: 1, borderColor: pilot.line, borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
  previewHead: { flexDirection: 'row', backgroundColor: pilot.cream, borderBottomWidth: 1, borderBottomColor: pilot.line, paddingVertical: 8, paddingHorizontal: 8 },
  previewRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: pilot.line, paddingVertical: 10, paddingHorizontal: 8, backgroundColor: pilot.surface },
  pcell: { fontSize: fontSizes.sm, fontFamily: fontFamilies.body, color: pilot.ink, paddingHorizontal: 4 },
  pStatus: { width: 26, fontFamily: fontFamilies.bodyBold },
  pDate: { width: 110 },
  pRoute: { flex: 1, fontFamily: fontFamilies.bodySemiBold },
  mono: { fontFamily: fontFamilies.mono },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  primaryBtn: { backgroundColor: pilot.navy, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', marginTop: 16 },
  primaryBtnText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  secondaryBtn: { borderWidth: 1, borderColor: pilot.navy, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', marginTop: 16 },
  secondaryBtnText: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  btnDisabled: { opacity: 0.45 },
  doneWrap: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  doneTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink, marginTop: 8 },
});
