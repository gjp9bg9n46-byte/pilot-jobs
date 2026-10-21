// CV Builder — the app twin of the mobile web page (handoff rule B).
// A "CV Builder" page title with Share + Download as icon buttons beside it,
// Preview / Edit tabs, and the same control panel: Before you send, Summary,
// Template, Accent, Sections. (The actions used to float in a bar above the
// tab pill, where they covered the bottom of the sheet — TestFlight #6.)
//
// The document, the checks and the masking all come from GET /cv/document, so
// the app cannot disagree with the web builder, the PDF or the share page.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, Share,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api, { WEB_URL } from '../../../src/lib/api';
import { cvSheetHtml } from '../../../src/cv/sheetHtml';
import SheetView from '../../../src/cv/SheetView';
import { useTabBarClearance } from '../../../src/theme/tabBar';
import { fontFamilies, fontSizes, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';
import { useCvDocument } from '../../../src/hooks/queries';
import { CvSkeleton } from '../../../src/components/Skeleton';
import Segmented from '../../../src/components/Segmented';
import { notifySuccess, tapLight } from '../../../src/lib/haptics';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const SUMMARY_MAX = 600;
const DOT: Record<string, string> = { red: '#B42318', amber: '#B45309', green: '#15803D' };
const ACCENTS: [string, string, string][] = [
  ['navy', 'Navy', '#0B1F3A'], ['charcoal', 'Charcoal', '#2E3440'],
  ['slate', 'Slate', '#3B5672'], ['forest', 'Forest', '#24453A'],
];
const SECTION_LABEL: Record<string, string> = {
  experience: 'Flight experience', licences: 'Licences & ratings', medical: 'Medical & English',
  training: 'Training', employment: 'Employment history', rtw: 'Right to work',
  education: 'Education & languages', photo: 'Photo',
};

function CvBuilderScreen() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  // Nothing floats over the sheet any more, so the scroll only has to clear
  // the tab pill itself.
  const clearance = useTabBarClearance(24);

  const [tab, setTab] = useState<'preview' | 'edit'>('preview');
  // Errors from an action the pilot took (rewrite, save) — shown under the
  // control they came from, separate from a failure to load the document.
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [summarySeeded, setSummarySeeded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheetW, setSheetW] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The CV document is cached, so the tab opens on the last version you saw
  // while the fresh one loads behind it.
  const { data, isPending, refetch, error: queryError } = useCvDocument();
  const err = queryError ? ((queryError as Any)?.response?.data?.error || 'Could not load your CV.') : null;
  const load = useCallback(async () => { await refetch(); }, [refetch]);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); tapLight(); await refetch(); setRefreshing(false); }, [refetch]);
  // Seed the editable summary from the document the first time it arrives.
  useEffect(() => {
    if (!summarySeeded && data?.document) { setSummary(data.document.summary || ''); setSummarySeeded(true); }
  }, [data, summarySeeded]);

  const save = useCallback(async (patch: Any) => {
    setBusy('save');
    try { await api.put('/cv/settings', patch); await load(); }
    catch (e: Any) { setActionErr(e?.response?.data?.error || 'Could not save.'); }
    finally { setBusy(null); }
  }, [load]);

  const onSummary = (v: string) => {
    setSummary(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length > SUMMARY_MAX) return;
    timer.current = setTimeout(() => save({ summary: v }), 700);
  };

  const rewrite = async () => {
    setActionErr(null); setBusy('rewrite');
    try { const { data: r } = await api.post('/cv/summary/rewrite'); setSummary(r.summary || ''); await load(); }
    catch (e: Any) { setActionErr(e?.response?.data?.error || 'Could not rewrite.'); }
    finally { setBusy(null); }
  };

  const onShare = async () => {
    tapLight();
    setBusy('share');
    try {
      const enabled = !data.share.enabled;
      const { data: r } = await api.post('/cv/share', { enabled });
      await load();
      if (r.enabled && r.token) {
        const url = `${WEB_URL}/cv/s/${r.token}`;
        await Share.share({ message: url, url });
      }
    } catch (e: Any) { setActionErr(e?.response?.data?.error || 'Could not change the share link.'); }
    finally { setBusy(null); }
  };

  // The PDF is the ONLY surface that carries contact details, so it is fetched
  // with audience=pdf rather than reusing the masked preview document.
  const download = async () => {
    tapLight();
    setBusy('pdf');
    try {
      const { data: d } = await api.get('/cv/document', { params: { audience: 'pdf' } });
      const html = cvSheetHtml(d.document, { forPrint: true });
      if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const name = `${String(d.document.header.name).replace(/\s+/g, '-')}-CV.pdf`;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: name, UTI: 'com.adobe.pdf' });
      notifySuccess();
      } else {
        Alert.alert('PDF ready', uri);
      }
    } catch (e: Any) { setActionErr(e?.response?.data?.error || 'Could not build the PDF.'); }
    finally { setBusy(null); }
  };

  const goFix = (to: string) => {
    if (to.startsWith('#')) { setTab('edit'); return; }
    router.push(to.split('#')[0] as never);
  };

  if (err && !data) return <View style={styles.center}><Text style={styles.err}>{err}</Text></View>;
  if (isPending && !data) return <CvSkeleton />;

  const doc = data.document;
  const toFix = (data.issues || []).filter((i: Any) => i.level !== 'green');
  const accentLabel = ACCENTS.find((a) => a[0] === doc.accent)?.[1] || 'Navy';

  const checkPanel = (
    <View style={[styles.check, toFix.length === 0 && styles.checkClean]}>
      <View style={styles.checkHead}>
        <Ionicons name={toFix.length ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={16} color={toFix.length ? DOT.amber : DOT.green} />
        <Text style={styles.checkTitle}>
          {toFix.length ? `Before you send · ${toFix.length} ${toFix.length === 1 ? 'thing' : 'things'} to fix` : 'Before you send · nothing to fix'}
        </Text>
      </View>
      {(data.issues || []).map((i: Any, n: number) => (
        <View key={n} style={styles.ci}>
          <View style={[styles.dot, { backgroundColor: DOT[i.level] }]} />
          <Text style={styles.ciText}>{i.text}</Text>
          {i.fixTo ? <Pressable onPress={() => goFix(i.fixTo)} hitSlop={8}><Text style={styles.ciFix}>{i.fixLabel}</Text></Pressable> : null}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.safe}>
      <View style={styles.headRow}>
        <Text style={styles.h1}>CV Builder</Text>
        <View style={styles.headActions}>
          <Pressable onPress={onShare} disabled={busy === 'share'} accessibilityLabel={data.share.enabled ? 'Sharing on' : 'Share CV'}
            style={[styles.iconBtn, data.share.enabled && styles.iconBtnOn]} hitSlop={6}>
            <Ionicons name="share-outline" size={18} color={data.share.enabled ? '#fff' : pilot.navy} />
          </Pressable>
          <Pressable onPress={download} disabled={busy === 'pdf'} accessibilityLabel="Download PDF"
            style={[styles.iconBtn, styles.iconBtnPrimary]} hitSlop={6}>
            {busy === 'pdf'
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="download-outline" size={18} color="#fff" />}
          </Pressable>
        </View>
      </View>

      <View style={styles.tabsWrap}>
        <Segmented
          value={tab}
          onChange={(t) => setTab(t as 'preview' | 'edit')}
          options={[{ value: 'preview', label: 'Preview' }, { value: 'edit', label: 'Edit' }]}
        />
      </View>

      {tab === 'preview' ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: clearance }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
        >
          <View style={styles.pad}>{checkPanel}</View>
          <View style={[styles.sheetBox, sheetW ? { height: Math.round(sheetW * (1123 / 794)) } : null]}
            onLayout={(e) => setSheetW(Math.round(e.nativeEvent.layout.width))}>
            {sheetW ? <SheetView html={cvSheetHtml(doc, { fitWidth: sheetW })} /> : null}
          </View>
          <Text style={styles.zoom}>{doc.template === 'modern' ? 'Modern' : 'Classic'} · {accentLabel} · A4 · 1 page</Text>
          <View style={styles.pad}>
            <Pressable onPress={download} disabled={busy === 'pdf'} style={[styles.btn, styles.btnPrimary, styles.btnWide]}>
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>{busy === 'pdf' ? 'Building…' : 'Download PDF'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.pad, { paddingBottom: clearance }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pilot.navy} />}
        >
          {checkPanel}

          <Text style={styles.secTitle}>Summary</Text>
          <TextInput style={styles.textarea} multiline value={summary} onChangeText={onSummary}
            placeholder="A short paragraph for recruiters. The only text not taken from your profile."
            placeholderTextColor={pilot.faint} />
          {actionErr ? <Text style={styles.errLine}>{actionErr}</Text> : null}
          <View style={styles.metaRow}>
            <Pressable onPress={rewrite} disabled={busy === 'rewrite'} hitSlop={6}>
              <Text style={styles.link}>{busy === 'rewrite' ? 'Rewriting…' : 'Rewrite from my profile'}</Text>
            </Pressable>
            <Text style={[styles.count, summary.length > SUMMARY_MAX && styles.countOver]}>{summary.length} / {SUMMARY_MAX}</Text>
          </View>

          <Text style={styles.secTitle}>Template</Text>
          <View style={styles.tplRow}>
            {(['classic', 'modern'] as const).map((t) => (
              <Pressable key={t} onPress={() => save({ template: t })} style={[styles.tpl, doc.template === t && styles.tplOn]}>
                <Text style={[styles.tplText, doc.template === t && styles.tplTextOn]}>{t === 'classic' ? 'Classic' : 'Modern'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.accents}>
            {ACCENTS.map(([key, label, hex]) => (
              <Pressable key={key} accessibilityLabel={label} onPress={() => save({ accent: key })}
                style={[styles.acc, { backgroundColor: hex }, doc.accent === key && styles.accOn]} />
            ))}
          </View>

          <Text style={styles.secTitle}>Sections</Text>
          {doc.order.map((o: Any, idx: number) => (
            <View key={o.key} style={styles.row}>
              <Pressable disabled={idx === 0} onPress={() => {
                const next = [...doc.order]; const [m] = next.splice(idx, 1); next.splice(idx - 1, 0, m); save({ sections: next });
              }} hitSlop={6} style={styles.move}>
                <Ionicons name="chevron-up" size={16} color={idx === 0 ? pilot.line : pilot.muted} />
              </Pressable>
              <Pressable disabled={idx === doc.order.length - 1} onPress={() => {
                const next = [...doc.order]; const [m] = next.splice(idx, 1); next.splice(idx + 1, 0, m); save({ sections: next });
              }} hitSlop={6} style={styles.move}>
                <Ionicons name="chevron-down" size={16} color={idx === doc.order.length - 1 ? pilot.line : pilot.muted} />
              </Pressable>
              <Text style={[styles.rowName, !o.visible && styles.rowOff]}>{SECTION_LABEL[o.key]}</Text>
              <Pressable accessibilityLabel={`${o.visible ? 'Hide' : 'Show'} ${SECTION_LABEL[o.key]}`}
                onPress={() => save({ sections: doc.order.map((x: Any) => (x.key === o.key ? { ...x, visible: !x.visible } : x)) })}
                style={[styles.tg, !o.visible && styles.tgOff]}>
                <View style={[styles.knob, !o.visible && styles.knobOff]} />
              </Pressable>
            </View>
          ))}
          <Text style={styles.foot}>
            Use the arrows to reorder. To change what a section says,{' '}
            <Text style={styles.link} onPress={() => router.push('/profile')}>edit it in Profile</Text>.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  loading: { color: pilot.muted, fontFamily: fontFamilies.body },
  err: { color: pilot.ink, fontFamily: fontFamilies.body, textAlign: 'center' },
  pad: { paddingHorizontal: spacing.xl, paddingTop: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, backgroundColor: pilot.cream },
  h1: { flex: 1, fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink },
  headActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface },
  iconBtnOn: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  iconBtnPrimary: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  btnWide: { width: '100%', marginTop: spacing.md },
  tabsWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: pilot.cream },
  tabs: { flexDirection: 'row', backgroundColor: pilot.surface, borderBottomWidth: 1, borderBottomColor: pilot.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: pilot.navy },
  tabText: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted },
  tabTextOn: { color: pilot.navy },

  check: { backgroundColor: '#FFF8EC', borderWidth: 1, borderColor: '#F3DDB5', borderRadius: 10, padding: 12 },
  checkClean: { backgroundColor: '#F0FAF3', borderColor: '#BBE5C9' },
  checkHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  checkTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13.5, color: pilot.ink, flex: 1 },
  ci: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F3E6CC' },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  ciText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: pilot.ink, fontFamily: fontFamilies.body },
  ciFix: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: 12.5 },

  secTitle: { fontSize: 11.5, letterSpacing: 0.9, textTransform: 'uppercase', color: pilot.faint, fontFamily: fontFamilies.bodyBold, marginTop: 22, marginBottom: 10 },
  textarea: { minHeight: 152, borderWidth: 1, borderColor: pilot.line, borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 20, color: pilot.ink, backgroundColor: pilot.surface, fontFamily: fontFamilies.body, textAlignVertical: 'top' },
  errLine: { color: '#B42318', fontSize: 12.5, lineHeight: 18, fontFamily: fontFamilies.body, marginTop: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  link: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: 12.5 },
  count: { color: pilot.faint, fontSize: 11.5, fontFamily: fontFamilies.body },
  countOver: { color: '#B42318', fontFamily: fontFamilies.bodyBold },

  tplRow: { flexDirection: 'row', gap: 10 },
  tpl: { flex: 1, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, paddingVertical: 14, alignItems: 'center', backgroundColor: pilot.surface },
  tplOn: { borderColor: pilot.navy, backgroundColor: 'rgba(0,63,136,0.06)' },
  tplText: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13, color: pilot.muted },
  tplTextOn: { color: pilot.navy },
  accents: { flexDirection: 'row', gap: 12, marginTop: 14 },
  acc: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#fff' },
  accOn: { borderColor: pilot.ink },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: pilot.line },
  move: { padding: 2 },
  rowName: { flex: 1, fontSize: 13.5, color: pilot.ink, fontFamily: fontFamilies.body },
  rowOff: { color: pilot.faint },
  tg: { width: 32, height: 18, borderRadius: 10, backgroundColor: pilot.navy, justifyContent: 'center' },
  tgOff: { backgroundColor: '#CBD3DD' },
  knob: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', marginLeft: 16 },
  knobOff: { marginLeft: 2 },
  foot: { fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 10, lineHeight: 18 },

  sheetBox: { height: 520, borderWidth: 1, borderColor: pilot.line, marginHorizontal: spacing.xl, marginTop: 14, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff' },
  zoom: { textAlign: 'center', fontSize: 12.5, color: pilot.faint, fontFamily: fontFamilies.body, marginTop: 10 },

  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 9, borderWidth: 1 },
  btnGhost: { borderColor: pilot.line, backgroundColor: pilot.surface },
  btnGhostText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },
  btnPrimary: { borderColor: pilot.navy, backgroundColor: pilot.navy },
  btnPrimaryText: { color: '#fff', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },
});

// A render error here shows "Something went wrong · Try again" instead of
// taking the whole app down with it.
export default withErrorBoundary(CvBuilderScreen, 'CV');
