// Forgot password — mirrors frontend/src/components/auth/ForgotPasswordForm.jsx.
// POST /auth/forgot-password. Always shows the neutral "check your email" state
// (the backend never reveals whether the address exists).
import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
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
import { forgotSchema, ForgotValues } from '../../src/lib/validation';

export default function ForgotPassword() {
  const router = useRouter();
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const { control, handleSubmit, formState: { errors } } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async ({ email }: ForgotValues) => {
    setBanner('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSentTo(email.trim());
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 429) {
        setBanner('Too many reset requests. Please wait an hour before trying again.');
      } else if (isAxiosError(err) && !err.response) {
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

  if (sentTo) {
    return (
      <AuthScreen center>
        <ScreenTitle>Check your email</ScreenTitle>
        <SuccessBanner>
          If an account exists for {sentTo}, we've sent a reset link. It expires in 1 hour. Don't
          forget to check your spam folder.
        </SuccessBanner>
        <FooterText>
          <LinkText onPress={() => router.replace('/login')}>← Back to sign in</LinkText>
        </FooterText>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen center>
      <ScreenTitle>Forgot password?</ScreenTitle>
      <Subtitle>Enter your account email and we'll send you a link to reset your password.</Subtitle>

      <ErrorBanner>{banner}</ErrorBanner>

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
            textContentType="emailAddress"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.email?.message}
            returnKeyType="go"
            onSubmitEditing={handleSubmit(onSubmit)}
          />
        )}
      />

      <PrimaryButton
        label={loading ? 'Sending…' : 'Send reset link'}
        loading={loading}
        onPress={handleSubmit(onSubmit)}
      />

      <FooterText>
        <LinkText onPress={() => router.replace('/login')}>← Back to sign in</LinkText>
      </FooterText>
    </AuthScreen>
  );
}
