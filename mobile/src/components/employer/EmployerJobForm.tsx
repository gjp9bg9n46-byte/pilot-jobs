// Employer post/edit job form — mirrors frontend/src/pages/employer/EmployerJobForm.jsx.
// b2b identity. new → POST /employers/jobs, edit → PUT /employers/jobs/:id.
// (Live "how pilots see it" preview is deferred to a later polish — the form + all
// fields/validation/payload match web.)
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { isAxiosError } from 'axios';
import api from '../../lib/api';
import { Checkbox, ErrorBanner, PrimaryButton, SelectField, TextField } from '../ui';
import AircraftCombobox from '../AircraftCombobox';
import { employer as emp, fontFamilies, fontSizes, spacing } from '../../theme/tokens';

const ROLES: [string, string][] = [['', '—'], ['CAPTAIN', 'Captain'], ['FIRST_OFFICER', 'First Officer'], ['INSTRUCTOR', 'Instructor']];
const CONTRACT_TYPES: [string, string][] = [['', '—'], ['PERMANENT', 'Permanent'], ['CONTRACT', 'Fixed-term / Contract'], ['FREELANCE', 'Freelance / Agency'], ['PART_TIME', 'Part-time']];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'SGD', 'CHF', 'JPY', 'INR', 'BRL', 'ZAR'];
const PERIODS: [string, string][] = [['', '—'], ['YEAR', 'Per year'], ['MONTH', 'Per month'], ['HOUR', 'Per hour']];
const AUTHORITIES = ['EASA', 'FAA', 'CAA', 'TCCA', 'CASA', 'JCAB', 'GCAA', 'ANAC', 'DGCA', 'CAAC', 'CAA_NZ', 'CAAS', 'DGAC', 'FATA', 'ICAO', 'Other'];
const CERTIFICATES = ['ATPL', 'CPL', 'MPL', 'PPL'];
const MEDICAL: [string, string][] = [['', '—'], ['CLASS_1', 'Class 1'], ['CLASS_2', 'Class 2'], ['CLASS_3', 'Class 3']];
const EDUCATION: [string, string][] = [['', '—'], ['high_school', 'High School'], ['technical', 'Technical'], ['bachelor', 'Bachelor'], ['masters', 'Masters'], ['doctorate', 'Doctorate']];
const WORKAUTH: [string, string][] = [['', '—'], ['EU', 'EU'], ['US', 'US'], ['UK', 'UK'], ['required', 'Required (any)'], ['Other', 'Other']];
const ENGLISH: [string, string][] = [['', '—'], ['4', 'ICAO Level 4'], ['5', 'ICAO Level 5'], ['6', 'ICAO Level 6']];
const HOUR_FIELDS: [string, string][] = [
  ['reqMinTotalHours', 'Total hours min'], ['reqMinPicHours', 'PIC hours min'],
  ['reqMinMultiEngineHours', 'Multi-engine hours min'], ['reqMinTurbineHours', 'Turbine hours min'],
  ['reqMinInstrumentHours', 'Instrument hours min'], ['reqMinCrossCountryHours', 'Cross-country hours min'],
];
const DESC_MAX = 10000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Form = Record<string, any>;
const EMPTY: Form = {
  title: '', role: '', location: '', country: '', contractType: '', description: '', applyUrl: '',
  salaryMin: '', salaryMax: '', salaryCurrency: 'USD', salaryPeriod: '',
  reqAuthorities: [], reqCertificates: [], reqAircraftTypes: [],
  reqMinTotalHours: '', reqMinPicHours: '', reqMinMultiEngineHours: '', reqMinTurbineHours: '',
  reqMinInstrumentHours: '', reqMinCrossCountryHours: '',
  reqMedicalClass: '', reqEducation: '', reqWorkAuthorization: '', reqEnglishLevel: '', reqWillingToRelocate: false,
};

export default function EmployerJobForm({ jobId }: { jobId?: string }) {
  const router = useRouter();
  const isEdit = !!jobId;
  const [form, setForm] = useState<Form>(EMPTY);
  const [aircraftInput, setAircraftInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingJob, setLoadingJob] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    api.get('/employers/jobs').then(({ data }) => {
      const job = data.find((j: Form) => j.id === jobId);
      if (!job) { router.replace({ pathname: '/employer/dashboard', params: { toast: 'Job not found.' } }); return; }
      setForm({
        ...EMPTY, ...job,
        role: job.role || '', contractType: job.contractType || '',
        salaryMin: job.salaryMin ?? '', salaryMax: job.salaryMax ?? '', salaryCurrency: job.salaryCurrency || 'USD', salaryPeriod: job.salaryPeriod || '',
        reqAuthorities: job.reqAuthorities || [], reqCertificates: job.reqCertificates || [], reqAircraftTypes: job.reqAircraftTypes || [],
        reqMinTotalHours: job.reqMinTotalHours ?? '', reqMinPicHours: job.reqMinPicHours ?? '',
        reqMinMultiEngineHours: job.reqMinMultiEngineHours ?? '', reqMinTurbineHours: job.reqMinTurbineHours ?? '',
        reqMinInstrumentHours: job.reqMinInstrumentHours ?? '', reqMinCrossCountryHours: job.reqMinCrossCountryHours ?? '',
        reqMedicalClass: job.reqMedicalClass || '', reqEducation: job.reqEducation || '',
        reqWorkAuthorization: job.reqWorkAuthorization || '', reqEnglishLevel: job.reqEnglishLevel ?? '',
        reqWillingToRelocate: !!job.reqWillingToRelocate,
      });
    }).catch(() => router.replace({ pathname: '/employer/dashboard', params: { toast: 'Could not load job.' } }))
      .finally(() => setLoadingJob(false));
  }, [jobId, isEdit, router]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const toggleArr = (k: string, v: string) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v] }));
  const addAircraft = () => { const v = aircraftInput.trim(); if (v && !form.reqAircraftTypes.includes(v)) set('reqAircraftTypes', [...form.reqAircraftTypes, v]); setAircraftInput(''); };

  const descLen = (form.description || '').length;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    else if (form.title.length > 200) e.title = 'Title must be 200 characters or fewer';
    if (!form.description.trim()) e.description = 'Description is required';
    else if (form.description.length > DESC_MAX) e.description = `Description must be ${DESC_MAX.toLocaleString()} characters or fewer`;
    if (!form.applyUrl.trim()) e.applyUrl = 'Apply URL is required';
    else { try { new URL(form.applyUrl.trim()); } catch { e.applyUrl = 'Enter a valid URL (including https://)'; } }
    const min = form.salaryMin === '' ? null : Number(form.salaryMin);
    const max = form.salaryMax === '' ? null : Number(form.salaryMax);
    if (min != null && max != null && max < min) e.salaryMax = 'Maximum salary must be ≥ minimum';
    return e;
  };

  const buildPayload = () => {
    const p: Form = { title: form.title.trim(), description: form.description.trim(), location: form.location.trim(), applyUrl: form.applyUrl.trim() };
    if (form.country.trim()) p.country = form.country.trim();
    if (form.role) p.role = form.role;
    if (form.contractType) p.contractType = form.contractType;
    if (form.salaryMin !== '') p.salaryMin = Number(form.salaryMin);
    if (form.salaryMax !== '') p.salaryMax = Number(form.salaryMax);
    if (form.salaryCurrency) p.salaryCurrency = form.salaryCurrency;
    if (form.salaryPeriod) p.salaryPeriod = form.salaryPeriod;
    if (form.reqAuthorities.length) p.reqAuthorities = form.reqAuthorities;
    if (form.reqCertificates.length) p.reqCertificates = form.reqCertificates;
    if (form.reqAircraftTypes.length) p.reqAircraftTypes = form.reqAircraftTypes;
    for (const [k] of HOUR_FIELDS) if (form[k] !== '') p[k] = Number(form[k]);
    if (form.reqMedicalClass) p.reqMedicalClass = form.reqMedicalClass;
    if (form.reqEducation) p.reqEducation = form.reqEducation;
    if (form.reqWorkAuthorization) p.reqWorkAuthorization = form.reqWorkAuthorization;
    if (form.reqEnglishLevel !== '') p.reqEnglishLevel = Number(form.reqEnglishLevel);
    p.reqWillingToRelocate = !!form.reqWillingToRelocate;
    return p;
  };

  const onSubmit = async () => {
    setBanner('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      if (isEdit) { await api.put(`/employers/jobs/${jobId}`, buildPayload()); router.replace({ pathname: '/employer/dashboard', params: { toast: 'Job updated!' } }); }
      else { await api.post('/employers/jobs', buildPayload()); router.replace({ pathname: '/employer/dashboard', params: { toast: 'Job posted!' } }); }
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 403) { router.replace('/employer/pending-approval'); return; }
      if (isAxiosError(err) && err.response?.status === 400 && Array.isArray(err.response?.data?.errors)) {
        const se: Record<string, string> = {}; for (const x of err.response.data.errors) if (x.path) se[x.path] = x.msg;
        setErrors(se); setBanner('Please correct the highlighted fields.');
      } else setBanner((isAxiosError(err) ? err.response?.data?.error : '') || 'Could not save the job. Please try again.');
      setLoading(false);
    }
  };

  if (loadingJob) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={emp.navy} /></View></SafeAreaView>;

  const Section = ({ children }: { children: string }) => <Text style={styles.section}>{children}</Text>;
  const Pills = ({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) => (
    <View style={styles.pills}>{options.map((o) => {
      const on = selected.includes(o);
      return <Pressable key={o} onPress={() => onToggle(o)} style={[styles.pill, on && styles.pillOn]}><Text style={[styles.pillText, on && styles.pillTextOn]}>{o}</Text></Pressable>;
    })}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← Dashboard</Text></Pressable>
        <Text style={styles.topTitle}>{isEdit ? 'Edit Job' : 'Post New Job'}</Text>
        <View style={{ width: 80 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ErrorBanner>{banner}</ErrorBanner>

          <Section>Basic info</Section>
          <Field><TextField label="Title *" placeholder="e.g. Captain — Citation CJ3" maxLength={200} value={form.title} onChangeText={(t) => set('title', t)} error={errors.title} /></Field>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Field><SelectField label="Role" value={form.role} options={ROLES} onSelect={(v) => set('role', v)} /></Field></View>
            <View style={{ flex: 1 }}><Field><SelectField label="Contract Type" value={form.contractType} options={CONTRACT_TYPES} onSelect={(v) => set('contractType', v)} /></Field></View>
          </View>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Field><TextField label="Location" placeholder="e.g. Lisbon, PT" value={form.location} onChangeText={(t) => set('location', t)} /></Field></View>
            <View style={{ flex: 1 }}><Field><TextField label="Country" placeholder="e.g. Portugal" value={form.country} onChangeText={(t) => set('country', t)} /></Field></View>
          </View>

          <Section>Description *</Section>
          <Field>
            <TextField label="" placeholder="Describe the role, requirements, schedule, and any details applicants need." multiline value={form.description} onChangeText={(t) => set('description', t)} maxLength={DESC_MAX} style={{ minHeight: 120, textAlignVertical: 'top' }} error={errors.description} />
            <Text style={styles.hint}>{descLen.toLocaleString()}/{DESC_MAX.toLocaleString()} · Plain text, not rich text.</Text>
          </Field>

          <Section>Apply URL *</Section>
          <Field>
            <TextField label="" placeholder="https://your-careers-page.com/apply" keyboardType="url" autoCapitalize="none" autoCorrect={false} value={form.applyUrl} onChangeText={(t) => set('applyUrl', t)} error={errors.applyUrl} />
            <Text style={styles.hint}>Where pilots will apply — the "Apply" button links here.</Text>
          </Field>

          <Section>Salary (optional)</Section>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Field><TextField label="Minimum" placeholder="—" keyboardType="number-pad" value={String(form.salaryMin)} onChangeText={(t) => set('salaryMin', t)} /></Field></View>
            <View style={{ flex: 1 }}><Field><TextField label="Maximum" placeholder="—" keyboardType="number-pad" value={String(form.salaryMax)} onChangeText={(t) => set('salaryMax', t)} error={errors.salaryMax} /></Field></View>
          </View>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Field><SelectField label="Currency" value={form.salaryCurrency} options={CURRENCIES.map((c) => [c, c] as [string, string])} onSelect={(v) => set('salaryCurrency', v)} /></Field></View>
            <View style={{ flex: 1 }}><Field><SelectField label="Period" value={form.salaryPeriod} options={PERIODS} onSelect={(v) => set('salaryPeriod', v)} /></Field></View>
          </View>

          <Section>Requirements (all optional)</Section>
          <Field><Text style={styles.label}>Authorities required</Text><Pills options={AUTHORITIES} selected={form.reqAuthorities} onToggle={(v) => toggleArr('reqAuthorities', v)} /></Field>
          <Field><Text style={styles.label}>Certificates required</Text><Pills options={CERTIFICATES} selected={form.reqCertificates} onToggle={(v) => toggleArr('reqCertificates', v)} /></Field>
          <Field>
            <Text style={styles.label}>Aircraft types</Text>
            <View style={styles.acRow}>
              <View style={{ flex: 1 }}><AircraftCombobox label="" value={aircraftInput} onChange={setAircraftInput} /></View>
              <Pressable style={styles.addBtn} onPress={addAircraft}><Text style={styles.addBtnText}>Add</Text></Pressable>
            </View>
            {form.reqAircraftTypes.length > 0 ? (
              <View style={styles.chips}>{form.reqAircraftTypes.map((a: string) => (
                <View key={a} style={styles.chip}><Text style={styles.chipText}>{a}</Text><Text style={styles.chipX} onPress={() => toggleArr('reqAircraftTypes', a)}> ×</Text></View>
              ))}</View>
            ) : null}
          </Field>
          {HOUR_FIELDS.map(([k, l]) => <Field key={k}><TextField label={l} placeholder="—" keyboardType="number-pad" value={String(form[k])} onChangeText={(t) => set(k, t)} /></Field>)}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Field><SelectField label="Medical class" value={form.reqMedicalClass} options={MEDICAL} onSelect={(v) => set('reqMedicalClass', v)} /></Field></View>
            <View style={{ flex: 1 }}><Field><SelectField label="Education" value={form.reqEducation} options={EDUCATION} onSelect={(v) => set('reqEducation', v)} /></Field></View>
          </View>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Field><SelectField label="Work authorization" value={form.reqWorkAuthorization} options={WORKAUTH} onSelect={(v) => set('reqWorkAuthorization', v)} /></Field></View>
            <View style={{ flex: 1 }}><Field><SelectField label="English level" value={String(form.reqEnglishLevel)} options={ENGLISH} onSelect={(v) => set('reqEnglishLevel', v)} /></Field></View>
          </View>
          <Field><Checkbox label="Willing to relocate required" value={!!form.reqWillingToRelocate} onChange={(v) => set('reqWillingToRelocate', v)} /></Field>

          <PrimaryButton label={loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Post Job'} loading={loading} onPress={onSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ children }: { children: React.ReactNode }) { return <View style={{ marginBottom: 16 }}>{children}</View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: emp.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: emp.line, backgroundColor: emp.surface },
  back: { color: emp.muted, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  topTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: emp.ink },
  content: { padding: spacing.xl, paddingBottom: 60 },
  section: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, color: emp.navy, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 12 },
  row2: { flexDirection: 'row', gap: 12 },
  label: { color: emp.muted, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm, marginBottom: 8 },
  hint: { color: emp.muted, fontSize: fontSizes.xs, fontFamily: fontFamilies.body, marginTop: 5 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: emp.line, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: emp.surface },
  pillOn: { borderColor: emp.navy, backgroundColor: 'rgba(0,63,136,0.08)' },
  pillText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: emp.muted },
  pillTextOn: { color: emp.navy },
  acRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  addBtn: { backgroundColor: emp.navy, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 12, marginTop: 0 },
  addBtnText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: emp.bg, borderWidth: 1, borderColor: emp.line, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { color: emp.ink, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  chipX: { color: emp.muted, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md },
});
