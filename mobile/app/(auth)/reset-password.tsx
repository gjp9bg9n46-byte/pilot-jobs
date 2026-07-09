// Reset password — mirrors frontend/src/components/auth/ResetPasswordForm.jsx.
// Reads ?token= from the deep link (cockpithire://reset-password?token=XXX or an
// in-app push). POST /auth/reset-password { token, newPassword }. On success,
// redirects to /login with a notice toast.
import { useEffect, useState } from 'react';
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
  PrimaryButton,
  ScreenTitle,
  Subtitle,
  SuccessBanner,
  TextField,
} from '../../src/components/ui';
import api from '../../src/lib/api';
import { resetSchema, ResetValues } from '../../src/lib/validation';

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : undefined;

  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });

  // After success, redirect to sign-in (matches web's 2s auto-redirect).
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      router.replace({
        pathname: '/login',
        params: { notice: 'Password reset. Sign in with your new password.' },
      });
    }, 2000);
    return () => clearTimeout(t);
  }, [done, router]);

  // No token in the link → dead-end with a way back.
  if (!token) {
    return (
      <AuthScreen center>
        <ScreenTitle>Reset password</ScreenTitle>
        <ErrorBanner>Invalid reset link. Request a new one.</ErrorBanner>
        <FooterText>
          <LinkText onPress={() => router.replace('/forgot-password')}>
            Request a new reset link →
          </LinkText>
        </FooterText>
      </AuthScreen>
    );
  }

  const onSubmit = async ({ password }: ResetValues) => {
    setBanner('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      if (isAxiosError(err) && !err.response) {
        setBanner("Couldn't reach the server — check your connection and try again.");
      } else if (isAxiosError(err)) {
        setBanner(err.response?.data?.error || 'Something went wrong. Please try again.');
      } else {
        setBanner('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthScreen center>
        <ScreenTitle>Password updated</ScreenTitle>
        <SuccessBanner>Password updated. Redirecting to sign-in…</SuccessBanner>
        <FooterText>
          <LinkText
            onPress={() =>
              router.replace({
                pathname: '/login',
                params: { notice: 'Password reset. Sign in with your new password.' },
              })
            }
          >
            Go to sign in now →
          </LinkText>
        </FooterText>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen center>
      <ScreenTitle>Reset password</ScreenTitle>
      <Subtitle>Choose a new password for your account. At least 8 characters.</Subtitle>

      <ErrorBanner>{banner}</ErrorBanner>

      <View style={{ gap: 18 }}>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="New password" placeholder="••••••••" secureTextEntry autoCapitalize="none"
              textContentType="newPassword" value={value} onChangeText={onChange} onBlur={onBlur}
              error={errors.password?.message} />
          )}
        />
        <Controller
          control={control}
          name="confirm"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Confirm new password" placeholder="••••••••" secureTextEntry autoCapitalize="none"
              textContentType="newPassword" value={value} onChangeText={onChange} onBlur={onBlur}
              error={errors.confirm?.message} returnKeyType="go" onSubmitEditing={handleSubmit(onSubmit)} />
          )}
        />
      </View>

      <PrimaryButton
        label={loading ? 'Updating…' : 'Update password'}
        loading={loading}
        onPress={handleSubmit(onSubmit)}
      />

      <FooterText>
        <LinkText onPress={() => router.replace('/login')}>← Back to sign in</LinkText>
      </FooterText>
    </AuthScreen>
  );
}
