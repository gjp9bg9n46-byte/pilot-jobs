// Profile edit — mirrors the Personal Information inline form in
// frontend/src/pages/Profile.jsx (the only part that PATCHes /profile).
// Fields, in web order: First Name, Last Name, Phone, Country, City, Education,
// Role, then a "Passport" subsection with Passport Expiry (date). NO passport
// NUMBER (removed on web). Web has no zod here (plain controlled form), so the
// schema is permissive — mobile mirrors that (all optional).
//
// Placed under app/(app)/profile/ (NOT the tabs group) so it pushes above the
// tab bar. Discard-changes confirmation on back when the form is dirty.
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DateTimePicker from '@react-native-community/datetimepicker';
import { isAxiosError } from 'axios';
import api from '../../../src/lib/api';
import { ErrorBanner, PrimaryButton, SelectField, TextField } from '../../../src/components/ui';
import { formatDate } from '../../../src/lib/profileLabels';
import { fontFamilies, fontSizes, pilot, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../src/theme/ThemeContext';

const EDUCATION_OPTIONS: [string, string][] = [
  ['', 'Not specified'], ['high_school', 'High School / GED'], ['technical', 'Technical / Vocational'],
  ['bachelor', "Bachelor's Degree"], ['masters', "Master's Degree"], ['doctorate', 'Doctorate'],
];
const ROLE_OPTIONS: [string, string][] = [['', 'Not specified'], ['FIRST_OFFICER', 'First Officer'], ['CAPTAIN', 'Captain']];

// Permissive — matches web (no validation on this form).
const editSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  education: z.string().optional(),
  role: z.string().optional(),
  passportExpiry: z.string().optional(),
});
type EditValues = z.infer<typeof editSchema>;

export default function ProfileEdit() {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDate, setShowDate] = useState(false);

  const { control, handleSubmit, reset, watch, setValue, formState: { isDirty } } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { firstName: '', lastName: '', phone: '', country: '', city: '', education: '', role: '', passportExpiry: '' },
  });

  useEffect(() => {
    api.get('/profile').then(({ data }) => {
      reset({
        firstName: data.firstName || '', lastName: data.lastName || '', phone: data.phone || '',
        country: data.country || '', city: data.city || '', education: data.education || '', role: data.role || '',
        passportExpiry: data.passportExpiry ? new Date(data.passportExpiry).toISOString().split('T')[0] : '',
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [reset]);

  // Discard-changes guard on hardware/gesture back.
  useEffect(() => {
    // expo-router's navigation is a React Navigation navigator; 'beforeRemove' +
    // dispatch aren't in the narrowed expo-router types, so we access via a cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigation as any;
    const sub = nav.addListener('beforeRemove', (e: { preventDefault: () => void; data: { action: unknown } }) => {
      if (!isDirty || submitting) return;
      e.preventDefault();
      Alert.alert('Discard changes?', 'You have unsaved changes that will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => nav.dispatch(e.data.action) },
      ]);
    });
    return sub;
  }, [navigation, isDirty, submitting]);

  const passportExpiry = watch('passportExpiry');

  const onSubmit = async (v: EditValues) => {
    setBanner('');
    setSubmitting(true);
    try {
      await api.patch('/profile', {
        firstName: v.firstName, lastName: v.lastName, phone: v.phone, country: v.country, city: v.city,
        education: v.education || null, role: v.role || '', passportExpiry: v.passportExpiry || '',
      });
      // toast-ish: brief confirm then back (the view refetches on focus).
      reset(v); // clear dirty so beforeRemove doesn't prompt
      router.back();
    } catch (err) {
      if (isAxiosError(err) && !err.response) setBanner("Couldn't reach the server — check your connection and try again.");
      else if (isAxiosError(err)) setBanner(err.response?.data?.error || 'Could not save your profile. Please try again.');
      else setBanner('Could not save your profile. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={pilot.navy} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.topTitle}>Edit Profile</Text>
        <View style={{ width: 54 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ErrorBanner>{banner}</ErrorBanner>

          <View style={{ gap: 16 }}>
            <Controller control={control} name="firstName" render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="First Name" autoCapitalize="words" value={value} onChangeText={onChange} onBlur={onBlur} />
            )} />
            <Controller control={control} name="lastName" render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Last Name" autoCapitalize="words" value={value} onChangeText={onChange} onBlur={onBlur} />
            )} />
            <Controller control={control} name="phone" render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Phone" keyboardType="phone-pad" value={value} onChangeText={onChange} onBlur={onBlur} />
            )} />
            <Controller control={control} name="country" render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Country" autoCapitalize="words" value={value} onChangeText={onChange} onBlur={onBlur} />
            )} />
            <Controller control={control} name="city" render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="City" autoCapitalize="words" value={value} onChangeText={onChange} onBlur={onBlur} />
            )} />
            <Controller control={control} name="education" render={({ field: { onChange, value } }) => (
              <SelectField label="Education" value={value || ''} options={EDUCATION_OPTIONS} placeholder="Not specified" onSelect={onChange} />
            )} />
            <Controller control={control} name="role" render={({ field: { onChange, value } }) => (
              <SelectField label="Role" value={value || ''} options={ROLE_OPTIONS} placeholder="Not specified" onSelect={onChange} />
            )} />
          </View>

          {/* Passport subsection (expiry only — no number) */}
          <Text style={styles.subhead}>PASSPORT</Text>
          <Text style={styles.fieldLabel}>Passport Expiry</Text>
          <Pressable style={styles.dateField} onPress={() => setShowDate(true)}>
            <Text style={passportExpiry ? styles.dateValue : styles.datePlaceholder}>
              {passportExpiry ? formatDate(passportExpiry) : 'Select date'}
            </Text>
          </Pressable>
          <Text style={styles.hint}>Used for expiry alerts</Text>
          {passportExpiry ? (
            <Pressable onPress={() => setValue('passportExpiry', '', { shouldDirty: true })}><Text style={styles.clearDate}>Clear date</Text></Pressable>
          ) : null}
          {showDate ? (
            <DateTimePicker
              value={passportExpiry ? new Date(passportExpiry) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_e, d) => {
                setShowDate(Platform.OS === 'ios');
                if (d) setValue('passportExpiry', d.toISOString().split('T')[0], { shouldDirty: true });
              }}
            />
          ) : null}

          <PrimaryButton label={submitting ? 'Saving…' : 'Save Changes'} loading={submitting} onPress={handleSubmit(onSubmit)} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: pilot.line },
  cancel: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  topTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.md, color: pilot.ink },
  content: { padding: spacing.xl, paddingBottom: 60 },
  subhead: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: pilot.muted, letterSpacing: 0.8, marginTop: 24, marginBottom: 12 },
  fieldLabel: { fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm, color: pilot.ink, marginBottom: 6 },
  dateField: { borderWidth: 1, borderColor: pilot.line, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: pilot.surface },
  dateValue: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: pilot.ink },
  datePlaceholder: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: '#9AA0A6' },
  hint: { color: pilot.muted, fontSize: fontSizes.xs, fontFamily: fontFamilies.body, marginTop: 4 },
  clearDate: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm, marginTop: 8 },
});
