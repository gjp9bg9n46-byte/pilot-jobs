// Per-item profile edit sheet — the mobile twin of the web ProfileEditSheets.jsx.
// Each card row opens a sheet for ONE record (licence / rating / medical /
// training / elp / rtw / passport) or the single-record Personal / Preferences.
// Pick-lists everywhere, dates start empty, Save disabled until changed, grey
// Remove with a confirm step (red only on the final button), "Saved" toast on
// success (shown by the parent). No stored data is rewritten for display.
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import { DateField, FieldLabel, SelectField, TextField, Checkbox } from './ui';
import AircraftCombobox from './AircraftCombobox';
import { fontFamilies, fontSizes, spacing } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

export const AUTHORITIES: [string, string][] = [
  ['ECAA', 'ECAA'], ['GCAA', 'GCAA'], ['GACA', 'GACA'], ['QCAA', 'QCAA'], ['BCAA', 'BCAA'],
  ['CAA Oman', 'CAA Oman'], ['DGCA Kuwait', 'DGCA Kuwait'], ['CARC', 'CARC (Jordan)'], ['DGAC Morocco', 'DGAC Morocco'],
  ['EASA', 'EASA'], ['UK CAA', 'UK CAA'], ['FAA', 'FAA'], ['TCCA', 'TCCA'], ['CASA', 'CASA'],
  ['DGCA India', 'DGCA India'], ['CAAC', 'CAAC'], ['Other', 'Other'],
];
const LIC_TYPES: [string, string][] = [['ATPL', 'ATPL'], ['CPL', 'CPL'], ['MPL', 'MPL'], ['PPL', 'PPL'], ['Other', 'Other']];
const MED_CLASSES: [string, string][] = [['CLASS_1', 'Class 1'], ['CLASS_2', 'Class 2'], ['CLASS_3', 'Other']];
const ELP_LEVELS: [string, string][] = [['Level 4', 'Level 4'], ['Level 5', 'Level 5'], ['Level 6', 'Level 6']];
const ROLES: [string, string][] = [['', '—'], ['FIRST_OFFICER', 'First Officer'], ['CAPTAIN', 'Captain']];
const EDU: [string, string][] = [['', '—'], ['high_school', 'High school'], ['technical', 'Technical'], ['bachelor', "Bachelor's degree"], ['masters', "Master's degree"], ['doctorate', 'Doctorate']];
export const COUNTRIES = ['Afghanistan', 'Albania', 'Algeria', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Benin', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Cambodia', 'Cameroon', 'Canada', 'Chad', 'Chile', 'China', 'Colombia', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea', 'Guyana', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Libya', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mauritania', 'Mauritius', 'Mexico', 'Moldova', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Serbia', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'];

const toISO = (d: string) => (d ? new Date(`${d}T00:00:00.000Z`).toISOString() : null);
const isoDay = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const canonCountry = (v?: string) => COUNTRIES.find((c) => c.toLowerCase() === String(v || '').trim().toLowerCase()) || (v || '');
function properCase(s?: string) {
  return String(s || '').split(/\s+/).map((w) => w.split('-').map((p) => {
    if (!p) return p;
    if (/\d/.test(p)) return p.toUpperCase();
    if (p === p.toUpperCase() && p.length <= 4) return p;
    return p[0].toUpperCase() + p.slice(1).toLowerCase();
  }).join(' ')).join(' ').trim();
}

// Searchable picker (country / nationality). Mirrors the web SearchCombo.
function CountryField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (v: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const pilot = useThemeColors();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const matches = q.trim() ? COUNTRIES.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase())) : COUNTRIES;
  return (
    <View style={{ marginBottom: 0 }}>
      <FieldLabel label={label} />
      <Pressable onPress={() => { setQ(''); setOpen(true); }} style={[styles.input, styles.selectRow, !!error && styles.inputErr]}>
        <Text style={value ? styles.selVal : styles.selPh}>{value || 'Select country…'}</Text>
        <Text style={styles.chev}>▾</Text>
      </Pressable>
      {error ? <Text style={styles.fieldErr}>{error}</Text> : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.pickBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.pickSheet} onPress={(e) => e.stopPropagation()}>
            <TextInput autoFocus placeholder="Search countries…" placeholderTextColor="#9AA0A6" value={q} onChangeText={setQ} style={[styles.input, { marginBottom: 10 }]} />
            <ScrollView keyboardShouldPersistTaps="handled">
              {matches.map((c) => (
                <Pressable key={c} onPress={() => { onChange(c); setOpen(false); }} style={styles.pickRow}>
                  <Text style={[styles.pickRowText, c === value && { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Suppress the browser's blue focus ring in the react-native-web render (no
// effect on native, where there is no focus outline). Cast — RN style types
// don't list outline* on all versions.
const NO_OUTLINE = { outlineStyle: 'none', outlineWidth: 0 } as any;

export type EditSpec = { kind: string; id?: string | null } | null;

export default function ProfileEditSheet({ edit, profile, onClose, onSaved }: { edit: EditSpec; profile: Any; onClose: () => void; onSaved: (msg: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const pilot = useThemeColors();
  const kind = edit?.kind || '';
  const id = edit?.id || null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const initial = useRef<string>('');

  const licences: Any[] = (profile?.certificates || []).filter((c: Any) => c.type !== 'ELP');
  const cert = id ? (profile?.certificates || []).find((c: Any) => c.id === id) : null;
  const rating = id ? (profile?.ratings || []).find((r: Any) => r.id === id) : null;
  const med = id ? (profile?.medicals || []).find((m: Any) => m.id === id) : null;
  const trn = id ? (profile?.trainingRecords || []).find((t: Any) => t.id === id) : null;
  const elpRec = kind === 'elp' ? (id ? (profile?.certificates || []).find((c: Any) => c.id === id) : (profile?.certificates || []).find((c: Any) => c.type === 'ELP')) : null;
  const rtwRec = id ? (profile?.rightToWork || []).find((w: Any) => w.id === id) : null;

  const [form, setForm] = useState<Any>(() => {
    let f: Any = {};
    if (kind === 'personal') f = { firstName: profile?.firstName || '', lastName: profile?.lastName || '', role: profile?.role || '', city: profile?.city || '', country: canonCountry(profile?.country), nationality: canonCountry(profile?.nationality), phone: profile?.phone || '', education: profile?.education || '' };
    else if (kind === 'prefs') { const p = profile?.preferences || {}; f = { preferredCountries: (p.preferredCountries || []).join(', '), preferredAircraft: (p.preferredAircraft || []).join(', '), preferredContractTypes: (p.preferredContractTypes || []).join(', '), willingToRelocate: !!profile?.willingToRelocate }; }
    else if (kind === 'licence') { const std = LIC_TYPES.some(([v]) => v === cert?.type); f = { type: cert ? (std ? cert.type : 'Other') : '', typeOther: cert && !std ? cert.type : '', issuingAuthority: cert?.issuingAuthority || '', certificateNumber: cert?.certificateNumber || '', issueDate: isoDay(cert?.issueDate), expiryDate: isoDay(cert?.expiryDate) }; }
    else if (kind === 'rating') f = { aircraft: properCase(rating?.aircraftType || ''), licenceId: rating?.licenceId || '', lineCheckDate: isoDay(rating?.lineCheckDate) };
    else if (kind === 'medical') f = { medicalClass: med?.medicalClass || 'CLASS_1', issuingAuthority: med?.issuingAuthority || '', issueDate: isoDay(med?.issueDate), expiryDate: isoDay(med?.expiryDate) };
    else if (kind === 'training') f = { type: trn?.type || '', provider: trn?.provider || '', completedAt: isoDay(trn?.completedAt), expiresAt: isoDay(trn?.expiresAt) };
    else if (kind === 'elp') f = { level: elpRec?.englishLevel || 'Level 4', issuingAuthority: elpRec?.issuingAuthority || '', expiryDate: isoDay(elpRec?.expiryDate) };
    else if (kind === 'rtw') f = { country: canonCountry(rtwRec?.country), documentType: rtwRec?.documentType || '', documentNumber: rtwRec?.documentNumber || '', expiresAt: isoDay(rtwRec?.expiresAt) };
    else if (kind === 'passport') f = { passportNumber: profile?.passportNumber || '', passportExpiry: isoDay(profile?.passportExpiry) };
    initial.current = JSON.stringify(f);
    return f;
  });

  const dirty = useMemo(() => JSON.stringify(form) !== initial.current, [form]);
  const set = (k: string, v: any) => setForm((s: Any) => ({ ...s, [k]: v }));
  const removable = (['licence', 'rating', 'medical', 'training', 'rtw'].includes(kind) && !!id) || (kind === 'elp' && !!elpRec);

  const authSel = (v: string) => { const n = String(v || '').trim(); return (!n || ['unknown', 'icao'].includes(n.toLowerCase())) ? '' : (AUTHORITIES.some(([a]) => a === n) ? n : 'Other'); };
  const authOpts: [string, string][] = [['', 'Select authority…'], ...AUTHORITIES];

  const TITLES: Record<string, string> = {
    personal: 'Personal details', prefs: 'Job preferences',
    licence: id ? 'Edit licence' : 'Add licence', rating: id ? 'Edit rating' : 'Add rating',
    medical: id ? 'Edit medical' : 'Add medical', training: id ? 'Edit training' : 'Add training',
    elp: 'English proficiency', rtw: rtwRec ? 'Edit right to work' : 'Add right to work', passport: 'Passport',
  };

  const close = () => { if (saving) return; onClose(); };

  async function remove() {
    setError(null); setSaving(true);
    try {
      if (kind === 'licence') await api.delete(`/profile/certificates/${id}`);
      else if (kind === 'rating') await api.delete(`/profile/ratings/${id}`);
      else if (kind === 'medical') await api.delete(`/profile/medicals/${id}`);
      else if (kind === 'training') await api.delete(`/profile/training/${id}`);
      else if (kind === 'rtw') await api.delete(`/profile/rtw/${id}`);
      else if (kind === 'elp') await api.delete(`/profile/elp/${elpRec.id}`);
      onSaved('Removed');
    } catch (e: any) { setError(e?.response?.data?.error || 'Couldn’t remove — try again.'); setSaving(false); }
  }

  async function save() {
    setError(null);
    const e: Record<string, string> = {};
    if (kind === 'personal' && !String(form.firstName).trim()) e.firstName = 'First name is required';
    if (kind === 'licence') { if (!form.type) e.type = 'Pick a licence type'; if (form.type === 'Other' && !String(form.typeOther).trim()) e.typeOther = 'Enter the licence name'; }
    if (kind === 'rating' && !String(form.aircraft).trim()) e.aircraft = 'Pick an aircraft type';
    if (kind === 'medical' && !form.expiryDate) e.expiryDate = 'Expiry date is required';
    if (kind === 'training') { if (!String(form.type).trim()) e.type = 'Course name is required'; if (!form.completedAt) e.completedAt = 'Completion date is required'; }
    if (kind === 'rtw' && !String(form.country).trim()) e.country = 'Country is required';
    setErrs(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const orig = JSON.parse(initial.current);
      if (kind === 'personal') {
        const body: Any = {};
        for (const k of ['firstName', 'lastName', 'role', 'city', 'country', 'nationality', 'phone', 'education']) {
          if (form[k] === orig[k]) continue;
          const v = String(form[k]).trim();
          body[k] = v === '' ? null : v;
        }
        if (Object.keys(body).length) await api.patch('/profile', body);
      } else if (kind === 'prefs') {
        const list = (s: string) => String(s).split(',').map((x) => x.trim()).filter(Boolean);
        await api.patch('/profile', { willingToRelocate: form.willingToRelocate });
        await api.put('/profile/preferences', { preferredCountries: list(form.preferredCountries), preferredAircraft: list(form.preferredAircraft), preferredContractTypes: list(form.preferredContractTypes) });
      } else if (kind === 'licence') {
        const type = form.type === 'Other' ? String(form.typeOther).trim() : form.type;
        const body = { issuingAuthority: form.issuingAuthority || 'unknown', certificateNumber: form.certificateNumber || null, issueDate: toISO(form.issueDate), expiryDate: toISO(form.expiryDate) };
        if (id) await api.patch(`/profile/certificates/${id}`, body); else await api.post('/profile/certificates', { type, ...body });
      } else if (kind === 'rating') {
        const body: Any = { licenceId: form.licenceId || null, lineCheckDate: toISO(form.lineCheckDate) };
        if (!id || form.aircraft !== orig.aircraft) body.aircraftType = String(form.aircraft).trim();
        if (id) await api.patch(`/profile/ratings/${id}`, body); else await api.post('/profile/ratings', { category: 'Type', ...body, aircraftType: String(form.aircraft).trim() });
      } else if (kind === 'medical') {
        const body = { medicalClass: form.medicalClass, issuingAuthority: form.issuingAuthority || 'unknown', issueDate: toISO(form.issueDate), expiryDate: toISO(form.expiryDate) };
        if (id) await api.patch(`/profile/medicals/${id}`, body); else await api.post('/profile/medicals', body);
      } else if (kind === 'training') {
        const body = { type: String(form.type).trim(), provider: form.provider || null, completedAt: toISO(form.completedAt), expiresAt: toISO(form.expiresAt) };
        if (id) await api.patch(`/profile/training/${id}`, body); else await api.post('/profile/training', body);
      } else if (kind === 'elp') {
        const body = { level: form.level, issuingAuthority: form.issuingAuthority || 'unknown', expiryDate: toISO(form.expiryDate), noExpiry: !form.expiryDate };
        if (elpRec) await api.patch(`/profile/elp/${elpRec.id}`, body); else await api.post('/profile/elp', body);
      } else if (kind === 'rtw') {
        if (id) await api.patch(`/profile/rtw/${id}`, { country: String(form.country).trim(), documentType: form.documentType || 'Work visa', documentNumber: form.documentNumber || null, expiresAt: toISO(form.expiresAt) });
        else await api.post('/profile/rtw', { country: String(form.country).trim(), documentType: form.documentType || 'Work visa', documentNumber: form.documentNumber || null, expiryDate: toISO(form.expiresAt), noExpiry: !form.expiresAt });
      } else if (kind === 'passport') {
        await api.patch('/profile', { passportNumber: String(form.passportNumber).trim() || null, passportExpiry: toISO(form.passportExpiry) });
      }
      onSaved('Saved');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Couldn’t save — your changes are kept.');
      setSaving(false);
    }
  }

  const licenceOpts: [string, string][] = [['', 'Not linked'], ...licences.map((l: Any): [string, string] => [l.id, `${l.type}${l.issuingAuthority && !['unknown', 'icao'].includes(String(l.issuingAuthority).toLowerCase()) ? ` · ${l.issuingAuthority}` : ''}`])];

  return (
    <Modal visible={!!edit} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{TITLES[kind] || 'Edit'}</Text>
            <Pressable onPress={close} hitSlop={10} style={NO_OUTLINE}><Ionicons name="close" size={22} color={pilot.muted} /></Pressable>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ gap: 14 }}>
              {kind === 'personal' && (<>
                <TextField label="First name" value={form.firstName} onChangeText={(v) => set('firstName', v)} error={errs.firstName} />
                <TextField label="Last name" value={form.lastName} onChangeText={(v) => set('lastName', v)} />
                <SelectField label="Role (headline)" value={form.role} options={ROLES} onSelect={(v) => set('role', v)} />
                <TextField label="City" value={form.city} onChangeText={(v) => set('city', v)} />
                <CountryField label="Country" value={form.country} onChange={(v) => set('country', v)} />
                <CountryField label="Nationality" value={form.nationality} onChange={(v) => set('nationality', v)} />
                <TextField label="Phone (private)" value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
                <SelectField label="Education" value={form.education} options={EDU} onSelect={(v) => set('education', v)} />
                <Text style={styles.note}>Email is shown to airlines you apply to — change it in account settings.</Text>
              </>)}

              {kind === 'licence' && (<>
                <SelectField label="Licence type" value={form.type} options={LIC_TYPES} placeholder="Select…" onSelect={(v) => set('type', v)} error={errs.type} />
                {form.type === 'Other' && <TextField label="Licence name" value={form.typeOther} onChangeText={(v) => set('typeOther', v)} error={errs.typeOther} />}
                <SelectField label="Authority" value={authSel(form.issuingAuthority)} options={authOpts} placeholder="Select authority…" onSelect={(v) => set('issuingAuthority', v)} />
                {authSel(form.issuingAuthority) === 'Other' && <TextField label="Authority name" value={['unknown', 'icao', '', ...AUTHORITIES.map((a) => a[0].toLowerCase())].includes(String(form.issuingAuthority).toLowerCase()) ? '' : form.issuingAuthority} onChangeText={(v) => set('issuingAuthority', v)} />}
                <TextField label="Number" value={form.certificateNumber} onChangeText={(v) => set('certificateNumber', v)} />
                <DateField label="Issue date" value={form.issueDate} onChange={(v) => set('issueDate', v)} />
                <DateField label="Expiry date" value={form.expiryDate} onChange={(v) => set('expiryDate', v)} />
              </>)}

              {kind === 'rating' && (<>
                <View><FieldLabel label="Aircraft" /><AircraftCombobox value={form.aircraft} onChange={(v) => set('aircraft', v)} />{errs.aircraft ? <Text style={styles.fieldErr}>{errs.aircraft}</Text> : null}</View>
                <SelectField label="Under licence" value={form.licenceId} options={licenceOpts} placeholder="Not linked" onSelect={(v) => set('licenceId', v)} />
                <DateField label="Line check date" value={form.lineCheckDate} onChange={(v) => set('lineCheckDate', v)} />
              </>)}

              {kind === 'medical' && (<>
                <SelectField label="Class" value={form.medicalClass} options={MED_CLASSES} onSelect={(v) => set('medicalClass', v)} />
                <SelectField label="Authority" value={authSel(form.issuingAuthority)} options={authOpts} placeholder="Select authority…" onSelect={(v) => set('issuingAuthority', v)} />
                <DateField label="Issue date" value={form.issueDate} onChange={(v) => set('issueDate', v)} />
                <DateField label="Expiry date" value={form.expiryDate} onChange={(v) => set('expiryDate', v)} error={errs.expiryDate} />
              </>)}

              {kind === 'training' && (<>
                <TextField label="Course" value={form.type} onChangeText={(v) => set('type', v)} placeholder="e.g. CRM, DGR, First Aid" error={errs.type} />
                <TextField label="Provider" value={form.provider} onChangeText={(v) => set('provider', v)} />
                <DateField label="Completed" value={form.completedAt} onChange={(v) => set('completedAt', v)} error={errs.completedAt} />
                <DateField label="Expiry" value={form.expiresAt} onChange={(v) => set('expiresAt', v)} />
                <Text style={styles.note}>Leave expiry blank to use the default validity.</Text>
              </>)}

              {kind === 'elp' && (<>
                <SelectField label="Level" value={form.level} options={ELP_LEVELS} onSelect={(v) => set('level', v)} />
                <SelectField label="Authority" value={authSel(form.issuingAuthority)} options={authOpts} placeholder="Select authority…" onSelect={(v) => set('issuingAuthority', v)} />
                <DateField label="Expiry" value={form.expiryDate} onChange={(v) => set('expiryDate', v)} />
                <Text style={styles.note}>Blank = no expiry (e.g. Level 6).</Text>
              </>)}

              {kind === 'rtw' && (<>
                <CountryField label="Country" value={form.country} onChange={(v) => set('country', v)} error={errs.country} />
                <TextField label="Document" value={form.documentType} onChangeText={(v) => set('documentType', v)} placeholder="e.g. Residence permit" />
                <TextField label="Number" value={form.documentNumber} onChangeText={(v) => set('documentNumber', v)} />
                <DateField label="Expiry" value={form.expiresAt} onChange={(v) => set('expiresAt', v)} />
                <Text style={styles.note}>Blank = no expiry.</Text>
              </>)}

              {kind === 'passport' && (<>
                <TextField label="Passport number" value={form.passportNumber} onChangeText={(v) => set('passportNumber', v)} />
                <DateField label="Expiry date" value={form.passportExpiry} onChange={(v) => set('passportExpiry', v)} />
              </>)}

              {kind === 'prefs' && (<>
                <TextField label="Preferred regions / countries" hint="comma-separated" value={form.preferredCountries} onChangeText={(v) => set('preferredCountries', v)} placeholder="Middle East, Europe" />
                <TextField label="Preferred aircraft" hint="comma-separated" value={form.preferredAircraft} onChangeText={(v) => set('preferredAircraft', v)} placeholder="A320 family, B737" />
                <TextField label="Contract types" hint="comma-separated" value={form.preferredContractTypes} onChangeText={(v) => set('preferredContractTypes', v)} placeholder="Permanent, Contract" />
                <Checkbox label="Willing to relocate" value={!!form.willingToRelocate} onChange={(v) => set('willingToRelocate', v)} />
              </>)}
            </View>
          </ScrollView>

          {error ? <View style={styles.errBanner}><Text style={styles.errBannerText}>{error}</Text></View> : null}

          <View style={styles.foot}>
            <View style={styles.footButtons}>
              <Pressable style={({ pressed }) => [styles.btn, styles.btnGhost, NO_OUTLINE, pressed && { opacity: 0.85 }]} onPress={close}><Text style={styles.btnGhostText}>Cancel</Text></Pressable>
              <Pressable disabled={saving || !dirty} onPress={save} style={({ pressed }) => [styles.btn, styles.btnPrimary, NO_OUTLINE, (saving || !dirty) && { opacity: 0.45 }, pressed && dirty && { opacity: 0.9 }]}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Save</Text>}
              </Pressable>
            </View>
            {removable ? (
              <View style={styles.removeWrap}>
                {confirming ? (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmQ}>Remove this?</Text>
                    <Pressable onPress={remove} style={styles.confirmYes}><Text style={styles.confirmYesText}>Yes, remove</Text></Pressable>
                    <Pressable onPress={() => setConfirming(false)} style={styles.confirmNo}><Text style={styles.confirmNoText}>Keep</Text></Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setConfirming(true)}><Text style={styles.removeText}>{`Remove ${kind === 'rtw' ? 'right to work' : kind}`}</Text></Pressable>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,20,25,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: pilot.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%', paddingTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: pilot.line },
  title: { fontFamily: fontFamilies.display, fontSize: 19, color: pilot.ink, fontWeight: '600' },
  body: { paddingHorizontal: spacing.xl, paddingVertical: 16 },
  note: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 17 },

  input: { borderWidth: 1, borderColor: pilot.line, borderRadius: 9, paddingVertical: 12, paddingHorizontal: 13, fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: pilot.ink, backgroundColor: pilot.surface },
  inputErr: { borderColor: '#FECACA' },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selVal: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: pilot.ink },
  selPh: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: '#9AA0A6' },
  chev: { color: pilot.muted, fontSize: 14 },
  fieldErr: { color: '#B42318', fontSize: fontSizes.xs, fontFamily: fontFamilies.body, marginTop: 5 },

  pickBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  pickSheet: { backgroundColor: pilot.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.xl, maxHeight: '75%' },
  pickRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: pilot.line },
  pickRowText: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: pilot.ink },

  errBanner: { marginHorizontal: spacing.xl, marginTop: 4, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  errBannerText: { color: '#B42318', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },

  foot: { paddingHorizontal: spacing.xl, paddingTop: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: pilot.line, gap: 12 },
  footButtons: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface },
  btnGhostText: { color: pilot.ink, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.md },
  btnPrimary: { backgroundColor: pilot.navy },
  btnPrimaryText: { color: '#fff', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.md },

  removeWrap: { alignItems: 'flex-start' },
  removeText: { color: pilot.muted, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, paddingVertical: 4 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  confirmQ: { color: pilot.ink, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm },
  confirmYes: { backgroundColor: '#B42318', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  confirmYesText: { color: '#fff', fontFamily: fontFamilies.bodySemiBold, fontSize: 12.5 },
  confirmNo: { borderWidth: 1, borderColor: pilot.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  confirmNoText: { color: pilot.ink, fontFamily: fontFamilies.bodySemiBold, fontSize: 12.5 },
});
