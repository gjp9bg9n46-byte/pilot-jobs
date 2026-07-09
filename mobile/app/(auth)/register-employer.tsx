// Employer registration — mirrors frontend/src/pages/employer/EmployerRegister.jsx.
// Field order + copy + validation preserved. POST /employers/register → log in →
// /(app)/employer/pending-approval (NOT a dashboard).
import { useState } from 'react';
import { Text, View } from 'react-native';
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
  SelectField,
  Subtitle,
  TextField,
} from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { employerRegisterSchema, EmployerRegisterValues } from '../../src/lib/validation';
import { COMPANY_TYPES, DESC_MAX } from '../../src/lib/employerTypes';
import { fontFamilies, fontSizes, pilot } from '../../src/theme/tokens';

export default function RegisterEmployer() {
  const router = useRouter();
  const { registerEmployer } = useAuth();
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, watch, setError, formState: { errors } } =
    useForm<EmployerRegisterValues>({
      resolver: zodResolver(employerRegisterSchema),
      defaultValues: {
        companyName: '', companyType: '', country: '', headquartersCity: '', website: '',
        description: '', contactName: '', contactEmail: '', contactPhone: '', password: '', confirmPassword: '',
      },
    });

  const descLen = (watch('description') || '').length;

  const onSubmit = async (v: EmployerRegisterValues) => {
    setBanner('');
    setLoading(true);
    try {
      const payload = {
        companyName: v.companyName.trim(),
        companyType: v.companyType,
        country: v.country.trim(),
        contactName: v.contactName.trim(),
        contactEmail: v.contactEmail.trim(),
        password: v.password,
        ...(v.headquartersCity?.trim() ? { headquartersCity: v.headquartersCity.trim() } : {}),
        ...(v.website?.trim() ? { website: v.website.trim() } : {}),
        ...(v.description?.trim() ? { description: v.description.trim() } : {}),
        ...(v.contactPhone?.trim() ? { contactPhone: v.contactPhone.trim() } : {}),
      };
      await registerEmployer(payload);
      router.replace('/employer/pending-approval');
    } catch (err) {
      if (isAxiosError(err) && !err.response) {
        setBanner("Couldn't reach the server — check your connection and try again.");
      } else if (isAxiosError(err) && err.response?.status === 409) {
        setBanner('An employer account already exists for this email. Try logging in.');
      } else if (isAxiosError(err) && err.response?.status === 400 && Array.isArray(err.response?.data?.errors)) {
        for (const x of err.response.data.errors) {
          if (x.path) setError(x.path as keyof EmployerRegisterValues, { message: x.msg || 'Invalid value' });
        }
        setBanner('Please correct the highlighted fields.');
      } else if (isAxiosError(err)) {
        setBanner(err.response?.data?.error || 'Could not create your account. Please try again.');
      } else {
        setBanner('Could not create your account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <ScreenTitle variant="employer">Employer registration</ScreenTitle>
      <Subtitle>For airlines and recruiters — post pilot jobs directly to our pilot-facing Jobs page.</Subtitle>

      <ErrorBanner>{banner}</ErrorBanner>

      <View style={{ gap: 16 }}>
        <Controller control={control} name="companyName" render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Company Name" required placeholder="e.g. Skyline Charter" autoCapitalize="words"
            textContentType="organizationName" value={value} onChangeText={onChange} onBlur={onBlur}
            error={errors.companyName?.message} />
        )} />

        <Controller control={control} name="companyType" render={({ field: { onChange, value } }) => (
          <SelectField label="Company Type" required value={value} options={COMPANY_TYPES}
            placeholder="Select a type…" onSelect={onChange} error={errors.companyType?.message} />
        )} />

        <Controller control={control} name="country" render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Country" required placeholder="e.g. Portugal" autoCapitalize="words"
            textContentType="countryName" value={value} onChangeText={onChange} onBlur={onBlur}
            error={errors.country?.message} />
        )} />

        <Controller control={control} name="headquartersCity" render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Headquarters City" placeholder="e.g. Lisbon" autoCapitalize="words"
            value={value} onChangeText={onChange} onBlur={onBlur} error={errors.headquartersCity?.message} />
        )} />

        <Controller control={control} name="website" render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Website" placeholder="https://example.com" keyboardType="url" autoCapitalize="none"
            autoCorrect={false} value={value} onChangeText={onChange} onBlur={onBlur} error={errors.website?.message} />
        )} />

        <View>
          <Controller control={control} name="description" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Description" placeholder="Tell pilots about your operation (optional)." multiline
              numberOfLines={3} maxLength={DESC_MAX} style={{ minHeight: 90, textAlignVertical: 'top' }}
              value={value} onChangeText={onChange} onBlur={onBlur} error={errors.description?.message} />
          )} />
          <Text style={styles.counter}>{descLen}/{DESC_MAX}</Text>
        </View>

        <Controller control={control} name="contactName" render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Contact Name" required placeholder="Your full name" autoCapitalize="words"
            textContentType="name" value={value} onChangeText={onChange} onBlur={onBlur}
            error={errors.contactName?.message} />
        )} />

        <Controller control={control} name="contactEmail" render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Contact Email" required placeholder="you@company.com" keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} textContentType="emailAddress"
            value={value} onChangeText={onChange} onBlur={onBlur} error={errors.contactEmail?.message} />
        )} />

        <Controller control={control} name="contactPhone" render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Contact Phone" placeholder="+1 555 0100" keyboardType="phone-pad"
            textContentType="telephoneNumber" value={value} onChangeText={onChange} onBlur={onBlur}
            error={errors.contactPhone?.message} />
        )} />

        <Controller control={control} name="password" render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Password" required placeholder="••••••••" secureTextEntry autoCapitalize="none"
            textContentType="newPassword" value={value} onChangeText={onChange} onBlur={onBlur}
            error={errors.password?.message} />
        )} />

        <Controller control={control} name="confirmPassword" render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Confirm Password" required placeholder="••••••••" secureTextEntry autoCapitalize="none"
            textContentType="newPassword" value={value} onChangeText={onChange} onBlur={onBlur}
            error={errors.confirmPassword?.message} />
        )} />
      </View>

      <PrimaryButton
        label={loading ? 'Creating account…' : 'Create Employer Account →'}
        loading={loading}
        onPress={handleSubmit(onSubmit)}
      />

      <FooterText>
        Already have an account? <LinkText onPress={() => router.replace('/login')}>Sign in →</LinkText>
      </FooterText>
      <Text style={styles.pilotFooter}>
        Are you a pilot? <LinkText onPress={() => router.replace('/register-pilot')}>Register here →</LinkText>
      </Text>
    </AuthScreen>
  );
}

const styles = {
  counter: { color: pilot.muted, fontSize: fontSizes.xs, fontFamily: fontFamilies.body, marginTop: 5, textAlign: 'right' as const },
  pilotFooter: { textAlign: 'center' as const, marginTop: 14, color: pilot.muted, fontSize: fontSizes.sm, fontFamily: fontFamilies.body },
};
