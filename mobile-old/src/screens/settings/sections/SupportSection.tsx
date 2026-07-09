import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { SectionCard } from './shared';

// TODO: install expo-web-browser for in-app web views (expo install expo-web-browser)
// import * as WebBrowser from 'expo-web-browser';

const SUPPORT_EMAIL = 'support@pilotjobs.app';
const HELP_URL      = 'https://help.pilotjobs.app';
const TERMS_URL     = 'https://pilotjobs.app/terms';
const PRIVACY_URL   = 'https://pilotjobs.app/privacy';

async function openUrl(url: string) {
  const ok = await Linking.canOpenURL(url);
  if (ok) Linking.openURL(url);
  else Alert.alert('Cannot open', url);
}

export default function SupportSection() {
  const version = Constants.expoConfig?.version ?? '—';
  const build   = (Constants.expoConfig?.ios?.buildNumber
    || Constants.expoConfig?.android?.versionCode
    || Constants.nativeAppVersion
    || '—') as string;

  return (
    <SectionCard title="Support & Legal" icon="help-circle-outline">
      <SupportRow
        icon="chatbubble-ellipses-outline"
        label="Contact support"
        onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=PilotJobs support request`)}
      />
      <SupportRow
        icon="book-outline"
        label="Help center"
        onPress={() => openUrl(HELP_URL)}
      />
      <SupportRow
        icon="star-outline"
        label="Send feedback"
        onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=PilotJobs feedback`)}
      />
      <SupportRow
        icon="document-text-outline"
        label="Terms of Service"
        onPress={() => openUrl(TERMS_URL)}
      />
      <SupportRow
        icon="shield-outline"
        label="Privacy Policy"
        onPress={() => openUrl(PRIVACY_URL)}
      />
      <SupportRow
        icon="code-slash-outline"
        label="Open-source licences"
        onPress={() => Alert.alert('Licences', 'Third-party licence list coming soon.')}
      />
      <View style={s.versionRow}>
        <Text style={s.versionText}>Version {version} ({build})</Text>
      </View>
    </SectionCard>
  );
}

function SupportRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress}>
      <Ionicons name={icon as any} size={18} color="#7A8CA0" style={{ marginRight: 12 }} />
      <Text style={s.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#4A6080" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#243050' },
  label:      { color: '#C0CDE0', fontSize: 14, flex: 1 },
  versionRow: { paddingTop: 14, alignItems: 'center' },
  versionText:{ color: '#4A6080', fontSize: 12 },
});
