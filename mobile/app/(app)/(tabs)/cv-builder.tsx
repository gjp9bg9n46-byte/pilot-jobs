// CV Builder — mirrors frontend/src/pages/CVBuilder.jsx.
//
// SCOPE (Track B-3a — Edit tab): template picker + colour theme + all editor
// sections + photo + debounced autosave. The Preview tab is a checkpoint stub:
// the web renders the CV + PDF entirely client-side with @react-pdf/renderer
// (TemplateApproach/TemplateFinal are react-pdf components; there is NO backend
// PDF endpoint), and react-pdf cannot run in React Native. B-3b renders the two
// templates as HTML and produces the PDF natively via expo-print + expo-sharing.
//
// Endpoints:  GET /cv  → { pilot, certificates, ratings, medicals, training, rtw,
//   totals, recency, aircraftTypes, cv:{ education, languages, skills, other,
//   accentColor, summary, photoUrl, … } }.  PUT /cv upserts the editable fields.
//   POST /cv/photo (multipart) · DELETE /cv/photo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../../src/lib/api';
import { TextField } from '../../../src/components/ui';
import { renderCv } from '../../../src/cv';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

// Accent presets — ported from frontend/src/components/cv/accentPalette.js.
const ACCENT_PALETTE = [
  { name: 'Navy', hex: '#0D1E35' }, { name: 'Charcoal', hex: '#2c2c2c' },
  { name: 'Burgundy', hex: '#722f37' }, { name: 'Forest', hex: '#1f3d2b' },
  { name: 'Slate Blue', hex: '#3a5068' }, { name: 'Midnight', hex: '#1C2451' },
  { name: 'Teal', hex: '#0A3D40' }, { name: 'Bronze', hex: '#4A3200' },
  { name: 'Plum', hex: '#3A1F38' }, { name: 'Indigo', hex: '#2D1B69' },
];
const DEFAULT_ACCENT = '#0D1E35';

const TEMPLATES = [
  { id: 'approach', label: 'Approach', desc: 'Two-column · navy sidebar · traditional' },
  { id: 'final', label: 'Final', desc: 'Full-width header · modern blocks' },
];

const fmt = (n?: number) => (n ? Math.round(n).toLocaleString() : '0');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—');

// ─── Native template mini-thumbnails (decorative — mirror web's ThumbApproach/Final) ─
function ThumbApproach() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.thumb, { flexDirection: 'row' }]}>
      <View style={{ width: '34%', backgroundColor: '#0D1E35', padding: 5, alignItems: 'center' }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#1B2B4B', borderWidth: 1, borderColor: '#00B4D8', marginBottom: 4 }} />
        <View style={{ height: 2, backgroundColor: '#fff', borderRadius: 1, width: '80%', marginBottom: 2 }} />
        <View style={{ height: 2, backgroundColor: '#00B4D8', borderRadius: 1, width: '55%', marginBottom: 6 }} />
        {[1, 2, 3].map((i) => <View key={i} style={{ height: 4, backgroundColor: '#1B2B4B', borderRadius: 1, marginBottom: 2, width: '90%' }} />)}
      </View>
      <View style={{ flex: 1, backgroundColor: '#fff', padding: 5 }}>
        <View style={{ flexDirection: 'row', gap: 2, marginBottom: 5, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map((i) => <View key={i} style={{ height: 9, width: 16, backgroundColor: '#E0F4FA', borderRadius: 2 }} />)}
        </View>
        <View style={{ height: 1.5, backgroundColor: '#00B4D8', marginBottom: 4, width: '80%' }} />
        {[1, 2, 3].map((i) => <View key={i} style={{ height: 4, backgroundColor: '#F0F4F8', borderRadius: 1, marginBottom: 3 }} />)}
      </View>
    </View>
  );
}
function ThumbFinal() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.thumb, { backgroundColor: '#fff' }]}>
      <View style={{ backgroundColor: '#0D1E35', padding: 7 }}>
        <View style={{ height: 1.5, backgroundColor: '#00B4D8', borderRadius: 1, marginBottom: 4 }} />
        <View style={{ height: 4, backgroundColor: '#fff', borderRadius: 1, width: '55%', marginBottom: 3 }} />
        <View style={{ height: 2, backgroundColor: '#00B4D8', borderRadius: 1, width: '35%' }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 4, padding: 5, backgroundColor: '#F4F8FB' }}>
        {[1, 2, 3, 4].map((i) => <View key={i} style={{ flex: 1, height: 11, backgroundColor: '#F0F4F8', borderRadius: 2 }} />)}
      </View>
      <View style={{ flex: 1, padding: 6 }}>
        {[1, 2, 3].map((i) => <View key={i} style={{ height: 4, backgroundColor: '#F0F4F8', borderRadius: 1, marginBottom: 3 }} />)}
      </View>
    </View>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Accordion({ title, badge, defaultOpen = false, warning = false, children }: {
  title: string; badge?: string | number | null; defaultOpen?: boolean; warning?: boolean; children: React.ReactNode;
}) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.acc}>
      <Pressable style={styles.accHead} onPress={() => setOpen((v) => !v)}>
        <Ionicons name={warning ? 'alert-circle' : 'checkmark-circle'} size={16} color={warning ? '#92400E' : '#166534'} />
        <Text style={styles.accTitle}>{title}</Text>
        {badge != null ? <View style={styles.accBadge}><Text style={styles.accBadgeText}>{badge}</Text></View> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={pilot.muted} />
      </Pressable>
      {open ? <View style={styles.accBody}>{children}</View> : null}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const styles = useThemedStyles(createStyles);
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ReadItem({ title, sub }: { title: string; sub?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.readItem}>
      <Text style={styles.readTitle}>{title}</Text>
      {sub ? <Text style={styles.readSub}>{sub}</Text> : null}
    </View>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable style={styles.addBtn} onPress={onPress}><Ionicons name="add" size={16} color={pilot.navy} /><Text style={styles.addBtnText}>{label}</Text></Pressable>
  );
}

export default function CVBuilder() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(true);
  const [serverData, setServerData] = useState<Any | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  const [education, setEducation] = useState<Any[]>([]);
  const [languages, setLanguages] = useState<Any[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [other, setOther] = useState<Any[]>([]);
  const [summary, setSummary] = useState('');
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [template, setTemplate] = useState('approach'); // local only (web doesn't persist it)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  // Live CV bundle for the templates: server profile+logbook data with the cv
  // block overridden by the current (unsaved) edit state + selected accent.
  const pdfData = useMemo(() => (serverData ? {
    ...serverData,
    cv: { ...serverData.cv, education, languages, skills, other, summary, accentColor, photoUrl },
  } : null), [serverData, education, languages, skills, other, summary, accentColor, photoUrl]);

  // Rebuild the HTML only when data/template/accent change (useMemo) so the
  // WebView isn't re-sourced on unrelated re-renders.
  const html = useMemo(() => (pdfData ? renderCv(template, pdfData, accentColor) : ''), [pdfData, template, accentColor]);

  const exportPdf = async () => {
    if (!html) return;
    setExporting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (!(await Sharing.isAvailableAsync())) { showToast('Sharing is not available on this device.'); return; }
      await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Your CockpitHire CV' });
    } catch {
      showToast('Could not generate the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    api.get('/cv')
      .then(({ data }) => {
        setServerData(data);
        setEducation(data.cv?.education ?? []);
        setLanguages(data.cv?.languages ?? []);
        setSkills(data.cv?.skills ?? []);
        setOther(data.cv?.other ?? []);
        setSummary(data.cv?.summary ?? '');
        setAccentColor(data.cv?.accentColor ?? DEFAULT_ACCENT);
        setPhotoUrl(data.cv?.photoUrl ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // On focus, silently refresh only the server-derived data (profile, licences,
  // ratings, logbook totals) that feeds the CV preview — NOT the editable fields,
  // which would clobber in-progress edits awaiting the debounced autosave.
  useFocusEffect(useCallback(() => {
    api.get('/cv').then(({ data }) => setServerData(data)).catch(() => {});
  }, []));

  // Debounced autosave (1.5s) — mirrors web. Takes the next-state values directly
  // so it never saves a stale closure.
  const scheduleSave = useCallback((next: { education: Any[]; languages: Any[]; skills: string[]; other: Any[]; accentColor: string; summary: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(() => {
      api.put('/cv', next).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'));
    }, 1500);
  }, []);

  const commit = (patch: Partial<{ education: Any[]; languages: Any[]; skills: string[]; other: Any[]; accentColor: string; summary: string }>) => {
    const next = { education, languages, skills, other, accentColor, summary, ...patch };
    if (patch.education) setEducation(patch.education);
    if (patch.languages) setLanguages(patch.languages);
    if (patch.skills) setSkills(patch.skills);
    if (patch.other) setOther(patch.other);
    if (patch.accentColor) setAccentColor(patch.accentColor);
    if (patch.summary !== undefined) setSummary(patch.summary);
    scheduleSave(next);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets?.[0]) return;
    setPhotoBusy(true);
    try {
      const asset = res.assets[0];
      const fd = new FormData();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fd.append('photo', { uri: asset.uri, name: 'headshot.jpg', type: 'image/jpeg' } as any);
      const { data } = await api.post('/cv/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPhotoUrl(data.photoUrl);
    } catch { /* ignore */ } finally { setPhotoBusy(false); }
  };
  const removePhoto = async () => { setPhotoBusy(true); try { await api.delete('/cv/photo'); setPhotoUrl(null); } catch { /* ignore */ } finally { setPhotoBusy(false); } };

  if (loading) {
    return <SafeAreaView style={styles.safe} edges={[]}><View style={styles.center}><ActivityIndicator color={pilot.navy} /><Text style={styles.dim}>Loading your CV data…</Text></View></SafeAreaView>;
  }
  if (!serverData) {
    return <SafeAreaView style={styles.safe} edges={[]}><View style={styles.center}><Text style={styles.dim}>Could not load CV data. Pull to refresh.</Text></View></SafeAreaView>;
  }

  const { pilot: p, certificates, ratings, medicals, rtw, totals, recency } = serverData;
  const licences = (certificates ?? []).filter((c: Any) => c.type !== 'ELP');
  const tmplName = template === 'approach' ? 'Approach Template' : 'Final Template';

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.headArea}>
        <Text style={styles.h1}>CV Builder</Text>
        <Text style={styles.subtitle}>Build and download a professional pilot CV from your profile and logbook data.</Text>
        <View style={styles.tabBar}>
          {(['edit', 'preview'] as const).map((t) => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'edit' ? 'Edit' : 'Preview'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* PREVIEW — the same HTML the PDF is built from, in a paper-shadow WebView.
          Kept mounted (display toggled) so switching tabs never re-renders it. */}
      <View style={[styles.flex1, tab !== 'preview' && styles.hidden]}>
        <View style={styles.paper}>
          {html ? <WebView originWhitelist={['*']} source={{ html }} style={styles.webview} showsVerticalScrollIndicator /> : null}
        </View>
        <View style={styles.previewBtns}>
          <Pressable style={[styles.dlPrimary, exporting && styles.btnDim]} onPress={exportPdf} disabled={exporting}>
            {exporting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="download-outline" size={16} color="#fff" /><Text style={styles.dlPrimaryText}>Download PDF</Text></>}
          </Pressable>
          <Pressable style={[styles.dlSecondary, exporting && styles.btnDim]} onPress={exportPdf} disabled={exporting}>
            <Ionicons name="share-outline" size={16} color={pilot.navy} /><Text style={styles.dlSecondaryText}>Share</Text>
          </Pressable>
        </View>
      </View>

      {/* EDIT — kept mounted (display toggled). */}
      <ScrollView style={[styles.flex1, tab !== 'edit' && styles.hidden]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Template picker */}
            <Text style={styles.sectionCaps}>Choose a template</Text>
            <View style={styles.tmplGrid}>
              {TEMPLATES.map((t) => {
                const active = template === t.id;
                return (
                  <Pressable key={t.id} style={[styles.tmplCard, active && styles.tmplCardActive]} onPress={() => setTemplate(t.id)}>
                    {t.id === 'approach' ? <ThumbApproach /> : <ThumbFinal />}
                    <Text style={styles.tmplLabel}>{t.label}</Text>
                    <Text style={styles.tmplDesc}>{t.desc}</Text>
                    {active ? <View style={styles.tmplCheck}><Ionicons name="checkmark-circle" size={13} color={pilot.navy} /><Text style={styles.tmplCheckText}>Selected</Text></View> : null}
                  </Pressable>
                );
              })}
            </View>

            {/* Colour theme */}
            <Text style={styles.sectionCaps}>Colour Theme</Text>
            <View style={styles.swatchRow}>
              {ACCENT_PALETTE.map(({ name, hex }) => {
                const active = accentColor === hex;
                return (
                  <View key={hex} style={styles.swatchWrap}>
                    <Pressable onPress={() => commit({ accentColor: hex })} accessibilityLabel={name} style={[styles.swatch, { backgroundColor: hex }, active && styles.swatchActive]} />
                    <Text style={styles.swatchLabel}>{name}</Text>
                  </View>
                );
              })}
            </View>

            {/* Download bar (name + stats + save status) */}
            <View style={styles.dlBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dlTitle}>{tmplName}</Text>
                <Text style={styles.dim}>
                  {totals?.totalTime ? `${fmt(totals.totalTime)}h total · ` : ''}{totals?.picTime ? `${fmt(totals.picTime)}h PIC · ` : ''}{ratings?.length ? `${ratings.length} type rating${ratings.length !== 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              {saveStatus ? <Text style={[styles.saveStatus, saveStatus === 'saved' && { color: '#166534' }, saveStatus === 'error' && { color: '#991B1B' }]}>{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}</Text> : null}
            </View>

            {/* Professional Profile */}
            <Accordion title="Professional Profile" defaultOpen>
              <TextInput
                style={styles.textarea}
                multiline
                value={summary}
                onChangeText={(v) => commit({ summary: v })}
                placeholder="Airline transport pilot with 2,400+ hours across A320 and B737 fleets. EU and UK work authorisation. Seeking a long-haul First Officer position."
                placeholderTextColor="#9AA0A6"
                maxLength={800}
              />
              <View style={styles.charRow}>
                <Text style={styles.hint}>Appears at the top of your CV. Keep it concise.</Text>
                <Text style={[styles.hint, summary.length > 800 && { color: '#92400E' }]}>{summary.length} / 800</Text>
              </View>
            </Accordion>

            {/* Photo */}
            <Accordion title="Photo / Headshot" defaultOpen={!photoUrl}>
              <View style={styles.photoRow}>
                <View style={[styles.photoCircle, photoUrl ? styles.photoCircleSet : styles.photoCircleEmpty]}>
                  {photoBusy ? <ActivityIndicator color={pilot.navy} /> : photoUrl ? <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} /> : <Ionicons name="cloud-upload-outline" size={24} color="rgba(0,63,136,0.5)" />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.readTitle}>{photoUrl ? 'Photo uploaded' : 'Add a headshot'}</Text>
                  <Text style={styles.dim}>Optional. Appears as a circular photo on your CV. JPEG/PNG · max 5 MB.</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <AddButton label={photoUrl ? 'Replace' : 'Choose photo'} onPress={pickPhoto} />
                    {photoUrl ? <Pressable style={styles.removeBtn} onPress={removePhoto}><Ionicons name="trash-outline" size={13} color="#991B1B" /><Text style={styles.removeText}>Remove</Text></Pressable> : null}
                  </View>
                </View>
              </View>
            </Accordion>

            {/* Personal Information (read-only) */}
            <Accordion title="Personal Information" defaultOpen>
              <InfoRow label="Name" value={`${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim()} />
              <InfoRow label="Email" value={p?.email} />
              <InfoRow label="Phone" value={p?.phone} />
              <InfoRow label="Nationality" value={p?.nationality} />
              <InfoRow label="City" value={[p?.city, p?.country].filter(Boolean).join(', ') || null} />
              <Text style={styles.footNote}>Edit personal details on your Profile page (not overridable here).</Text>
            </Accordion>

            {/* Logbook Summary (read-only) */}
            <Accordion title="Logbook Summary" badge={totals?.totalTime ? `${fmt(totals.totalTime)}h` : null}>
              <View style={styles.totalsGrid}>
                {[['Total', totals?.totalTime], ['PIC', totals?.picTime], ['SIC', totals?.sicTime], ['Night', totals?.nightTime], ['IFR', totals?.instrumentTime], ['Multi', totals?.multiEngineTime], ['Turbine', totals?.turbineTime]].map(([label, val]) => (
                  <View key={label as string} style={styles.totalCell}>
                    <Text style={styles.totalVal}>{fmt(val as number)}h</Text>
                    <Text style={styles.totalLabel}>{label as string}</Text>
                  </View>
                ))}
              </View>
              {recency?.hours90d > 0 ? <Text style={styles.footNote}>{fmt(recency.hours90d)}h in the last 90 days · aggregated from your Logbook.</Text> : null}
            </Accordion>

            {/* Read-only profile sections */}
            <Accordion title="Licences (Profile)" badge={licences.length || null}>
              {licences.length ? licences.map((c: Any, i: number) => <ReadItem key={i} title={`${c.type} — ${c.issuingAuthority}`} sub={c.expiryDate ? `Expires ${fmtDate(c.expiryDate)}` : 'No expiry'} />) : <Text style={styles.dim}>No licences added yet.</Text>}
            </Accordion>
            <Accordion title="Type Ratings (Profile)" badge={ratings?.length || null}>
              {ratings?.length ? ratings.map((r: Any, i: number) => <ReadItem key={i} title={`${r.aircraftType} — ${r.issuingAuthority}`} sub={r.hoursOnType ? `${fmt(r.hoursOnType)}h on type` : undefined} />) : <Text style={styles.dim}>No type ratings added yet.</Text>}
            </Accordion>
            <Accordion title="Medical (Profile)" badge={medicals?.length || null}>
              {medicals?.length ? medicals.map((m: Any, i: number) => <ReadItem key={i} title={`${String(m.medicalClass).replace('_', ' ')} — ${m.issuingAuthority}`} sub={`Valid to ${fmtDate(m.expiryDate)}`} />) : <Text style={styles.dim}>No medical records added yet.</Text>}
            </Accordion>
            <Accordion title="Right to Work (Profile)" badge={rtw?.length || null}>
              {rtw?.length ? rtw.map((r: Any, i: number) => <ReadItem key={i} title={r.country} sub={r.documentType} />) : <Text style={styles.dim}>No right-to-work documents added yet.</Text>}
            </Accordion>

            {/* Editable: Education */}
            <Accordion title="Education" badge={education.length || null} defaultOpen={education.length === 0} warning={education.length === 0}>
              {education.map((e, i) => (
                <View key={i} style={styles.editItem}>
                  <TextField label="Degree / Qualification" value={e.degree} onChangeText={(v) => commit({ education: education.map((x, j) => (j === i ? { ...x, degree: v } : x)) })} placeholder="e.g. BSc Aeronautical Engineering" />
                  <TextField label="Institution" value={e.institution} onChangeText={(v) => commit({ education: education.map((x, j) => (j === i ? { ...x, institution: v } : x)) })} placeholder="e.g. Embry-Riddle University" />
                  <TextField label="Year" value={e.year} onChangeText={(v) => commit({ education: education.map((x, j) => (j === i ? { ...x, year: v } : x)) })} placeholder="e.g. 2018" />
                  <Pressable style={styles.delRow} onPress={() => commit({ education: education.filter((_, j) => j !== i) })}><Ionicons name="trash-outline" size={15} color="#991B1B" /><Text style={styles.delText}>Remove</Text></Pressable>
                </View>
              ))}
              <AddButton label="Add Education" onPress={() => commit({ education: [...education, { degree: '', institution: '', fieldOfStudy: '', year: '' }] })} />
            </Accordion>

            {/* Editable: Languages */}
            <Accordion title="Languages" badge={languages.length || null} defaultOpen={languages.length === 0} warning={languages.length === 0}>
              <Text style={styles.hint}>English ICAO level is pulled from your ELP certificate automatically. Add other languages here.</Text>
              {languages.map((l, i) => (
                <View key={i} style={styles.editItem}>
                  <TextField label="Language" value={l.language} onChangeText={(v) => commit({ languages: languages.map((x, j) => (j === i ? { ...x, language: v } : x)) })} placeholder="e.g. Arabic" />
                  <TextField label="Proficiency" value={l.level} onChangeText={(v) => commit({ languages: languages.map((x, j) => (j === i ? { ...x, level: v } : x)) })} placeholder="e.g. Native, B2, ICAO Level 6" />
                  <Pressable style={styles.delRow} onPress={() => commit({ languages: languages.filter((_, j) => j !== i) })}><Ionicons name="trash-outline" size={15} color="#991B1B" /><Text style={styles.delText}>Remove</Text></Pressable>
                </View>
              ))}
              <AddButton label="Add Language" onPress={() => commit({ languages: [...languages, { language: '', level: '' }] })} />
            </Accordion>

            {/* Editable: Skills */}
            <Accordion title="Skills" badge={skills.length || null} defaultOpen={skills.length === 0} warning={skills.length === 0}>
              <Text style={styles.hint}>Add relevant skills — e.g. CRM, RVSM, ETOPS, FMS, TCAS.</Text>
              <View style={styles.skillsWrap}>
                {skills.map((sk, i) => (
                  <View key={i} style={styles.skillTag}>
                    <Text style={styles.skillTagText}>{sk}</Text>
                    <Pressable onPress={() => commit({ skills: skills.filter((_, j) => j !== i) })}><Ionicons name="close" size={13} color={pilot.muted} /></Pressable>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <TextField label="" value={skillInput} onChangeText={setSkillInput} placeholder="Type a skill…" onSubmitEditing={() => { if (skillInput.trim()) { commit({ skills: [...skills, skillInput.trim()] }); setSkillInput(''); } }} returnKeyType="done" />
                </View>
                <Pressable style={[styles.addBtn, { marginTop: 0 }]} onPress={() => { if (skillInput.trim()) { commit({ skills: [...skills, skillInput.trim()] }); setSkillInput(''); } }}><Ionicons name="add" size={16} color={pilot.navy} /><Text style={styles.addBtnText}>Add</Text></Pressable>
              </View>
            </Accordion>

            {/* Editable: Custom Sections */}
            <Accordion title="Custom Sections" badge={other.length || null}>
              <Text style={styles.hint}>Add any other sections — e.g. Awards, Publications, Volunteer Work.</Text>
              {other.map((sec, i) => (
                <View key={i} style={styles.editItem}>
                  <TextField label="Section Title" value={sec.title} onChangeText={(v) => commit({ other: other.map((x, j) => (j === i ? { ...x, title: v } : x)) })} placeholder="e.g. Awards & Recognition" />
                  <TextInput style={styles.textarea} multiline value={sec.content ?? ''} onChangeText={(v) => commit({ other: other.map((x, j) => (j === i ? { ...x, content: v } : x)) })} placeholder="Describe this section…" placeholderTextColor="#9AA0A6" />
                  <Pressable style={styles.delRow} onPress={() => commit({ other: other.filter((_, j) => j !== i) })}><Ionicons name="trash-outline" size={15} color="#991B1B" /><Text style={styles.delText}>Remove</Text></Pressable>
                </View>
              ))}
              <AddButton label="Add Section" onPress={() => commit({ other: [...other, { title: '', content: '' }] })} />
            </Accordion>
      </ScrollView>

      {toast ? <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  flex1: { flex: 1 },
  hidden: { display: 'none' },
  headArea: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 4 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 8, paddingBottom: 116 /* clears floating tab bar */ },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 10 },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 20 },
  dim: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 20 },

  tabBar: { flexDirection: 'row', backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, padding: 3, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: 'rgba(0,63,136,0.06)' },
  tabText: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm, color: pilot.muted },
  tabTextActive: { color: pilot.navy },

  sectionCaps: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  tmplGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  tmplCard: { flex: 1, borderWidth: 2, borderColor: pilot.line, borderRadius: 12, backgroundColor: pilot.surface, paddingBottom: 12, overflow: 'hidden' },
  tmplCardActive: { borderColor: pilot.navy, backgroundColor: 'rgba(0,63,136,0.06)' },
  thumb: { height: 96, width: '100%', overflow: 'hidden', backgroundColor: '#0D1E35' },
  tmplLabel: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.sm, color: pilot.ink, paddingHorizontal: 12, marginTop: 10 },
  tmplDesc: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.body, paddingHorizontal: 12, marginTop: 2 },
  tmplCheck: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, marginTop: 6 },
  tmplCheckText: { fontSize: 11, color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },

  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  swatchWrap: { alignItems: 'center', gap: 4, width: 58 },
  swatch: { width: 44, height: 44, borderRadius: 22 },
  swatchActive: { borderWidth: 3, borderColor: pilot.navy },
  swatchLabel: { fontSize: 10, color: pilot.muted, fontFamily: fontFamilies.bodyMedium, textAlign: 'center' },

  dlBar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 16, marginBottom: 20 },
  dlTitle: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, color: pilot.ink, marginBottom: 2 },
  saveStatus: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.bodyMedium },

  acc: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  accHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  accTitle: { flex: 1, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, color: pilot.ink },
  accBadge: { backgroundColor: 'rgba(0,63,136,0.08)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  accBadgeText: { color: pilot.navy, fontSize: 12, fontFamily: fontFamilies.bodyBold },
  accBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },

  infoRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: pilot.line },
  infoLabel: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  infoValue: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.body },
  footNote: { fontSize: 12, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 8, lineHeight: 18 },

  readItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: pilot.line },
  readTitle: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  readSub: { fontSize: 12, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },

  totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  totalCell: { width: '30%', backgroundColor: pilot.cream, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  totalVal: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodyBold, color: pilot.navy },
  totalLabel: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },

  textarea: { minHeight: 100, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, padding: 12, fontSize: fontSizes.md, fontFamily: fontFamilies.body, color: pilot.ink, backgroundColor: pilot.surface, textAlignVertical: 'top' },
  charRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  hint: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.body, marginBottom: 8 },

  editItem: { backgroundColor: pilot.cream, borderRadius: 10, padding: 12, marginBottom: 8, gap: 6 },
  delRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 4 },
  delText: { color: '#991B1B', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyMedium },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,63,136,0.06)', borderWidth: 1, borderColor: 'rgba(0,63,136,0.3)', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, alignSelf: 'flex-start', marginTop: 4 },
  addBtnText: { color: pilot.navy, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },

  skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  skillTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line, borderRadius: 20, paddingLeft: 12, paddingRight: 8, paddingVertical: 5 },
  skillTagText: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.body },

  photoRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  photoCircle: { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoCircleSet: { borderWidth: 2, borderColor: pilot.navy },
  photoCircleEmpty: { borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(0,63,136,0.35)', backgroundColor: 'rgba(0,63,136,0.04)' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  removeText: { color: '#991B1B', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },

  paper: { flex: 1, margin: spacing.lg, borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden', shadowColor: '#0F1419', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  webview: { flex: 1, backgroundColor: '#fff' },
  previewBtns: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: 12, marginBottom: 92 /* clears floating tab bar */ },
  dlPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: pilot.navy, borderRadius: 6, paddingVertical: 13 },
  dlPrimaryText: { color: '#fff', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },
  dlSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: pilot.navy, borderRadius: 6, paddingVertical: 13 },
  dlSecondaryText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },
  btnDim: { opacity: 0.5 },
  toast: { position: 'absolute', bottom: 84, left: 24, right: 24, backgroundColor: '#0F1419', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  toastText: { color: '#fff', fontSize: fontSizes.sm, fontFamily: fontFamilies.body, textAlign: 'center' },
});
