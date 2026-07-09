import React, { useRef, useState } from 'react';
import {
  View, Text, Switch, TouchableOpacity, StyleSheet, Linking,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { authApi, profileApi } from '../../../services/api';
import { useAutoSave } from '../../../hooks/useAutoSave';
import type { NotificationPrefs, NotifChannel } from '../../../types/preferences';
import { SectionCard, Row, Toast } from './shared';

// Category rows in the matrix
const CATEGORIES: {
  key: keyof Pick<NotificationPrefs, 'matches' | 'savedAlerts' | 'applications' | 'expiries' | 'digest' | 'productUpdates'>;
  label: string;
  hasPush: boolean;
  hasEmail: boolean;
}[] = [
  { key: 'matches',        label: 'New matched jobs',                 hasPush: true,  hasEmail: true  },
  { key: 'savedAlerts',    label: 'Saved-search alerts',              hasPush: true,  hasEmail: false },
  { key: 'applications',   label: 'Application status updates',       hasPush: true,  hasEmail: true  },
  { key: 'expiries',       label: 'Expiry reminders',                 hasPush: true,  hasEmail: true  },
  { key: 'digest',         label: 'Weekly digest',                    hasPush: false, hasEmail: true  },
  { key: 'productUpdates', label: 'Product updates from our team',    hasPush: false, hasEmail: true  },
];

interface Props {
  prefs: NotificationPrefs;
  onChange: (p: NotificationPrefs) => void;
}

export default function NotificationsSection({ prefs, onChange }: Props) {
  const [permDenied, setPermDenied] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };

  const persist = useAutoSave<NotificationPrefs>(async (p) => {
    try {
      // Master toggles map to backend-ready notifyPush / notifyEmail
      await profileApi.updatePreferences({
        notifyPush:  p.allPush,
        notifyEmail: p.allEmail,
        // TODO: backend — granular categories once migration is deployed
        // notifyMatchesPush: p.matches.push, notifyMatchesEmail: p.matches.email,
        // notifyAlertsPush: p.savedAlerts.push,
        // notifyApplicationsPush: p.applications.push, notifyApplicationsEmail: p.applications.email,
        // notifyExpiriesPush: p.expiries.push, notifyExpiriesEmail: p.expiries.email,
        // notifyDigestEmail: p.digest.email,
        // notifyProductUpdatesEmail: p.productUpdates.email,
        // quietHoursEnabled: p.quietHoursEnabled, quietHoursStart: p.quietHoursStart,
        // quietHoursEnd: p.quietHoursEnd, quietHoursTz: p.quietHoursTz,
      });
    } catch {
      showToast('Could not save — check your connection');
    }
  }, 400);

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    onChange(next);
    persist(next);
  };

  const updateChannel = (key: string, field: 'push' | 'email', val: boolean) => {
    const next: NotificationPrefs = {
      ...prefs,
      [key]: { ...(prefs as any)[key], [field]: val },
    };
    onChange(next);
    persist(next);
  };

  const handlePushMaster = async (on: boolean) => {
    if (on) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermDenied(true);
        return;
      }
      setPermDenied(false);
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        await authApi.updateFcmToken(tokenData.data);
      } catch {
        showToast('Could not register for push notifications');
        return;
      }
    } else {
      try {
        await authApi.updateFcmToken(null);
      } catch {
        showToast('Could not update push settings');
      }
    }
    update({ allPush: on });
  };

  return (
    <SectionCard title="Notifications" icon="notifications-outline">
      {toast ? <Toast message={toast} /> : null}

      {/* Master toggles */}
      <Text style={s.groupLabel}>MASTER CONTROLS</Text>
      <Row label="All push notifications" value={prefs.allPush} onToggle={handlePushMaster} />
      <Row label="All email alerts" value={prefs.allEmail} onToggle={(v) => update({ allEmail: v })} />

      {permDenied && (
        <View style={s.permRow}>
          <Ionicons name="warning-outline" size={14} color="#F5A524" />
          <Text style={s.permText}>Push permission denied. Enable it in system settings.</Text>
          <TouchableOpacity onPress={() => Linking.openSettings()}>
            <Text style={s.permLink}>Open settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Per-category matrix */}
      <Text style={[s.groupLabel, { marginTop: 16 }]}>PER CATEGORY</Text>
      {/* Header row */}
      {prefs.allPush || prefs.allEmail ? (
        <>
          <View style={s.matrixHeader}>
            <Text style={[s.matrixCell, s.matrixCategoryCol]} />
            <Text style={s.matrixHeaderCell}>Push</Text>
            <Text style={s.matrixHeaderCell}>Email</Text>
          </View>
          {CATEGORIES.map((cat) => (
            <View key={cat.key} style={s.matrixRow}>
              <Text style={s.matrixLabel}>{cat.label}</Text>
              <View style={s.matrixSwitch}>
                {cat.hasPush ? (
                  <Switch
                    value={prefs.allPush && (prefs[cat.key] as NotifChannel).push}
                    onValueChange={(v) => updateChannel(cat.key, 'push', v)}
                    disabled={!prefs.allPush}
                    trackColor={{ false: '#243050', true: '#00B4D8' }}
                    thumbColor="#fff"
                    style={s.smallSwitch}
                  />
                ) : <View style={s.smallSwitch} />}
              </View>
              <View style={s.matrixSwitch}>
                {cat.hasEmail ? (
                  <Switch
                    value={prefs.allEmail && (prefs[cat.key] as NotifChannel).email}
                    onValueChange={(v) => updateChannel(cat.key, 'email', v)}
                    disabled={!prefs.allEmail}
                    trackColor={{ false: '#243050', true: '#00B4D8' }}
                    thumbColor="#fff"
                    style={s.smallSwitch}
                  />
                ) : <View style={s.smallSwitch} />}
              </View>
            </View>
          ))}
        </>
      ) : (
        <Text style={s.disabledNote}>Enable push or email above to configure individual categories.</Text>
      )}

      {/* Quiet hours — TODO: backend for quietHoursEnabled/Start/End/Tz fields */}
      <Text style={[s.groupLabel, { marginTop: 16 }]}>QUIET HOURS (PUSH)</Text>
      <Row
        label="Enable quiet hours"
        value={prefs.quietHoursEnabled}
        onToggle={(v) => update({ quietHoursEnabled: v })}
      />
      {prefs.quietHoursEnabled && (
        <View style={s.quietRow}>
          <View style={s.quietField}>
            <Text style={s.quietLabel}>From</Text>
            <TouchableOpacity style={s.quietInput} onPress={() => { /* TODO: time picker */ }}>
              <Text style={s.quietValue}>{prefs.quietHoursStart}</Text>
              <Ionicons name="time-outline" size={14} color="#7A8CA0" />
            </TouchableOpacity>
          </View>
          <View style={s.quietField}>
            <Text style={s.quietLabel}>To</Text>
            <TouchableOpacity style={s.quietInput} onPress={() => { /* TODO: time picker */ }}>
              <Text style={s.quietValue}>{prefs.quietHoursEnd}</Text>
              <Ionicons name="time-outline" size={14} color="#7A8CA0" />
            </TouchableOpacity>
          </View>
          <View style={[s.quietField, { flex: 2 }]}>
            <Text style={s.quietLabel}>Timezone</Text>
            <Text style={[s.quietValue, { fontSize: 11 }]} numberOfLines={1}>{prefs.quietHoursTz}</Text>
          </View>
        </View>
      )}
    </SectionCard>
  );
}

const s = StyleSheet.create({
  groupLabel: { color: '#4A6080', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  permRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1A1400', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#F5A524', marginTop: 8 },
  permText:   { color: '#F5A524', fontSize: 12, flex: 1 },
  permLink:   { color: '#00B4D8', fontSize: 12, fontWeight: '600' },
  matrixHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  matrixCell:   { flex: 1 },
  matrixCategoryCol: { flex: 3 },
  matrixHeaderCell:  { width: 52, textAlign: 'center', color: '#7A8CA0', fontSize: 11, fontWeight: '700' },
  matrixRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#243050' },
  matrixLabel:  { flex: 3, color: '#C0CDE0', fontSize: 13 },
  matrixSwitch: { width: 52, alignItems: 'center' },
  smallSwitch:  { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },
  disabledNote: { color: '#4A6080', fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  quietRow:   { flexDirection: 'row', gap: 10, marginTop: 8 },
  quietField: { flex: 1 },
  quietLabel: { color: '#7A8CA0', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  quietInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0A1628', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#243050' },
  quietValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
