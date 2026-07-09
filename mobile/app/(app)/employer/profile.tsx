// Employer company profile edit — mirrors frontend/src/pages/employer/EmployerProfile.jsx.
// PUT /employers/me. b2b identity.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { isAxiosError } from 'axios';
import api from '../../../src/lib/api';
import { useAuth, Employer } from '../../../src/context/AuthContext';
import { ErrorBanner, PrimaryButton, SelectField, TextField } from '../../../src/components/ui';
import { StatusBadge } from '../../../src/components/employer/EmployerChrome';
import { employer as emp, fontFamilies, fontSizes, spacing } from '../../../src/theme/tokens';

const COMPANY_TYPES: [string, string][] = [['AIRLINE', 'Airline'], ['CHARTER', 'Charter'], ['CARGO', 'Cargo'], ['EMS', 'EMS / Air Ambulance'], ['FLIGHT_SCHOOL', 'Flight School'], ['CORPORATE', 'Corporate / Business Aviation'], ['RECRUITER', 'Recruiter / Agency'], ['OTHER', 'Other']];
const DESC_MAX = 5000;

export default function EmployerProfile() {
  const router = useRouter();
  const { user, refresh, resendVerification } = useAuth();
  const e = user as Employer | null;
  const [form, setForm] = useState(() => ({
    companyName: e?.companyName || '', companyType: e?.companyType || 'OTHER', country: e?.country || '',
    headquartersCity: (e?.headquartersCity as string) || '', website: (e?.website as string) || '', description: (e?.description as string) || '',
    iataCode: (e?.iataCode as string) || '', icaoCode: (e?.icaoCode as string) || '',
    contactName: e?.contactName || '', contactPhone: (e?.contactPhone as string) || '', logoUrl: (e?.logoUrl as string) || '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const [resend, setResend] = useState<{ ok: boolean; text: string } | null>(null);

  if (!e) return null;
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const err: Record<string, string> = {};
    if (!form.companyName.trim()) err.companyName = 'Company name is required';
    if (!form.country.trim()) err.country = 'Country is required';
    if (!form.contactName.trim()) err.contactName = 'Contact name is required';
    if (form.description.length > DESC_MAX) err.description = `Max ${DESC_MAX} characters`;
    for (const [k, lbl] of [['website', 'Website'], ['logoUrl', 'Logo URL']] as [string, string][]) {
      const v = (form as Record<string, string>)[k];
      if (v.trim()) { try { new URL(v.trim()); } catch { err[k] = `${lbl} must be a valid URL`; } }
    }
    return err;
  };

  const onSave = async () => {
    setBanner('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await api.put('/employers/me', {
        companyName: form.companyName.trim(), companyType: form.companyType, country: form.country.trim(),
        headquartersCity: form.headquartersCity.trim() || null, website: form.website.trim() || null,
        description: form.description.trim() || null, iataCode: form.iataCode.trim() || null,
        icaoCode: form.icaoCode.trim() || null, contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim() || null, logoUrl: form.logoUrl.trim() || null,
      });
      await refresh();
      router.replace({ pathname: '/employer/dashboard', params: { toast: 'Profile updated!' } });
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 400 && Array.isArray(err.response?.data?.errors)) {
        const se: Record<string, string> = {}; for (const x of err.response.data.errors) if (x.path) se[x.path] = x.msg; setErrors(se);
      }
      setBanner((isAxiosError(err) ? err.response?.data?.error : '') || 'Could not save your profile. Please try again.');
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try { const data = await resendVerification(); setResend({ ok: true, text: data?.message || 'Verification link sent — check your email.' }); }
    catch (err) { setResend({ ok: false, text: isAxiosError(err) && err.response?.status === 429 ? 'Too many requests. Wait an hour and try again.' : 'Could not send. Try again later.' }); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← Dashboard</Text></Pressable>
        <Text style={styles.topTitle}>Edit Profile</Text>
        <View style={{ width: 80 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ErrorBanner>{banner}</ErrorBanner>

          <F><TextField label="Company Name *" value={form.companyName} onChangeText={(t) => set('companyName', t)} error={errors.companyName} /></F>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><F><SelectField label="Company Type" value={form.companyType} options={COMPANY_TYPES} onSelect={(v) => set('companyType', v)} /></F></View>
            <View style={{ flex: 1 }}><F><TextField label="Country *" value={form.country} onChangeText={(t) => set('country', t)} error={errors.country} /></F></View>
          </View>
          <F><TextField label="Headquarters City" value={form.headquartersCity} onChangeText={(t) => set('headquartersCity', t)} /></F>
          <F><TextField label="Website" placeholder="https://example.com" keyboardType="url" autoCapitalize="none" autoCorrect={false} value={form.website} onChangeText={(t) => set('website', t)} error={errors.website} /></F>
          <F>
            <TextField label="Description" multiline maxLength={DESC_MAX} value={form.description} onChangeText={(t) => set('description', t)} style={{ minHeight: 100, textAlignVertical: 'top' }} error={errors.description} />
            <Text style={styles.hint}>{form.description.length}/{DESC_MAX}</Text>
          </F>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><F><TextField label="IATA Code" placeholder="optional" autoCapitalize="characters" value={form.iataCode} onChangeText={(t) => set('iataCode', t)} /></F></View>
            <View style={{ flex: 1 }}><F><TextField label="ICAO Code" placeholder="optional" autoCapitalize="characters" value={form.icaoCode} onChangeText={(t) => set('icaoCode', t)} /></F></View>
          </View>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><F><TextField label="Contact Name *" value={form.contactName} onChangeText={(t) => set('contactName', t)} error={errors.contactName} /></F></View>
            <View style={{ flex: 1 }}><F><TextField label="Contact Phone" keyboardType="phone-pad" value={form.contactPhone} onChangeText={(t) => set('contactPhone', t)} /></F></View>
          </View>
          <F>
            <TextField label="Logo URL" placeholder="https://example.com/logo.png" keyboardType="url" autoCapitalize="none" autoCorrect={false} value={form.logoUrl} onChangeText={(t) => set('logoUrl', t)} error={errors.logoUrl} />
            <Text style={styles.hint}>Paste a hosted image URL (no file upload in v1).</Text>
          </F>

          {/* Contact email (read-only) + status */}
          <F>
            <TextField label="Contact Email (read-only)" value={e.contactEmail} editable={false} style={{ opacity: 0.6 }} />
            {e.emailVerified ? <Text style={styles.verified}>✓ Email verified</Text> : (
              resend ? <Text style={[styles.verified, { color: resend.ok ? '#166534' : '#991B1B' }]}>{resend.text}</Text>
                : <Text style={styles.unverified}>⚠ Email not verified. <Text style={styles.resendLink} onPress={handleResend}>Resend verification link</Text></Text>
            )}
          </F>
          <View style={styles.statusRow}><Text style={styles.statusLabel}>Status</Text><StatusBadge status={e.status} /></View>

          <PrimaryButton label={loading ? 'Saving…' : 'Save Profile'} loading={loading} onPress={onSave} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function F({ children }: { children: React.ReactNode }) { return <View style={{ marginBottom: 16 }}>{children}</View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: emp.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: emp.line, backgroundColor: emp.surface },
  back: { color: emp.muted, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  topTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: emp.ink },
  content: { padding: spacing.xl, paddingBottom: 60 },
  row2: { flexDirection: 'row', gap: 12 },
  hint: { color: emp.muted, fontSize: fontSizes.xs, fontFamily: fontFamilies.body, marginTop: 5 },
  verified: { color: '#166534', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, marginTop: 8 },
  unverified: { color: '#92400E', fontFamily: fontFamilies.body, fontSize: fontSizes.sm, marginTop: 8 },
  resendLink: { color: emp.navy, fontFamily: fontFamilies.bodySemiBold, textDecorationLine: 'underline' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  statusLabel: { color: emp.muted, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
});
