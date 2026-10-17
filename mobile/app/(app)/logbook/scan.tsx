// Scan a voyage report: take or choose a photo (or a PDF), let the server read
// it, then check every sector before anything is saved. The mockup's four
// steps — capture, read, check, done — in one screen's worth of state.
//
// The native document scanner only exists in a real build; in Expo Go the
// camera, the gallery and a PDF all work, which is why capture offers three
// doors rather than one.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import api, { API_URL, getToken } from '../../../src/lib/api';
import { minutesToHHMM, spanMinutes } from '../../../src/lib/logbookFormat';
import { fontFamilies, fontSizes, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const AMBER = '#B45309';
const RED = '#B42318';
const GREEN = '#15803D';

export default function ScanVoyageReport() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const [stage, setStage] = useState<'capture' | 'reading' | 'review' | 'done'>('capture');
  const [scan, setScan] = useState<Any>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<Any>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Any>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  // 'suggestion' | 'keep' — a flagged date has to be answered before saving.
  const [dateChoice, setDateChoice] = useState<string | null>(null);
  // The straightened page, fetched with the session token, so an amber field can
  // be checked against what the camera actually saw.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { getToken().then(setToken); }, []);

  useEffect(() => { api.get('/logbook/scan-quota').then(({ data }) => setQuota(data)).catch(() => {}); }, []);

  const send = useCallback(async (uri: string, name: string, type: string) => {
    setStage('reading'); setError(null); setPhoto(type.startsWith('image/') ? uri : null);
    const body = new FormData();
    // React Native's FormData takes the file by reference — the bytes never
    // pass through JS, so a 10 MB photo costs nothing here.
    body.append('file', { uri, name, type } as unknown as Blob);
    try {
      const { data } = await api.post('/logbook/scan', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 90000,
      });
      setScan(data);
      setStage('review');
    } catch (e: Any) {
      setError(e?.response?.data?.error || "Couldn't read this photo — try again or enter manually.");
      setStage('capture');
    }
  }, []);

  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setError('CockpitHire needs camera access to photograph the report.'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.9, exif: true });
    if (!r.canceled && r.assets[0]) send(r.assets[0].uri, r.assets[0].fileName || 'report.jpg', r.assets[0].mimeType || 'image/jpeg');
  };
  const fromGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!r.canceled && r.assets[0]) send(r.assets[0].uri, r.assets[0].fileName || 'report.jpg', r.assets[0].mimeType || 'image/jpeg');
  };
  const fromPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (!r.canceled && r.assets?.[0]) send(r.assets[0].uri, r.assets[0].name, r.assets[0].mimeType || 'application/pdf');
  };

  const setSector = (i: number, patch: Any) =>
    setScan((s: Any) => ({ ...s, sectors: s.sectors.map((x: Any, n: number) => (n === i ? { ...x, ...patch } : x)) }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const { data } = await api.post(`/logbook/scan/${scan.id}/save`, { header: scan.header, sectors: scan.sectors, dateChoice });
      setResult(data);
      setStage('done');
    } catch (e: Any) {
      setError(e?.response?.data?.error || 'Could not save these flights.');
    } finally { setSaving(false); }
  };

  const discard = () => {
    if (scan?.id) api.delete(`/logbook/scan/${scan.id}`).catch(() => {});
    router.back();
  };

  const header = (title: string, onBack: () => void) => (
    <View style={styles.bar}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.back}><Ionicons name="chevron-back" size={22} color={pilot.ink} /></Pressable>
      <Text style={styles.barTitle}>{title}</Text>
    </View>
  );

  // ── Capture ───────────────────────────────────────────────────────────────
  if (stage === 'capture' || stage === 'reading') {
    const busy = stage === 'reading';
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header('Scan voyage report', () => router.back())}
        <ScrollView contentContainerStyle={styles.pad}>
          {error ? <View style={styles.warn}><Ionicons name="alert-circle-outline" size={16} color={AMBER} /><Text style={styles.warnText}>{error}</Text></View> : null}
          {busy ? (
            <View style={styles.reading}>
              <ActivityIndicator color={pilot.navy} />
              <Text style={styles.readingText}>Reading every sector on the report…</Text>
              <Text style={styles.readingSub}>This takes a few seconds. Nothing is saved yet.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.lead}>
                Photograph the whole page, flat and in focus. We read the date, flight numbers, route,
                out/off/on/in times and landings — you check them before anything is saved.
              </Text>
              <Pressable style={[styles.big, styles.bigMain]} onPress={fromCamera}>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={styles.bigMainText}>Take a photo</Text>
              </Pressable>
              <View style={styles.row}>
                <Pressable style={styles.big} onPress={fromGallery}>
                  <Ionicons name="images-outline" size={18} color={pilot.navy} />
                  <Text style={styles.bigText}>Gallery</Text>
                </Pressable>
                <Pressable style={styles.big} onPress={fromPdf}>
                  <Ionicons name="document-outline" size={18} color={pilot.navy} />
                  <Text style={styles.bigText}>PDF</Text>
                </Pressable>
              </View>
              {quota ? (
                <Text style={styles.quota}>
                  {quota.configured ? `${quota.left} of ${quota.limit} scans left today.` : 'Scanning is not available right now.'}
                  {' '}The photo is deleted once the flights are saved.
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (stage === 'done') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.pad, { paddingTop: 50 }]}>
          <View style={styles.tick}><Ionicons name="checkmark" size={34} color={GREEN} /></View>
          <Text style={styles.doneH}>{result.saved} {result.saved === 1 ? 'flight' : 'flights'} added</Text>
          <Text style={styles.doneP}>
            {result.skipped > 0 ? `${result.skipped} already in your logbook, skipped. ` : ''}
            Totals, your CV and your job matches are up to date.
          </Text>
          <Text style={styles.note}>
            {result.imageKept ? 'The photo is kept, as you asked.' : 'The photo has been deleted.'}
          </Text>
          <View style={styles.row}>
            <Pressable style={styles.big} onPress={() => { setScan(null); setResult(null); setPhoto(null); setStage('capture'); }}>
              <Text style={styles.bigText}>Scan another</Text>
            </Pressable>
            <Pressable style={[styles.big, styles.bigMain]} onPress={() => router.replace('/logbook')}>
              <Text style={styles.bigMainText}>View logbook</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Review ────────────────────────────────────────────────────────────────
  const sectors: Any[] = scan.sectors || [];
  const toCheck = sectors.filter((s) => s.needsCheck && !s.duplicate).length;
  const keeping = sectors.filter((s) => s.include !== false && !s.duplicate).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header(`Check ${sectors.length} ${sectors.length === 1 ? 'flight' : 'flights'}`, discard)}
      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: 120 }]}>
        <View style={styles.found}>
          {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : <View style={styles.thumb} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.foundTitle}>
              {sectors.length} {sectors.length === 1 ? 'sector' : 'sectors'} found{scan.header.date ? ` · ${scan.header.date}` : ''}
            </Text>
            <Text style={styles.foundSub}>
              {[scan.header.aircraftType, scan.header.registration].filter(Boolean).join(' · ')}
              {scan.header.commander ? ` · Capt ${scan.header.commander}` : ''}
              {'\n'}You: {scan.header.pilotRole === 'PIC' ? 'Captain (PIC)' : 'First Officer (SIC)'}
            </Text>
          </View>
        </View>

        {/* The date is the one field that can bury a flight without looking
            wrong: a misread year still shows the right day and month, and the
            flight lands two years down the logbook. It is editable here, and
            the server's suggestion is one tap. */}
        {scan.header.flags?.date ? (
          <View style={styles.warn}>
            <Ionicons name="alert-circle-outline" size={16} color={AMBER} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnText}>{scan.header.flags.date.message}</Text>
              <View style={styles.dateRow}>
                <TextInput
                  value={scan.header.date || ''}
                  onChangeText={(v) => setScan((x: Any) => ({ ...x, header: { ...x.header, date: v } }))}
                  style={styles.dateInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={pilot.faint}
                  keyboardType="numbers-and-punctuation"
                />
                {scan.header.dateSuggestion ? (
                  <Pressable
                    onPress={() => { setDateChoice('suggestion'); setScan((x: Any) => ({ ...x, header: { ...x.header, date: x.header.dateSuggestion } })); }}
                    style={[styles.useBtn, dateChoice === 'suggestion' && styles.useBtnOn]}
                  >
                    <Text style={[styles.useBtnText, dateChoice === 'suggestion' && styles.useBtnTextOn]}>Use {scan.header.dateSuggestion}</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setDateChoice('keep')} style={[styles.useBtn, styles.keepBtn, dateChoice === 'keep' && styles.useBtnOn]}>
                  <Text style={[styles.useBtnText, dateChoice === 'keep' && styles.useBtnTextOn]}>Keep it</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {toCheck > 0 ? (
          <View style={styles.warn}>
            <Ionicons name="warning-outline" size={16} color={AMBER} />
            <Text style={styles.warnText}>
              <Text style={styles.warnStrong}>{toCheck} {toCheck === 1 ? 'sector needs' : 'sectors need'} a look.</Text>
              {' '}Tap a flight to compare the amber fields with the photo.
            </Text>
          </View>
        ) : null}

        {sectors.map((s, i) => {
          const flags = s.flags || {};
          const open = expanded === i;
          const cell = (k: 'out' | 'off' | 'on' | 'in', label: string) => (
            <View style={[styles.cell, flags[k] && styles.cellQ]} key={k}>
              <Text style={styles.cellLabel}>{label}</Text>
              {open ? (
                <TextInput
                  value={s[k] || ''}
                  onChangeText={(v) => setSector(i, { [k]: v })}
                  style={[styles.cellInput, flags[k] && styles.cellInputQ]}
                  keyboardType="numbers-and-punctuation"
                  placeholder="--:--"
                  placeholderTextColor={pilot.faint}
                />
              ) : (
                <Text style={[styles.cellValue, flags[k] && styles.cellValueQ]}>{s[k] || '—'}</Text>
              )}
            </View>
          );
          const block = spanMinutes(s.out, s.in);
          return (
            <View key={i} style={[styles.fl, s.duplicate && styles.flDup]}>
              <Pressable style={styles.flh} onPress={() => setExpanded(open ? null : i)}>
                <View style={{ flex: 1 }}>
                  <View style={styles.routeRow}>
                    <Text style={styles.route}>{s.from || '??'}</Text>
                    <Ionicons name="arrow-forward" size={15} color={pilot.faint} />
                    <Text style={styles.route}>{s.to || '??'}</Text>
                  </View>
                  <Text style={styles.flSub}>
                    {s.flightNumber || 'No flight number'} · {s.pilotFlying === true ? 'Pilot flying' : s.pilotFlying === false ? 'Monitoring' : 'Duty not marked'}
                    {s.dayOffset > 0 ? ` · ${s.sectorDate}` : ''}
                  </Text>
                </View>
                {s.duplicate
                  ? <Text style={styles.dup}>Already logged</Text>
                  : s.needsCheck
                    ? <Text style={styles.chk}>Check {Object.keys(flags).length}</Text>
                    : <Text style={styles.ok}>Looks right</Text>}
              </Pressable>

              <Pressable onPress={() => setExpanded(open ? null : i)} style={styles.grid4}>
                {(['out', 'off', 'on', 'in'] as const).map((k) => cell(k, k.toUpperCase()))}
              </Pressable>

              <View style={styles.kv}>
                <View style={styles.kvCell}><Text style={styles.kvLabel}>Block</Text><Text style={styles.kvValue}>{minutesToHHMM(block)}</Text></View>
                <View style={styles.kvCell}><Text style={styles.kvLabel}>Airborne</Text><Text style={styles.kvValue}>{minutesToHHMM(spanMinutes(s.off, s.on))}</Text></View>
                <View style={styles.kvCell}>
                  <Text style={styles.kvLabel}>Night{s.nightSource === 'form' ? ' (form)' : ''}</Text>
                  <Text style={styles.kvValue}>{minutesToHHMM(s.night)}</Text>
                </View>
                <View style={styles.kvCell}>
                  <Text style={styles.kvLabel}>Landings</Text>
                  <Text style={styles.kvValue}>{s.myLandings || 0}{s.nightLanding ? ' night' : ''}</Text>
                </View>
              </View>

              {open ? (
                <View style={styles.why}>
                  {Object.entries(flags).map(([k, f]: Any) => (
                    <Text key={k} style={[styles.whyLine, f.level === 'red' && { color: RED }]}>
                      {k.toUpperCase()}: {f.message}
                    </Text>
                  ))}
                  <View style={styles.pfRow}>
                    <Text style={styles.kvLabel}>I was the pilot flying</Text>
                    <Switch
                      value={s.pilotFlying === true}
                      onValueChange={(v) => setSector(i, { pilotFlying: v })}
                      trackColor={{ true: '#16A34A', false: '#CBD3DD' }}
                      thumbColor="#fff"
                    />
                  </View>
                  {s.duplicate ? (
                    <Text style={styles.whyLine}>Already in your logbook ({s.duplicateReason}), so it will be skipped.</Text>
                  ) : null}
                  {token ? (
                    <>
                      <Text style={styles.compare}>
                        {Object.keys(flags).length ? 'The row this was read from' : 'The page, as we read it'}
                      </Text>
                      <Image
                        source={{
                          // One sector's strip of paper, so an amber time can be
                          // checked without hunting for the row on a whole page.
                          uri: `${API_URL}/logbook/scan/${scan.id}/row/${i}/image`,
                          headers: { Authorization: `Bearer ${token}` },
                        }}
                        style={styles.page}
                        resizeMode="contain"
                      />
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        <Text style={styles.note}>
          Times are UTC, as on the report. Block and airborne come from your times; night is worked out
          from the sun along the route, and the report&apos;s own figure wins where it differs.
        </Text>
        {error ? <Text style={[styles.whyLine, { color: RED }]}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.fixed}>
        <Pressable style={styles.big} onPress={discard}><Text style={styles.bigText}>Discard</Text></Pressable>
        <Pressable
          style={[styles.big, styles.bigMain, (!keeping || saving || (!!scan.header.flags?.date && !dateChoice)) && { opacity: 0.6 }]}
          disabled={!keeping || saving || (!!scan.header.flags?.date && !dateChoice)}
          onPress={save}
        >
          <Text style={styles.bigMainText}>
            {saving ? 'Saving…' : scan.header.flags?.date && !dateChoice ? 'Choose a date first' : `Save ${keeping} ${keeping === 1 ? 'flight' : 'flights'}`}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  pad: { padding: spacing.xl },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: pilot.line, backgroundColor: pilot.surface },
  back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  barTitle: { fontSize: 16, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },

  lead: { fontSize: 14, lineHeight: 21, color: pilot.muted, fontFamily: fontFamilies.body, marginBottom: 18 },
  big: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 10, borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface },
  bigMain: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  bigText: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.navy },
  bigMainText: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: '#fff' },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  quota: { fontSize: 12.5, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 16, lineHeight: 18 },
  reading: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  readingText: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  readingSub: { fontSize: 13, color: pilot.muted, fontFamily: fontFamilies.body },

  warn: { flexDirection: 'row', gap: 9, backgroundColor: '#FFF8EC', borderWidth: 1, borderColor: '#F3DDB5', borderRadius: 10, padding: 11, marginBottom: 10 },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#5B3A0A', fontFamily: fontFamilies.body },
  warnStrong: { fontFamily: fontFamilies.bodySemiBold },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dateInput: { flex: 1, height: 38, borderWidth: 1, borderColor: '#E9B872', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#fff', color: '#5B3A0A', fontFamily: fontFamilies.body, fontSize: 14 },
  useBtn: { height: 38, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E9B872', alignItems: 'center', justifyContent: 'center' },
  useBtnText: { color: AMBER, fontFamily: fontFamilies.bodySemiBold, fontSize: 12.5 },
  useBtnOn: { backgroundColor: AMBER, borderColor: AMBER },
  useBtnTextOn: { color: '#fff' },
  keepBtn: { backgroundColor: '#fff' },

  found: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 10, marginBottom: 10 },
  thumb: { width: 58, height: 74, borderRadius: 6, backgroundColor: '#F1EEE6', borderWidth: 1, borderColor: '#DDD7CA' },
  foundTitle: { fontSize: 14.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  foundSub: { fontSize: 12.5, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2, lineHeight: 18 },

  fl: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, marginTop: 10, overflow: 'hidden' },
  flDup: { opacity: 0.65 },
  flh: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: pilot.line },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  route: { fontFamily: fontFamilies.display, fontSize: 19, color: pilot.ink },
  flSub: { fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 2 },
  ok: { fontSize: 11.5, fontFamily: fontFamilies.bodyBold, color: GREEN, backgroundColor: '#E7F5EC', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  chk: { fontSize: 11.5, fontFamily: fontFamilies.bodyBold, color: AMBER, backgroundColor: '#FDF1DD', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  dup: { fontSize: 11.5, fontFamily: fontFamilies.bodyBold, color: pilot.faint, backgroundColor: '#EEF1F5', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },

  grid4: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: pilot.line },
  cell: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderLeftWidth: 1, borderLeftColor: pilot.line },
  cellQ: { backgroundColor: '#FFF8EC' },
  cellLabel: { fontSize: 10.5, color: pilot.faint, fontFamily: fontFamilies.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  cellValue: { fontSize: 14.5, color: pilot.ink, fontFamily: fontFamilies.body, fontVariant: ['tabular-nums'] },
  cellValueQ: { color: AMBER, fontFamily: fontFamilies.bodySemiBold },
  cellInput: { fontSize: 14.5, color: pilot.ink, fontFamily: fontFamilies.body, padding: 0, height: 22 },
  cellInputQ: { color: AMBER },

  kv: { flexDirection: 'row', flexWrap: 'wrap' },
  kvCell: { width: '50%', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#F0F3F7' },
  kvLabel: { fontSize: 12.5, color: pilot.faint, fontFamily: fontFamilies.body },
  kvValue: { fontSize: 12.5, color: pilot.ink, fontFamily: fontFamilies.bodySemiBold, fontVariant: ['tabular-nums'] },

  why: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: pilot.line, backgroundColor: '#FCFDFE' },
  whyLine: { fontSize: 12.5, lineHeight: 18, color: AMBER, fontFamily: fontFamilies.body },
  pfRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },

  compare: { fontSize: 11.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  page: { width: '100%', height: 190, borderRadius: 8, backgroundColor: '#F1EEE6' },
  note: { fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 14, lineHeight: 18 },
  fixed: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 28, backgroundColor: pilot.surface, borderTopWidth: 1, borderTopColor: pilot.line },

  tick: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#E7F5EC', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 18 },
  doneH: { fontFamily: fontFamilies.display, fontSize: 26, color: pilot.ink, textAlign: 'center' },
  doneP: { fontSize: 14, color: pilot.muted, fontFamily: fontFamilies.body, textAlign: 'center', marginTop: 6, lineHeight: 21 },
});
