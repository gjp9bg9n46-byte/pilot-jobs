// Pilot registration — mirrors frontend/src/pages/auth/Register.jsx.
// Field order + copy preserved. POST /auth/register → log in → /(app)/profile
// (with the VerifyEmailBanner showing).
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
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
  TextField,
} from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { pilotRegisterSchema, PilotRegisterValues } from '../../src/lib/validation';

export default function RegisterPilot() {
  const router = useRouter();
  const { registerPilot } = useAuth();
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<PilotRegisterValues>({
    resolver: zodResolver(pilotRegisterSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', country: '', city: '', phone: '' },
  });

  const onSubmit = async (values: PilotRegisterValues) => {
    setBanner('');
    setLoading(true);
    try {
      await registerPilot({
        firstName: values.firstName,
        lastName: values.lastName || undefined,
        email: values.email,
        password: values.password,
        country: values.country || undefined,
        city: values.city || undefined,
        phone: values.phone || undefined,
      });
      router.replace('/profile');
    } catch (err) {
      if (isAxiosError(err) && !err.response) {
        setBanner("Couldn't reach the server — check your connection and try again.");
      } else if (isAxiosError(err) && Array.isArray(err.response?.data?.errors) && err.response?.data.errors.length) {
        setBanner(err.response.data.errors[0].msg || 'Please check your details and try again.');
      } else if (isAxiosError(err)) {
        setBanner(err.response?.data?.error || 'Could not create account. Try again.');
      } else {
        setBanner('Could not create account. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <Logo />
      <Subtitle>Create your free account — you'll add your pilot details after sign-up.</Subtitle>

      <ErrorBanner>{banner}</ErrorBanner>

      <View style={{ gap: 16 }}>
        <Controller
          control={control}
          name="firstName"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="First Name" required autoCapitalize="words" textContentType="givenName"
              value={value} onChangeText={onChange} onBlur={onBlur} error={errors.firstName?.message} />
          )}
        />
        <Controller
          control={control}
          name="lastName"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Last Name" autoCapitalize="words" textContentType="familyName"
              value={value} onChangeText={onChange} onBlur={onBlur} error={errors.lastName?.message} />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Email Address" required keyboardType="email-address" autoCapitalize="none"
              autoCorrect={false} textContentType="emailAddress" placeholder="Email Address"
              value={value} onChangeText={onChange} onBlur={onBlur} error={errors.email?.message} />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Password" required hint="Min. 8 characters" secureTextEntry autoCapitalize="none"
              textContentType="newPassword" placeholder="••••••••"
              value={value} onChangeText={onChange} onBlur={onBlur} error={errors.password?.message} />
          )}
        />
        <Controller
          control={control}
          name="country"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Country" autoCapitalize="words" textContentType="countryName"
              value={value} onChangeText={onChange} onBlur={onBlur} error={errors.country?.message} />
          )}
        />
        <Controller
          control={control}
          name="city"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="City" autoCapitalize="words"
              value={value} onChangeText={onChange} onBlur={onBlur} error={errors.city?.message} />
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Phone (optional)" keyboardType="phone-pad" textContentType="telephoneNumber"
              value={value} onChangeText={onChange} onBlur={onBlur} error={errors.phone?.message} />
          )}
        />
      </View>

      <PrimaryButton
        label={loading ? 'Creating account…' : 'Create Account →'}
        loading={loading}
        onPress={handleSubmit(onSubmit)}
      />

      <FooterText>
        Already have an account? <LinkText onPress={() => router.replace('/login')}>Sign in</LinkText>
      </FooterText>
    </AuthScreen>
  );
}
