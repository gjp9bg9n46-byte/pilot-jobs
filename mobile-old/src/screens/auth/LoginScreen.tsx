import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { authApi } from '../../services/api';
import { setAuth } from '../../store';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { registerPushToken } from '../../services/notifications';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

function parseError(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { error?: string } } };
  if (!e.response) return "Can't reach the server. Check your internet connection.";
  const status = e.response.status ?? 0;
  if (status === 401 || status === 403) return 'Invalid email or password.';
  if (status === 429) return 'Too many sign-in attempts. Try again in a few minutes.';
  if (status >= 500) return 'Server error. Please try again shortly.';
  return e.response.data?.error ?? 'Check your email and password and try again.';
}

export default function LoginScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await authApi.login(email.trim().toLowerCase(), password);
      if (!data?.token || !data?.pilot) {
        throw new Error('Server returned an unexpected response — contact support.');
      }
      await SecureStore.setItemAsync('authToken', data.token);
      dispatch(setAuth({ token: data.token, pilot: data.pilot }));
      // Request push permission now that the user is signed in.
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
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.logo}>✈  CockpitHire</Text>
      <Text style={s.tagline}>Jobs worldwide, matched to your licence</Text>

      <Text style={s.label}>Email</Text>
      <TextInput
        style={s.input}
        placeholder="your@email.com"
        placeholderTextColor="#7A8CA0"
        value={email}
        onChangeText={(v) => { setEmail(v); setError(''); }}
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
      />

      <Text style={s.label}>Password</Text>
      <TextInput
        style={s.input}
        placeholder="••••••••"
        placeholderTextColor="#7A8CA0"
        value={password}
        onChangeText={(v) => { setPassword(v); setError(''); }}
        secureTextEntry
      />

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[s.btn, !canSubmit && s.btnDisabled]}
        onPress={handleLogin}
        disabled={!canSubmit}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>Sign In</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={s.link}>New here? <Text style={s.linkAccent}>Create a free account</Text></Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0A1628', justifyContent: 'center', paddingHorizontal: 28 },
  logo:       { fontSize: 32, fontWeight: '800', color: '#00B4D8', textAlign: 'center', marginBottom: 6 },
  tagline:    { color: '#7A8CA0', textAlign: 'center', marginBottom: 44, fontSize: 14 },
  label:      { color: '#C0CDE0', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input:      { backgroundColor: '#1B2B4B', color: '#fff', borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 15 },
  errorText:  { color: '#FF4757', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  btn:        { backgroundColor: '#00B4D8', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4, marginBottom: 22 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  link:       { color: '#7A8CA0', textAlign: 'center', fontSize: 14 },
  linkAccent: { color: '#00B4D8', fontWeight: '600' },
});
