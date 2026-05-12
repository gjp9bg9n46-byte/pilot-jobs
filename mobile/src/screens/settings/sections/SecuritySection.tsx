import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../../services/api';
import { SectionCard, ComingSoonRow, NavRow } from './shared';

interface Session {
  id: string;
  deviceLabel: string;
  lastIp: string;
  lastCity: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

export default function SecuritySection() {
  // TODO: backend — GET /auth/sessions endpoint needed; shows stub until ready
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [signingOut, setSigningOut] = useState<string | null>(null);

  useEffect(() => {
    authApi.getSessions()
      .then(({ data }) => setSessions(data))
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, []);

  const signOutSession = async (id: string) => {
    setSigningOut(id);
    try {
      await authApi.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // silently fail, user sees no change
    } finally {
      setSigningOut(null);
    }
  };

  const signOutAll = async () => {
    try {
      await authApi.deleteAllSessions();
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } catch {}
  };

  return (
    <SectionCard title="Security" icon="shield-outline">
      {/* 2FA — Coming soon */}
      <ComingSoonRow label="Two-factor authentication (TOTP)" />

      {/* Connected accounts */}
      <Text style={s.groupLabel}>CONNECTED ACCOUNTS</Text>
      <View style={s.connectedRow}>
        <Ionicons name="logo-apple" size={18} color="#C0CDE0" />
        <Text style={s.connectedLabel}>Apple</Text>
        <Text style={s.connectedStatus}>Not linked</Text>
        {/* TODO: backend — Apple OAuth flow */}
      </View>
      <View style={s.connectedRow}>
        <Ionicons name="logo-google" size={18} color="#C0CDE0" />
        <Text style={s.connectedLabel}>Google</Text>
        <Text style={s.connectedStatus}>Not linked</Text>
        {/* TODO: backend — Google OAuth flow */}
      </View>

      {/* Active sessions */}
      <Text style={[s.groupLabel, { marginTop: 16 }]}>ACTIVE SESSIONS</Text>
      {loadingSessions && <ActivityIndicator color="#00B4D8" style={{ marginVertical: 8 }} />}
      {!loadingSessions && sessions.length === 0 && (
        <Text style={s.empty}>
          Session list requires backend support (GET /auth/sessions).
        </Text>
      )}
      {sessions.map((sess) => (
        <View key={sess.id} style={s.sessionRow}>
          <Ionicons
            name={sess.isCurrent ? 'phone-portrait-outline' : 'tablet-portrait-outline'}
            size={18}
            color={sess.isCurrent ? '#00B4D8' : '#7A8CA0'}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.sessionDevice}>{sess.deviceLabel ?? 'Unknown device'}{sess.isCurrent ? '  (this device)' : ''}</Text>
            <Text style={s.sessionMeta}>
              {sess.lastCity ?? sess.lastIp ?? 'Unknown location'}
              {' · '}
              {new Date(sess.lastUsedAt).toLocaleDateString()}
            </Text>
          </View>
          {!sess.isCurrent && (
            <TouchableOpacity onPress={() => signOutSession(sess.id)} disabled={signingOut === sess.id}>
              {signingOut === sess.id
                ? <ActivityIndicator color="#FF4757" size="small" />
                : <Text style={s.signOutBtn}>Sign out</Text>}
            </TouchableOpacity>
          )}
        </View>
      ))}
      {sessions.length > 1 && (
        <TouchableOpacity style={s.signOutAllBtn} onPress={signOutAll}>
          <Text style={s.signOutAllText}>Sign out of all other devices</Text>
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}

const s = StyleSheet.create({
  groupLabel:    { color: '#4A6080', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 14, marginBottom: 8 },
  connectedRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#243050' },
  connectedLabel:{ color: '#C0CDE0', fontSize: 14, flex: 1 },
  connectedStatus:{ color: '#4A6080', fontSize: 13 },
  sessionRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#243050' },
  sessionDevice: { color: '#C0CDE0', fontSize: 13, fontWeight: '600' },
  sessionMeta:   { color: '#7A8CA0', fontSize: 12, marginTop: 2 },
  signOutBtn:    { color: '#FF4757', fontSize: 13, fontWeight: '600' },
  signOutAllBtn: { marginTop: 10, alignItems: 'center' },
  signOutAllText:{ color: '#FF4757', fontSize: 13 },
  empty:         { color: '#4A6080', fontSize: 13, fontStyle: 'italic', marginVertical: 6 },
});
