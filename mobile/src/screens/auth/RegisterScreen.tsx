import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardTypeOptions,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { authApi } from '../../services/api';
import { setAuth } from '../../store';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { registerPushToken } from '../../services/notifications';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

type FormFields = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  country: string;
  city: string;
};

type FieldConfig = {
  field: keyof FormFields;
  label: string;
  required?: boolean;
  keyboard?: KeyboardTypeOptions;
  secure?: boolean;
  cap?: 'none' | 'sentences' | 'words' | 'characters';
};

const FIELDS: FieldConfig[] = [
  { field: 'firstName', label: 'First Name', required: true },
  { field: 'lastName',  label: 'Last Name' },
  { field: 'email',     label: 'Email Address', required: true, keyboard: 'email-address', cap: 'none' },
  { field: 'password',  label: 'Password (min. 8 characters)', required: true, secure: true, cap: 'none' },
  { field: 'country',   label: 'Country you live in' },
  { field: 'city',      label: 'City' },
  { field: 'phone',     label: 'Phone (optional)', keyboard: 'phone-pad' },
];

function parseError(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { error?: string } } };
  if (!e.response) return "Can't reach the server. Check your internet connection.";
  const status = e.response.status ?? 0;
  if (status === 409) return e.response.data?.error ?? 'An account with that email already exists.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'Server error. Please try again shortly.';
  return e.response.data?.error ?? 'Something went wrong. Try again.';
}

export default function RegisterScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const [form, setForm] = useState<FormFields>({
    firstName: '', lastName: '', email: '', password: '',
    phone: '', country: '', city: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (field: keyof FormFields) => (val: string) => {
    setForm((f) => ({ ...f, [field]: val }));
    setError('');
  };

  const canSubmit = form.firstName.trim().length > 0
    && form.email.trim().length > 0
    && form.password.length >= 8
    && !loading;

  const handleRegister = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await authApi.register({
        ...form,
        email: form.email.trim().toLowerCase(),
      });
      if (!data?.token || !data?.pilot) {
        throw new Error('Server returned an unexpected response — contact support.');
      }
      await SecureStore.setItemAsync('authToken', data.token);
      dispatch(setAuth({ token: data.token, pilot: data.pilot }));
      registerPushToken(true);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message.includes('unexpected response')
        ? err.message
        : parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 50 }}>
      <Text style={s.title}>Create your account</Text>
      <Text style={s.subtitle}>Takes 1 minute — you'll set up your pilot details after.</Text>

      {FIELDS.map(({ field, label, required, keyboard, secure, cap }) => (
        <View key={field}>
          <Text style={s.label}>{label}{required ? '  *' : ''}</Text>
          <TextInput
            style={s.input}
            value={form[field]}
            onChangeText={set(field)}
            placeholder={label.split('(')[0].trim()}
            placeholderTextColor="#7A8CA0"
            secureTextEntry={!!secure}
            keyboardType={keyboard ?? 'default'}
            autoCapitalize={cap ?? (secure || keyboard === 'email-address' ? 'none' : 'words')}
            autoCorrect={false}
          />
        </View>
      ))}

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[s.btn, !canSubmit && s.btnDisabled]}
        onPress={handleRegister}
        disabled={!canSubmit}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>Create Account →</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={s.link}>Already have an account? <Text style={s.linkAccent}>Sign in</Text></Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0A1628', paddingHorizontal: 24, paddingTop: 60 },
  title:      { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 8 },
  subtitle:   { color: '#7A8CA0', fontSize: 14, marginBottom: 28, lineHeight: 20 },
  label:      { color: '#C0CDE0', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input:      { backgroundColor: '#1B2B4B', color: '#fff', borderRadius: 10, padding: 13, fontSize: 15 },
  errorText:  { color: '#FF4757', fontSize: 13, marginTop: 16, lineHeight: 18 },
  btn:        { backgroundColor: '#00B4D8', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 30, marginBottom: 20 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  link:       { color: '#7A8CA0', textAlign: 'center', fontSize: 14 },
  linkAccent: { color: '#00B4D8', fontWeight: '600' },
});
