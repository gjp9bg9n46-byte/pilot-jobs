import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { jobApi } from '../../services/api';
import { setAlerts, markAlertRead } from '../../store';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { matchLabel } from '../../utils/matchLabel';

export default function AlertsScreen({ navigation }: any) {
  const dispatch = useAppDispatch();
  const alerts = useAppSelector((s) => s.jobs.alerts);
  const unread = alerts.filter((a) => !a.readAt).length;
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async (refresh = false) => {
    refresh && setRefreshing(true);
    try {
      const { data } = await jobApi.getAlerts();
      dispatch(setAlerts(data));
    } finally {
      refresh && setRefreshing(false);
    }
  };

  useEffect(() => { fetchAlerts(); }, []);

  const handlePress = async (alert: any) => {
    if (!alert.readAt) {
      await jobApi.markRead(alert.id);
      dispatch(markAlertRead(alert.id));
    }
    navigation.navigate('Jobs', { screen: 'JobDetail', params: { job: alert.job } });
  };

  return (
    <View style={s.container}>
      <Text style={s.header}>My Job Alerts</Text>
      {unread > 0 && (
        <View style={s.unreadBanner}>
          <Ionicons name="notifications" size={16} color="#0A1628" />
          <Text style={s.unreadBannerText}>
            {unread} new {unread === 1 ? 'job matches' : 'job matches'} since your last visit
          </Text>
        </View>
      )}

      <FlatList
        data={alerts}
        keyExtractor={(a) => a.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchAlerts(true)} tintColor="#00B4D8" />
        }
        renderItem={({ item }) => {
          const match = matchLabel(item.matchScore);
          const isUnread = !item.readAt;
          return (
            <TouchableOpacity
              style={[s.card, isUnread && s.cardUnread]}
              onPress={() => handlePress(item)}
              activeOpacity={0.8}
            >
              {isUnread && <View style={s.unreadDot} />}
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.jobTitle} numberOfLines={2}>{item.job.title}</Text>
                  <Text style={s.airline}>{item.job.company}</Text>
                  <View style={s.metaRow}>
                    <Ionicons name="location-outline" size={13} color="#7A8CA0" />
                    <Text style={s.metaText}>{item.job.location}</Text>
                  </View>
                </View>
                <View style={[s.scoreBadge, { borderColor: match.color }]}>
                  <Text style={[s.scoreNumber, { color: match.color }]}>{Math.round(item.matchScore)}%</Text>
                  <Text style={[s.scoreLabel, { color: match.color }]}>{match.text}</Text>
                </View>
              </View>
              <Text style={s.tapHint}>Tap to view full job →</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="notifications-off-outline" size={52} color="#4A6080" />
            <Text style={s.emptyTitle}>No alerts yet</Text>
            <Text style={s.emptySubtext}>
              Once you complete your profile, we'll notify you whenever a job matches your licences and hours.
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628', paddingHorizontal: 16, paddingTop: 60 },
  header: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 16 },
  unreadBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#00B4D8', borderRadius: 10, padding: 12, marginBottom: 16,
  },
  unreadBannerText: { color: '#0A1628', fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: '#1B2B4B', borderRadius: 14, padding: 16, marginBottom: 10, position: 'relative' },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: '#00B4D8' },
  unreadDot: { position: 'absolute', top: 14, right: 14, width: 9, height: 9, borderRadius: 5, backgroundColor: '#00B4D8' },
  cardTop: { flexDirection: 'row', gap: 12 },
  jobTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 4, lineHeight: 21 },
  airline: { color: '#00B4D8', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#7A8CA0', fontSize: 12 },
  scoreBadge: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minWidth: 80,
  },
  scoreNumber: { fontSize: 22, fontWeight: '800' },
  scoreLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  tapHint: { color: '#4A6080', fontSize: 12, marginTop: 10, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 30, gap: 14 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  emptySubtext: { color: '#7A8CA0', fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
