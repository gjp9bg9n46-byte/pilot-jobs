import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../../services/api';
import { passwordStrength } from '../../../utils/format';
import { SectionCard } from './shared';

export default function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showCon, setShowCon] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  const strength = passwordStrength(next);

  const tooShort     = next.length > 0 && next.length < 8;
  const sameAsCur    = next.length > 0 && next === current;
  const mismatch     = confirm.length > 0 && next !== confirm;
  const canSubmit    = current.length > 0 && next.length >= 8 && !sameAsCur && next === confirm && !saving;

  const handleChange = async () => {
    setSaving(true);
    setError('');
    try {
      await authApi.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Change Password" icon="lock-closed-outline">
      {success && (
        <View style={s.successBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#2ED573" />
          <Text style={s.successText}>Password changed successfully.</Text>
          <TouchableOpacity onPress={() => setSuccess(false)}>
            <Ionicons name="close" size={14} color="#2ED573" />
          </TouchableOpacity>
        </View>
      )}
      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <PasswordInput
        label="Current password"
        value={current}
        onChange={setCurrent}
        show={showCur}
        onToggleShow={() => setShowCur((v) => !v)}
      />

      <PasswordInput
        label="New password"
        value={next}
        onChange={setNext}
        show={showNew}
        onToggleShow={() => setShowNew((v) => !v)}
      />

      {/* Strength meter */}
      {next.length > 0 && (
        <View style={s.strengthWrap}>
          <View style={s.strengthBars}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[s.strengthBar, { backgroundColor: i < strength.score ? strength.color : '#243050' }]}
              />
            ))}
          </View>
          <Text style={[s.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
          {strength.suggestion ? <Text style={s.strengthSuggestion}>{strength.suggestion}</Text> : null}
        </View>
      )}

      {/* Inline validation hints */}
      {tooShort  && <Text style={s.hint}>At least 8 characters required.</Text>}
      {sameAsCur && <Text style={s.hint}>New password must differ from current.</Text>}

      <PasswordInput
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        show={showCon}
        onToggleShow={() => setShowCon((v) => !v)}
        error={mismatch ? 'Passwords do not match.' : undefined}
      />

      <TouchableOpacity
        style={[s.btn, !canSubmit && s.btnDisabled]}
        onPress={handleChange}
        disabled={!canSubmit}
      >
        {saving
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.btnText}>Change Password</Text>}
      </TouchableOpacity>

      {/* Sign out of other devices CTA — TODO: backend /auth/sessions DELETE */}
      {success && (
        <TouchableOpacity style={s.otherDevicesBtn} onPress={() => authApi.deleteAllSessions().catch(() => {})}>
          <Ionicons name="log-out-outline" size={15} color="#7A8CA0" />
          <Text style={s.otherDevicesText}>Sign out of other devices</Text>
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}

function PasswordInput({
  label, value, onChange, show, onToggleShow, error,
}: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggleShow: () => void; error?: string }) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputWrap, error && s.inputError]}>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          placeholder="••••••••"
          placeholderTextColor="#4A6080"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity onPress={onToggleShow} style={s.eyeBtn}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color="#7A8CA0" />
        </TouchableOpacity>
      </View>
      {error ? <Text style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  fieldWrap:   { marginBottom: 12 },
  label:       { color: '#C0CDE0', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A1628', borderRadius: 8, borderWidth: 1, borderColor: '#243050' },
  inputError:  { borderColor: '#FF4757' },
  input:       { flex: 1, padding: 12, color: '#fff', fontSize: 14 },
  eyeBtn:      { padding: 12 },
  fieldError:  { color: '#FF4757', fontSize: 12, marginTop: 4 },
  hint:        { color: '#F5A524', fontSize: 12, marginBottom: 8, marginTop: -6 },
  strengthWrap: { marginBottom: 12 },
  strengthBars: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  strengthBar:  { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel:     { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  strengthSuggestion:{ color: '#7A8CA0', fontSize: 12 },
  btn:         { backgroundColor: '#00B4D8', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.4 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0A2010', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#2ED573' },
  successText:   { color: '#2ED573', fontSize: 13, flex: 1 },
  errorText:     { color: '#FF4757', fontSize: 13, marginBottom: 10 },
  otherDevicesBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, justifyContent: 'center' },
  otherDevicesText:{ color: '#7A8CA0', fontSize: 13 },
});
