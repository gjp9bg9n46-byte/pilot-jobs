// Suggest an edit — airline factfile contribution. Mirrors
// frontend/src/pages/AirlineContribute.jsx 1:1. Pilot editorial-light.
// Prefills from the current factfile, submits ONLY changed fields as a flat
// `proposedChanges` diff → POST /airlines/:id/contributions (admin-moderated).
// Identity fields (name, IATA, ICAO, country, logo) are admin-only, so they are
// intentionally absent from the form. GET /:id/contributions/mine drives the
// "Your contributions" pending/approved/rejected banner at the top.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import api from '../../../../../src/lib/api';
import AircraftCombobox from '../../../../../src/components/AircraftCombobox';
import { PrimaryButton, SecondaryButton, SelectField, TextField } from '../../../../../src/components/ui';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../../src/theme/ThemeContext';

type Opt = [string, string];
const HIRING_STATUSES: Opt[] = [['ACTIVELY_HIRING', 'Actively Hiring'], ['OCCASIONAL', 'Occasional'], ['PAUSED', 'Paused'], ['UNKNOWN', 'Unknown']];
const HIRING_FREQUENCIES: Opt[] = [['CONTINUOUS', 'Continuous'], ['PERIODIC', 'Periodic'], ['RARE', 'Rare'], ['UNKNOWN', 'Unknown']];
const CONTRACT_TYPES: Opt[] = [['PERMANENT', 'Permanent'], ['FIXED_TERM', 'Fixed Term'], ['AGENCY', 'Agency'], ['PAY_TO_FLY', 'Pay-to-Fly'], ['MIXED', 'Mixed']];
const REGIONS: Opt[] = [['Europe', 'Europe'], ['Americas', 'Americas'], ['Asia-Pacific', 'Asia-Pacific'], ['Middle East', 'Middle East'], ['Africa', 'Africa']];

type FleetRow = { type: string; inService: string; ordered: string; retired: string };

// Seed the structured fleet editor: prefer fleetDetail; else lift flat fleet[].
const seedFleet = (a: any): FleetRow[] => {
  if (a?.fleetDetail?.length) {
    return a.fleetDetail.map((r: any) => ({
      type: r.type ?? '',
      inService: r.inService != null ? String(r.inService) : '',
      ordered: r.ordered != null ? String(r.ordered) : '',
      retired: r.retired != null ? String(r.retired) : '',
    }));
  }
  return (a?.fleet || []).map((type: string) => ({ type, inService: '', ordered: '', retired: '' }));
};

const arrToText = (arr?: string[]) => (arr || []).join('\n');
const textToArr = (s: string) => s.split('\n').map((v) => v.trim()).filter(Boolean);

function initForm(a: any): Record<string, any> {
  if (!a) return {};
  const pr = a.payRanges || {};
  return {
    headquarters: a.headquarters ?? '',
    description: a.description ?? '',
    fleetDetail: seedFleet(a),
    bases: arrToText(a.bases),
    hiringStatus: a.hiringStatus ?? '',
    hiringFrequency: a.hiringFrequency ?? '',
    contractType: a.contractType ?? '',
    rosterPattern: a.rosterPattern ?? '',
    workAuthRequired: arrToText(a.workAuthRequired),
    region: a.region ?? '',
    avgResponseDays: a.avgResponseDays != null ? String(a.avgResponseDays) : '',
    interviewStages: arrToText(a.interviewStages),
    simType: a.simType ?? '',
    upgradeTimeMinYears: a.upgradeTimeMinYears != null ? String(a.upgradeTimeMinYears) : '',
    upgradeTimeMaxYears: a.upgradeTimeMaxYears != null ? String(a.upgradeTimeMaxYears) : '',
    notes: a.notes ?? '',
    captainMin: pr.captain?.min != null ? String(pr.captain.min) : '',
    captainMax: pr.captain?.max != null ? String(pr.captain.max) : '',
    captainCurrency: pr.captain?.currency ?? '',
    captainPeriod: pr.captain?.period ?? '',
    foMin: pr.fo?.min != null ? String(pr.fo.min) : '',
    foMax: pr.fo?.max != null ? String(pr.fo.max) : '',
    foCurrency: pr.fo?.currency ?? '',
    foPeriod: pr.fo?.period ?? '',
  };
}

// Build the proposedChanges diff: only fields that changed from source airline.
function buildDiff(form: Record<string, any>, airline: any): Record<string, any> {
  const changes: Record<string, any> = {};

  const str = (key: string, airlineKey: string) => {
    const v = (form[key] ?? '').trim();
    const cur = airline[airlineKey] ?? null;
    const next = v === '' ? null : v;
    if (next !== cur) changes[airlineKey] = next;
  };
  const arr = (key: string, airlineKey: string) => {
    const next = textToArr(form[key] ?? '');
    const cur = airline[airlineKey] || [];
    if (JSON.stringify(next) !== JSON.stringify(cur)) changes[airlineKey] = next;
  };
  const num = (key: string, airlineKey: string, isInt: boolean) => {
    const v = (form[key] ?? '').trim();
    const cur = airline[airlineKey] ?? null;
    const next = v === '' ? null : (isInt ? parseInt(v, 10) : parseFloat(v));
    if (next !== cur) changes[airlineKey] = next;
  };
  const sel = (key: string, airlineKey: string) => {
    const v = form[key];
    const cur = airline[airlineKey] ?? null;
    const next = v === '' ? null : v;
    if (next !== cur) changes[airlineKey] = next;
  };

  str('headquarters', 'headquarters');
  str('description', 'description');
  str('rosterPattern', 'rosterPattern');
  str('simType', 'simType');
  str('notes', 'notes');
  arr('bases', 'bases');
  arr('workAuthRequired', 'workAuthRequired');
  arr('interviewStages', 'interviewStages');
  sel('hiringStatus', 'hiringStatus');
  sel('hiringFrequency', 'hiringFrequency');
  sel('contractType', 'contractType');
  sel('region', 'region');
  num('avgResponseDays', 'avgResponseDays', true);
  num('upgradeTimeMinYears', 'upgradeTimeMinYears', false);
  num('upgradeTimeMaxYears', 'upgradeTimeMaxYears', false);

  // Pay ranges: reconstruct object, compare to original.
  const hasPay = form.captainMin || form.captainMax || form.captainCurrency ||
    form.foMin || form.foMax || form.foCurrency;
  const origPay = airline.payRanges;

  const captain: Record<string, any> = {};
  if (form.captainMin) captain.min = parseFloat(form.captainMin);
  if (form.captainMax) captain.max = parseFloat(form.captainMax);
  if (form.captainCurrency) captain.currency = form.captainCurrency.trim().toUpperCase();
  if (form.captainPeriod) captain.period = form.captainPeriod.trim();

  const fo: Record<string, any> = {};
  if (form.foMin) fo.min = parseFloat(form.foMin);
  if (form.foMax) fo.max = parseFloat(form.foMax);
  if (form.foCurrency) fo.currency = form.foCurrency.trim().toUpperCase();
  if (form.foPeriod) fo.period = form.foPeriod.trim();

  const newPay = hasPay ? {
    captain: Object.keys(captain).length ? captain : undefined,
    fo: Object.keys(fo).length ? fo : undefined,
  } : null;
  if (JSON.stringify(newPay) !== JSON.stringify(origPay)) changes.payRanges = newPay;

  // Fleet — structured rows → full-replace fleetDetail (+ keep flat fleet in sync).
  const toNum = (s: any) => {
    const t = (s ?? '').toString().trim();
    if (t === '') return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  };
  const nextDetail = (form.fleetDetail || [])
    .map((r: FleetRow) => ({ type: (r.type || '').trim(), inService: toNum(r.inService), ordered: toNum(r.ordered), retired: toNum(r.retired) }))
    .filter((r: any) => r.type !== '');
  const curDetail = (airline.fleetDetail || []).map((r: any) => ({
    type: r.type, inService: r.inService ?? null, ordered: r.ordered ?? null, retired: r.retired ?? null,
  }));
  if (JSON.stringify(nextDetail) !== JSON.stringify(curDetail)) {
    changes.fleetDetail = nextDetail;
    const nextFlat = nextDetail.map((r: any) => r.type);
    const curFlat = airline.fleet || [];
    if (JSON.stringify(nextFlat) !== JSON.stringify(curFlat)) changes.fleet = nextFlat;
  }

  return changes;
}

// Client-side validation (mirrors backend rules).
function validateDiff(changes: Record<string, any>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, value] of Object.entries(changes)) {
    if (value === null) continue;
    if (['headquarters', 'description', 'rosterPattern', 'simType', 'notes'].includes(field)) {
      if (typeof value === 'string' && value.trim() === '') {
        errors[field] = 'Cannot be empty — leave unchanged or set to null to clear.';
      }
    }
    if (['avgResponseDays', 'upgradeTimeMinYears', 'upgradeTimeMaxYears'].includes(field)) {
      if (value !== null && !Number.isFinite(value)) errors[field] = 'Must be a valid number.';
    }
  }
  return errors;
}

const CONTRIB_FIELD_LABELS: Record<string, string> = {
  headquarters: 'Headquarters', description: 'Description', bases: 'Bases', fleet: 'Fleet',
  fleetDetail: 'Fleet', hiringStatus: 'Hiring Status', hiringFrequency: 'Hiring Frequency',
  payRanges: 'Pay Ranges', rosterPattern: 'Roster Pattern', contractType: 'Contract Type',
  workAuthRequired: 'Work Auth', avgResponseDays: 'Avg Response Days', interviewStages: 'Interview Stages',
  simType: 'Sim Type', upgradeTimeMinYears: 'Upgrade Min Years', upgradeTimeMaxYears: 'Upgrade Max Years',
  notes: 'Notes', region: 'Region',
};
const contribSummary = (proposed: Record<string, any>) => {
  const labels = [...new Set(Object.keys(proposed || {}).map((k) => CONTRIB_FIELD_LABELS[k] || k))];
  return labels.length ? labels.join(', ') : '—';
};
const CONTRIB_STATUS: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: '#FEF3C7', fg: '#92400E' },
  APPROVED: { bg: '#DCFCE7', fg: '#166534' },
  REJECTED: { bg: '#FEE2E2', fg: '#991B1B' },
};
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function AirlineContribute() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [airline, setAirline] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [myContribs, setMyContribs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fleetError, setFleetError] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dirtyRef = useRef(false);
  const successRef = useRef(false);

  useEffect(() => {
    Promise.all([api.get(`/airlines/${id}`), api.get(`/airlines/${id}/contributions/mine`)])
      .then(([a, mine]) => { setAirline(a.data); setForm(initForm(a.data)); setMyContribs(mine.data); })
      .catch(() => router.replace('/airlines'))
      .finally(() => setLoading(false));
  }, [id, router]);

  // Discard-changes confirmation on back/gesture when the form is dirty.
  useEffect(() => {
    const sub = (navigation as any).addListener('beforeRemove', (e: any) => {
      if (!dirtyRef.current || successRef.current) return;
      e.preventDefault();
      Alert.alert('Discard changes?', 'You have unsaved edits to this factfile.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return sub;
  }, [navigation]);

  const set = useCallback((key: string, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((er) => { const c = { ...er }; delete c[key]; return c; });
  }, []);

  const fleetRows: FleetRow[] = form.fleetDetail || [];
  const setFleetRow = (i: number, key: keyof FleetRow, val: string) => {
    setFleetError('');
    setForm((f) => ({ ...f, fleetDetail: (f.fleetDetail || []).map((r: FleetRow, j: number) => (j === i ? { ...r, [key]: val } : r)) }));
  };
  const addFleetRow = () => setForm((f) => ({ ...f, fleetDetail: [...(f.fleetDetail || []), { type: '', inService: '', ordered: '', retired: '' }] }));
  const removeFleetRow = (i: number) => { setFleetError(''); setForm((f) => ({ ...f, fleetDetail: (f.fleetDetail || []).filter((_: FleetRow, j: number) => j !== i) })); };

  const showToast = (msg: string, ms = 4000) => { setToast(msg); setTimeout(() => setToast(null), ms); };

  // Keep dirty ref fresh for the beforeRemove listener.
  if (airline) dirtyRef.current = Object.keys(buildDiff(form, airline)).length > 0;

  const handleSubmit = async () => {
    // Fleet validation: a row with counts needs a type; counts whole numbers >= 0.
    const rows: FleetRow[] = form.fleetDetail || [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const hasCount = (['inService', 'ordered', 'retired'] as (keyof FleetRow)[]).some((k) => (r[k] ?? '').toString().trim() !== '');
      if (!(r.type || '').trim()) {
        if (hasCount) { setFleetError(`Aircraft ${i + 1}: enter an aircraft type, or clear its counts.`); return; }
        continue;
      }
      for (const k of ['inService', 'ordered', 'retired'] as (keyof FleetRow)[]) {
        const t = (r[k] ?? '').toString().trim();
        if (t !== '' && !/^\d+$/.test(t)) { setFleetError(`Aircraft ${i + 1}: counts must be whole numbers of 0 or more.`); return; }
      }
    }
    setFleetError('');

    const diff = buildDiff(form, airline);
    if (Object.keys(diff).length === 0) {
      showToast('No changes detected — edit at least one field before submitting.');
      return;
    }
    const clientErrors = validateDiff(diff);
    if (Object.keys(clientErrors).length > 0) { setFieldErrors(clientErrors); return; }

    setSubmitting(true);
    try {
      await api.post(`/airlines/${id}/contributions`, { proposedChanges: diff });
      successRef.current = true;
      setSuccess(true);
      setTimeout(() => router.replace(`/airlines/${id}`), 2500);
    } catch (err: any) {
      const data = err?.response?.data;
      if (err?.response?.status === 400 && data?.fieldErrors) setFieldErrors(data.fieldErrors);
      else showToast(data?.error || 'Something went wrong. Please try again.', 5000);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={pilot.navy} /></View></SafeAreaView>;
  }
  if (!airline) return null;

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Contribution submitted!</Text>
            <Text style={styles.successMsg}>
              Your contribution is in review. Thanks for helping the community.{'\n'}
              Redirecting back to {airline.name}…
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── field render helpers (mirror web inp/ta/sel) ──
  const hintEl = (hint?: string) => (hint ? <Text style={styles.hint}>{hint}</Text> : null);
  const inp = (key: string, label: string, hint?: string, extra: any = {}) => (
    <View style={styles.fieldWrap}>
      <TextField label={label} value={form[key] ?? ''} onChangeText={(t) => set(key, t)} error={fieldErrors[key]} {...extra} />
      {hintEl(hint)}
    </View>
  );
  const ta = (key: string, label: string, hint?: string, rows = 3) => (
    <View style={styles.fieldWrap}>
      <TextField label={label} value={form[key] ?? ''} onChangeText={(t) => set(key, t)} error={fieldErrors[key]}
        multiline style={{ minHeight: rows * 22 + 16, textAlignVertical: 'top' }} />
      {hintEl(hint)}
    </View>
  );
  const sel = (key: string, label: string, hint: string, options: Opt[], withBlank = true) => (
    <View style={styles.fieldWrap}>
      <SelectField label={label} value={form[key] ?? ''} error={fieldErrors[key]}
        options={withBlank ? ([['', '— Not specified —'], ...options] as Opt[]) : options}
        onSelect={(v) => set(key, v)} placeholder="— Not specified —" />
      {hintEl(hint)}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => router.back()} style={styles.backRow}>
            <Text style={styles.back}>← Back to {airline.name}</Text>
          </Pressable>

          <Text style={styles.title}>Suggest an edit — {airline.name}</Text>
          <Text style={styles.sub}>Only fields you change will be submitted. All contributions are reviewed before going live.</Text>

          {myContribs.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={styles.sectionTitle}>YOUR CONTRIBUTIONS</Text>
              {myContribs.map((c) => {
                const st = CONTRIB_STATUS[c.status] || CONTRIB_STATUS.PENDING;
                return (
                  <View key={c.id} style={styles.contribCard}>
                    <View style={styles.contribHead}>
                      <Text style={styles.contribSummary}>Updated: {contribSummary(c.proposedChanges)}</Text>
                      <View style={styles.contribMeta}>
                        <Text style={styles.contribDate}>{fmtDate(c.createdAt)}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                          <Text style={[styles.statusText, { color: st.fg }]}>{titleCase(c.status)}</Text>
                        </View>
                      </View>
                    </View>
                    {c.status === 'PENDING' && <Text style={styles.contribNote}>Under review — usually replied within a few days.</Text>}
                    {c.status === 'APPROVED' && <Text style={[styles.contribNote, { color: '#166534', fontFamily: fontFamilies.bodySemiBold }]}>✓ Applied{c.reviewedAt ? ` on ${fmtDate(c.reviewedAt)}` : ''}. Thanks for helping the community.</Text>}
                    {c.status === 'REJECTED' && c.reviewNote && (
                      <View style={styles.rejectBox}>
                        <Text style={styles.rejectLabel}>REVIEWER FEEDBACK</Text>
                        <Text style={styles.rejectText}>{c.reviewNote}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Operations */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>OPERATIONS</Text>
            {inp('headquarters', 'Headquarters', "City or country where the airline's main HQ is located.", { placeholder: 'e.g. Dublin, Ireland' })}
            {ta('description', 'Description', 'A short factual overview of the airline — fleet size, routes, market position.', 4)}

            <View style={styles.fieldWrap}>
              <Text style={styles.fleetLabel}>Fleet</Text>
              <Text style={styles.hint}>Add each aircraft type with its in-service / on-order / retired counts. Leave a count blank if unknown.</Text>
              {fleetRows.map((row, i) => (
                <View key={i} style={styles.fleetRow}>
                  <View style={styles.fleetRowHead}>
                    <Text style={styles.fleetRowLabel}>Aircraft {i + 1}</Text>
                    <Pressable accessibilityLabel={`Remove aircraft ${i + 1}`} onPress={() => removeFleetRow(i)} hitSlop={8}>
                      <Text style={styles.fleetRemove}>✕</Text>
                    </Pressable>
                  </View>
                  <AircraftCombobox label="" value={row.type} onChange={(v) => setFleetRow(i, 'type', v)} />
                  <View style={styles.fleetCounts}>
                    <TextField containerStyle={styles.fleetCount} label="In service" value={row.inService} onChangeText={(v) => setFleetRow(i, 'inService', v)} keyboardType="number-pad" placeholder="—" />
                    <TextField containerStyle={styles.fleetCount} label="On order" value={row.ordered} onChangeText={(v) => setFleetRow(i, 'ordered', v)} keyboardType="number-pad" placeholder="—" />
                    <TextField containerStyle={styles.fleetCount} label="Retired" value={row.retired} onChangeText={(v) => setFleetRow(i, 'retired', v)} keyboardType="number-pad" placeholder="—" />
                  </View>
                </View>
              ))}
              {fleetError ? <Text style={styles.fleetErr}>{fleetError}</Text> : null}
              <Pressable accessibilityLabel="Add aircraft" onPress={addFleetRow} style={styles.fleetAddBtn}>
                <Text style={styles.fleetAddText}>+ Add aircraft</Text>
              </Pressable>
            </View>

            {ta('bases', 'Bases', 'One base (airport IATA code or city) per line, e.g. DUB', 3)}
            {sel('contractType', 'Contract Type', 'The primary type of employment contract offered.', CONTRACT_TYPES)}
            {inp('rosterPattern', 'Roster Pattern', 'How the duty/off cycle typically works, e.g. "5 on / 4 off".', { placeholder: 'e.g. 5 on / 4 off' })}
            {ta('workAuthRequired', 'Work Auth Required', 'One country or region per line where work authorisation is required to be considered.', 3)}
            {sel('region', 'Region', 'The geographic region this airline operates from.', REGIONS, false)}
          </View>

          {/* Compensation */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>COMPENSATION</Text>
            <Text style={styles.sectionIntro}>Enter the pay range you know about. Leave blank for fields you don't know.</Text>

            <Text style={styles.groupLabel}>Captain — Min / Max</Text>
            <View style={styles.payGrid}>
              <TextField containerStyle={styles.payCell} label="" value={form.captainMin ?? ''} onChangeText={(v) => set('captainMin', v)} placeholder="Min (e.g. 90000)" keyboardType="number-pad" error={fieldErrors.captainMin} />
              <TextField containerStyle={styles.payCell} label="" value={form.captainMax ?? ''} onChangeText={(v) => set('captainMax', v)} placeholder="Max (e.g. 150000)" keyboardType="number-pad" error={fieldErrors.captainMax} />
            </View>
            <Text style={styles.hint}>Gross annual salary range (or monthly — set Period accordingly).</Text>

            <Text style={[styles.groupLabel, { marginTop: 14 }]}>Captain — Currency / Period</Text>
            <View style={styles.payGrid}>
              <TextField containerStyle={styles.payCell} label="" value={form.captainCurrency ?? ''} onChangeText={(v) => set('captainCurrency', v)} placeholder="Currency (e.g. EUR)" maxLength={4} autoCapitalize="characters" />
              <TextField containerStyle={styles.payCell} label="" value={form.captainPeriod ?? ''} onChangeText={(v) => set('captainPeriod', v)} placeholder="Period (e.g. year)" />
            </View>

            <Text style={[styles.groupLabel, { marginTop: 14 }]}>First Officer — Min / Max</Text>
            <View style={styles.payGrid}>
              <TextField containerStyle={styles.payCell} label="" value={form.foMin ?? ''} onChangeText={(v) => set('foMin', v)} placeholder="Min" keyboardType="number-pad" error={fieldErrors.foMin} />
              <TextField containerStyle={styles.payCell} label="" value={form.foMax ?? ''} onChangeText={(v) => set('foMax', v)} placeholder="Max" keyboardType="number-pad" error={fieldErrors.foMax} />
            </View>
            <Text style={styles.hint}>Gross salary range for FO.</Text>

            <Text style={[styles.groupLabel, { marginTop: 14 }]}>First Officer — Currency / Period</Text>
            <View style={styles.payGrid}>
              <TextField containerStyle={styles.payCell} label="" value={form.foCurrency ?? ''} onChangeText={(v) => set('foCurrency', v)} placeholder="Currency (e.g. EUR)" maxLength={4} autoCapitalize="characters" />
              <TextField containerStyle={styles.payCell} label="" value={form.foPeriod ?? ''} onChangeText={(v) => set('foPeriod', v)} placeholder="Period (e.g. year)" />
            </View>
          </View>

          {/* Career */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CAREER</Text>
            {sel('hiringStatus', 'Hiring Status', 'Is the airline actively recruiting pilots right now?', HIRING_STATUSES)}
            {sel('hiringFrequency', 'Hiring Frequency', 'How often does the airline open pilot recruitment cycles?', HIRING_FREQUENCIES)}
            {inp('upgradeTimeMinYears', 'Upgrade Min Years', 'Minimum number of years typically required before upgrade to Captain.', { keyboardType: 'decimal-pad', placeholder: 'e.g. 3' })}
            {inp('upgradeTimeMaxYears', 'Upgrade Max Years', 'Maximum years before upgrade (typical ceiling).', { keyboardType: 'decimal-pad', placeholder: 'e.g. 7' })}
          </View>

          {/* Application Process */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>APPLICATION PROCESS</Text>
            {inp('avgResponseDays', 'Avg Response Days', 'How many days did your application take to get a first response?', { keyboardType: 'number-pad', placeholder: 'e.g. 14' })}
            {ta('interviewStages', 'Interview Stages', 'List each stage on a new line, in order, e.g. HR screen, Technical sim, Medical.', 4)}
            {inp('simType', 'Sim Type', 'The simulator aircraft/model used in the type rating or selection process.', { placeholder: 'e.g. Boeing 737 Full Flight Sim Level D' })}
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            {ta('notes', 'General Notes', "Anything useful for fellow pilots that doesn't fit the above sections — culture, pay structure quirks, seniority system, etc.", 5)}
          </View>

          <View style={styles.submitRow}>
            <PrimaryButton label={submitting ? 'Submitting…' : 'Submit contribution'} accessibilityLabel="Submit contribution" onPress={handleSubmit} loading={submitting} />
            <SecondaryButton label="Cancel" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {toast ? <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: { padding: spacing.xl, paddingBottom: 48 },
  backRow: { marginBottom: 16 },
  back: { color: pilot.muted, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  title: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: pilot.ink, letterSpacing: -0.2, marginBottom: 4 },
  sub: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 20, marginBottom: 24 },

  section: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 20, marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: pilot.muted, letterSpacing: 1, marginBottom: 16 },
  sectionIntro: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginBottom: 14, lineHeight: 18 },
  fieldWrap: { marginBottom: 16 },
  hint: { fontSize: 11, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 5, lineHeight: 16 },
  groupLabel: { fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm, color: pilot.ink, marginBottom: 6 },

  fleetLabel: { fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm, color: pilot.ink, marginBottom: 2 },
  fleetRow: { backgroundColor: pilot.cream, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, padding: 12, marginTop: 8 },
  fleetRowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fleetRowLabel: { fontSize: 12, fontFamily: fontFamilies.bodyBold, color: pilot.navy },
  fleetRemove: { color: '#991B1B', fontSize: 16, fontFamily: fontFamilies.bodyBold },
  fleetCounts: { flexDirection: 'row', gap: 8, marginTop: 8 },
  fleetCount: { flex: 1 },
  fleetErr: { fontSize: 12, color: '#991B1B', fontFamily: fontFamilies.body, marginTop: 6 },
  fleetAddBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(0,63,136,0.3)', borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 10, backgroundColor: 'rgba(0,63,136,0.06)' },
  fleetAddText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },

  payGrid: { flexDirection: 'row', gap: 12 },
  payCell: { flex: 1 },

  submitRow: { marginTop: 8, marginBottom: 24 },

  contribCard: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, padding: 14, marginBottom: 10 },
  contribHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  contribSummary: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.bodySemiBold, flexShrink: 1 },
  contribMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contribDate: { fontSize: 12, color: pilot.muted, fontFamily: fontFamilies.body },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: fontFamilies.bodyBold },
  contribNote: { fontSize: 12, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 6 },
  rejectBox: { marginTop: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 10 },
  rejectLabel: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: '#991B1B', letterSpacing: 0.4, marginBottom: 3 },
  rejectText: { fontSize: 13, color: '#991B1B', fontFamily: fontFamilies.body, lineHeight: 19 },

  successCard: { alignItems: 'center', backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, paddingVertical: 56, paddingHorizontal: 28, width: '100%' },
  successIcon: { fontSize: 36, color: '#166534', marginBottom: 14 },
  successTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: '#166534', marginBottom: 8 },
  successMsg: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 22, textAlign: 'center' },

  toast: { position: 'absolute', bottom: 28, left: 20, right: 20, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18 },
  toastText: { color: '#991B1B', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, textAlign: 'center' },
});
