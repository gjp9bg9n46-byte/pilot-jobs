import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Variant = 'no-profile' | 'no-searches' | 'watching';

interface Props {
  variant: Variant;
  watchingCount?: number;
  onAction?: () => void;
}

const CONFIG: Record<Variant, {
  icon: any;
  title: string;
  body: (count?: number) => string;
  cta: string;
}> = {
  'no-profile': {
    icon: 'person-circle-outline',
    title: 'Complete your profile',
    body: () => 'Add your certificates, ratings, and hours so we can match you with the right jobs.',
    cta: 'Go to Profile',
  },
  'no-searches': {
    icon: 'notifications-off-outline',
    title: 'No alert rules yet',
    body: () => 'Create a saved search to get notified when jobs matching your criteria are posted.',
    cta: 'Create alert',
  },
  'watching': {
    icon: 'eye-outline',
    title: 'All caught up',
    body: (count) => count ? `Watching ${count} active posting${count !== 1 ? 's' : ''}.` : 'No new matches right now.',
    cta: 'Browse all jobs',
  },
};

export default function AlertsEmptyState({ variant, watchingCount, onAction }: Props) {
  const cfg = CONFIG[variant];

  return (
    <View style={s.container}>
      <Ionicons name={cfg.icon} size={56} color="#243050" />
      <Text style={s.title}>{cfg.title}</Text>
      <Text style={s.body}>{cfg.body(watchingCount)}</Text>
      {onAction && (
        <TouchableOpacity style={s.btn} onPress={onAction}>
          <Text style={s.btnText}>{cfg.cta}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 18, fontWeight: '700', color: '#E8F0F8', marginTop: 16, marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, color: '#7A8CA0', textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 20, backgroundColor: '#00B4D8', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
