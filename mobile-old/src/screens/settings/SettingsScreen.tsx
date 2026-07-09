import React, { useEffect, useState } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { profileApi } from '../../services/api';
import { logout } from '../../store';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import NotificationsSection from './sections/NotificationsSection';
import PreferencesSection   from './sections/PreferencesSection';
import PasswordSection      from './sections/PasswordSection';
import DeleteAccountSection from './sections/DeleteAccountSection';
import AppearanceSection    from './sections/AppearanceSection';
import PrivacySection       from './sections/PrivacySection';
import SecuritySection      from './sections/SecuritySection';
import DataSection          from './sections/DataSection';
import SupportSection       from './sections/SupportSection';
import type { NotificationPrefs, JobPrefs } from '../../types/preferences';
import { DEFAULT_NOTIF_PREFS, DEFAULT_JOB_PREFS } from '../../types/preferences';
import type { PrivacyPrefs } from './sections/PrivacySection';

export default function SettingsScreen() {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(true);
  const [pilotEmail, setPilotEmail]   = useState('');
  const [typeRatings, setTypeRatings] = useState<string[]>([]);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [jobPrefs,   setJobPrefs]   = useState<JobPrefs>(DEFAULT_JOB_PREFS);
  const [privPrefs,  setPrivPrefs]  = useState<PrivacyPrefs>({
    profileVisible: true,
    anonymousBrowsing: false,
    showSeniority: true,
  });

  useEffect(() => {
    profileApi.get()
      .then(({ data }) => {
        setPilotEmail(data.email ?? '');
        setTypeRatings((data.ratings ?? []).map((r: any) => r.aircraftType));

        const p = data.preferences;
        if (p) {
          setNotifPrefs((prev) => ({
            ...prev,
            allPush:  p.notifyPush  ?? true,
            allEmail: p.notifyEmail ?? true,
            // TODO: backend — hydrate granular category fields once migration is deployed
          }));
          setJobPrefs((prev) => ({
            ...prev,
            preferredCountries: p.preferredCountries ?? [],
            preferredAircraft:  p.preferredAircraft  ?? [],
            minSalary:          p.minSalary ?? null,
            // TODO: backend — hydrate minSalaryCurrency, minSalaryPeriod, contractTypes, routes
          }));
        }

        // TODO: backend — hydrate privPrefs once privacy fields exist on Pilot model
        // setPrivPrefs({ profileVisible: data.profileVisible ?? true, ... });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('authToken');
          dispatch(logout());
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#00B4D8" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>

      <NotificationsSection
        prefs={notifPrefs}
        onChange={setNotifPrefs}
      />

      <PreferencesSection
        prefs={jobPrefs}
        typeRatings={typeRatings}
        onChange={setJobPrefs}
      />

      <PasswordSection />

      <AppearanceSection />

      <PrivacySection
        prefs={privPrefs}
        onChange={setPrivPrefs}
      />

      <SecuritySection />

      <DataSection />

      <SupportSection />

      <DeleteAccountSection pilotEmail={pilotEmail} />

      {/* Sign out — bottom of settings is the conventional location */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#FF4757" />
        <Text style={s.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628' },
  content:   { paddingBottom: 60 },
  center:    { flex: 1, backgroundColor: '#0A1628', justifyContent: 'center', alignItems: 'center' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, marginTop: 24, padding: 14, backgroundColor: '#1B2B4B', borderRadius: 12 },
  logoutText:{ color: '#FF4757', fontWeight: '600', fontSize: 15 },
});
