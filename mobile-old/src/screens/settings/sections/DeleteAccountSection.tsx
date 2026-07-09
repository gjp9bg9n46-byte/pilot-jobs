import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { authApi, profileApi } from '../../../services/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docDir: string = (FileSystem as any).documentDirectory ?? '';
import { logout } from '../../../store';
import { useAppDispatch } from '../../../hooks/useAppDispatch';
import { SectionCard } from './shared';

type Step = 1 | 2 | 3 | 4;

interface Counts {
  logEntries: number;
  licences: number;
  medicals: number;
  applications: number;
}

interface Props {
  pilotEmail: string;
}

export default function DeleteAccountSection({ pilotEmail }: Props) {
  const dispatch = useAppDispatch();
  const [step, setStep]       = useState<Step>(1);
  const [counts, setCounts]   = useState<Counts | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [typedEmail, setTypedEmail] = useState('');
  const [password, setPassword]     = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    profileApi.getCounts()
      .then(({ data }) => setCounts(data))
      .catch(() => setCounts({ logEntries: 0, licences: 0, medicals: 0, applications: 0 }));
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      // TODO: backend — GET /me/export endpoint needed
      const { data } = await profileApi.exportData();
      const path = docDir + 'pilot_data_export.json';
      await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2));
      alert(`Data saved to ${path}\n(Install expo-sharing to open share sheet)`);
    } catch {
      alert('Export failed — this feature requires backend support (GET /me/export).');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!password) { setError('Please enter your password.'); return; }
    setDeleting(true);
    setError('');
    try {
      await authApi.deleteAccount(password);
      await SecureStore.deleteItemAsync('authToken');
      dispatch(logout());
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not delete account.');
    } finally {
      setDeleting(false);
    }
  };

  const emailMatch = typedEmail.trim().toLowerCase() === pilotEmail.toLowerCase();
  const canDelete  = emailMatch && confirmed && password.length >= 8;

  return (
    <SectionCard title="Delete Account" icon="trash-outline">
      {/* Step indicator */}
      <View style={s.stepRow}>
        {([1, 2, 3, 4] as Step[]).map((n) => (
          <View key={n} style={[s.stepDot, step === n && s.stepDotActive, step > n && s.stepDotDone]}>
            {step > n
              ? <Ionicons name="checkmark" size={10} color="#fff" />
              : <Text style={s.stepNum}>{n}</Text>}
          </View>
        ))}
        <View style={s.stepLine} />
      </View>

      {/* Step 1 — What gets deleted */}
      {step === 1 && (
        <View>
          <Text style={s.dangerTitle}>This permanently deletes everything.</Text>
          <Text style={s.stepSubtitle}>Your account contains:</Text>
          {counts
            ? [
                { icon: 'book-outline', label: `${counts.logEntries} logbook entries` },
                { icon: 'ribbon-outline', label: `${counts.licences} licences / certificates` },
                { icon: 'medkit-outline', label: `${counts.medicals} medical certificates` },
                { icon: 'briefcase-outline', label: `${counts.applications} job applications` },
                { icon: 'notifications-outline', label: 'All job alerts and saved searches' },
                { icon: 'person-outline', label: 'Your profile and all personal data' },
              ].map(({ icon, label }) => (
                <View key={label} style={s.deleteItem}>
                  <Ionicons name={icon as any} size={16} color="#FF4757" />
                  <Text style={s.deleteItemText}>{label}</Text>
                </View>
              ))
            : <ActivityIndicator color="#00B4D8" style={{ marginVertical: 12 }} />}
          <Text style={s.graceNote}>
            Note: account deletion is immediate and permanent.{'\n'}
            {/* TODO: backend — propose soft-delete with 30-day grace period */}
          </Text>
          <TouchableOpacity style={s.nextBtn} onPress={() => setStep(2)}>
            <Text style={s.nextBtnText}>I understand — continue</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2 — Export data */}
      {step === 2 && (
        <View>
          <Text style={s.stepSubtitle}>Download your data before deleting</Text>
          <Text style={s.stepNote}>This is your last chance to save your logbook, licences, and profile.</Text>
          <TouchableOpacity style={s.exportBtn} onPress={handleExport} disabled={exporting}>
            {exporting
              ? <ActivityIndicator color="#00B4D8" size="small" />
              : <>
                  <Ionicons name="download-outline" size={18} color="#00B4D8" />
                  <Text style={s.exportBtnText}>Export my data</Text>
                </>}
          </TouchableOpacity>
          <Text style={[s.stepNote, { marginTop: 8 }]}>
            {/* TODO: backend — GET /me/export and expo-sharing needed for full functionality */}
          </Text>
          <View style={s.stepNavRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => setStep(1)}>
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.nextBtn} onPress={() => setStep(3)}>
              <Text style={s.nextBtnText}>Skip / continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 3 — Type email */}
      {step === 3 && (
        <View>
          <Text style={s.stepSubtitle}>Confirm your email address</Text>
          <Text style={s.emailHint}>{pilotEmail}</Text>
          <TextInput
            style={[s.input, !emailMatch && typedEmail.length > 0 && s.inputError]}
            value={typedEmail}
            onChangeText={setTypedEmail}
            placeholder="Type your email"
            placeholderTextColor="#4A6080"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {!emailMatch && typedEmail.length > 0 && (
            <Text style={s.fieldError}>Email does not match.</Text>
          )}
          <View style={s.stepNavRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => setStep(2)}>
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.nextBtn, !emailMatch && s.nextBtnDisabled]}
              onPress={() => emailMatch && setStep(4)}
              disabled={!emailMatch}
            >
              <Text style={s.nextBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 4 — Final confirm */}
      {step === 4 && (
        <View>
          <Text style={s.dangerTitle}>Final confirmation</Text>

          <Text style={s.label}>Enter your password</Text>
          <View style={[s.inputWrap, error && s.inputError]}>
            <TextInput
              style={s.inputInner}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(''); }}
              secureTextEntry={!showPw}
              placeholder="Your account password"
              placeholderTextColor="#4A6080"
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={s.eyeBtn}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color="#7A8CA0" />
            </TouchableOpacity>
          </View>
          {error ? <Text style={s.fieldError}>{error}</Text> : null}

          <View style={s.checkRow}>
            <Switch
              value={confirmed}
              onValueChange={setConfirmed}
              trackColor={{ false: '#243050', true: '#FF4757' }}
              thumbColor="#fff"
            />
            <Text style={s.checkLabel}>I understand this is permanent and cannot be undone.</Text>
          </View>

          <View style={s.stepNavRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => setStep(3)}>
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.deleteBtn, !canDelete && s.deleteBtnDisabled]}
              onPress={handleDelete}
              disabled={!canDelete || deleting}
            >
              {deleting
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                    <Text style={s.deleteBtnText}>Delete My Account</Text>
                  </>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SectionCard>
  );
}

const s = StyleSheet.create({
  stepRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 20, position: 'relative' },
  stepLine:     { position: 'absolute', left: 12, right: 12, height: 1, backgroundColor: '#243050', zIndex: 0 },
  stepDot:      { width: 24, height: 24, borderRadius: 12, backgroundColor: '#243050', alignItems: 'center', justifyContent: 'center', marginRight: 20, zIndex: 1 },
  stepDotActive:{ backgroundColor: '#00B4D8' },
  stepDotDone:  { backgroundColor: '#2ED573' },
  stepNum:      { color: '#7A8CA0', fontSize: 11, fontWeight: '700' },
  dangerTitle:  { color: '#FF6B6B', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  stepSubtitle: { color: '#C0CDE0', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  stepNote:     { color: '#7A8CA0', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  graceNote:    { color: '#4A6080', fontSize: 12, marginTop: 12, marginBottom: 12, lineHeight: 18 },
  deleteItem:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  deleteItemText: { color: '#C0CDE0', fontSize: 13 },
  emailHint:    { color: '#4A6080', fontSize: 13, marginBottom: 8, fontStyle: 'italic' },
  label:        { color: '#C0CDE0', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input:        { backgroundColor: '#0A1628', borderRadius: 8, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#243050', marginBottom: 8 },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A1628', borderRadius: 8, borderWidth: 1, borderColor: '#243050', marginBottom: 8 },
  inputInner:   { flex: 1, padding: 12, color: '#fff', fontSize: 14 },
  inputError:   { borderColor: '#FF4757' },
  eyeBtn:       { padding: 12 },
  fieldError:   { color: '#FF4757', fontSize: 12, marginBottom: 8 },
  checkRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 16 },
  checkLabel:   { color: '#C0CDE0', fontSize: 13, flex: 1 },
  stepNavRow:   { flexDirection: 'row', gap: 10, marginTop: 12 },
  backBtn:      { flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#0F2040', borderWidth: 1, borderColor: '#243050' },
  backBtnText:  { color: '#7A8CA0', fontWeight: '600' },
  nextBtn:      { flex: 2, backgroundColor: '#00B4D8', borderRadius: 8, padding: 12, alignItems: 'center' },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText:  { color: '#fff', fontWeight: '700' },
  exportBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0F2040', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#00B4D8', marginBottom: 8 },
  exportBtnText:{ color: '#00B4D8', fontWeight: '600', fontSize: 14 },
  deleteBtn:    { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7C1E1E', borderRadius: 8, padding: 12 },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteBtnText:{ color: '#fff', fontWeight: '700', fontSize: 14 },
});
