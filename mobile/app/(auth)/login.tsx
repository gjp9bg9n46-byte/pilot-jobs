// Login — mirrors frontend/src/pages/auth/Login.jsx copy.
//
// Web has separate pilot (/login) and employer (/employer/login) pages. Mobile
// uses ONE login: it tries pilot login first, then falls back to employer login
// on a 401, so a returning employer can still sign in. On success the router gate
// redirects by accountType. (Deviation from web's two-page split — see report.)
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import {
  AuthScreen,
  ErrorBanner,
  FooterText,
  LinkText,
  Logo,
  PrimaryButton,
  Subtitle,
  SuccessBanner,
  TextField,
} from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { loginSchema, LoginValues } from '../../src/lib/validation';
import { employerDest } from '../../src/lib/employerNav';

export default function Login() {
  const router = useRouter();
  const { loginPilot, loginEmployer } = useAuth();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async ({ email, password }: LoginValues) => {
    setBanner('');
    setLoading(true);
    try {
      let dest = '/jobs';
      try {
        const pilot = await loginPilot(email, password);
        if (pilot.isAdmin) dest = '/admin/dashboard'; // operator-only dark surface
      } catch (err) {
        // Pilot 401 → try employer login with the same credentials.
        if (isAxiosError(err) && err.response?.status === 401) {
          const employer = await loginEmployer(email, password);
          dest = employerDest(employer.status);
        } else {
          throw err;
        }
      }
      router.replace(dest);
    } catch (err) {
      if (isAxiosError(err) && !err.response) {
        setBanner("Couldn't reach the server — check your connection and try again.");
      } else if (isAxiosError(err)) {
        setBanner(err.response?.data?.error || 'Invalid credentials');
      } else {
        setBanner('Invalid credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen center>
      <Logo />
      <Subtitle>Aviation careers worldwide, matched to your licence.</Subtitle>

      {notice ? <View style={{ marginBottom: 16 }}><SuccessBanner>{notice}</SuccessBanner></View> : null}
      <ErrorBanner>{banner}</ErrorBanner>

      <View style={{ gap: 18 }}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Email address"
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              returnKeyType="next"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              returnKeyType="go"
              onSubmitEditing={handleSubmit(onSubmit)}
            />
          )}
        />
      </View>

      <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
        <LinkText onPress={() => router.push('/forgot-password')}>Forgot password?</LinkText>
      </View>

      <PrimaryButton
        label={loading ? 'Signing in…' : 'Sign In →'}
        loading={loading}
        onPress={handleSubmit(onSubmit)}
      />

      <FooterText>Don't have an account?</FooterText>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 }}>
        <LinkText onPress={() => router.push('/register-pilot')}>Sign up as Pilot</LinkText>
        <LinkText onPress={() => router.push('/register-employer')}>Sign up as Employer</LinkText>
      </View>
    </AuthScreen>
  );
}
