import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { jobApi } from '../../services/api';
import {
  setAlerts, appendAlerts, markAlertRead, markAllAlertsRead,
  dismissAlert as dismissAlertAction, setSavedIds, toggleSavedId,
  setSavedSearches, addSavedSearch, updateSavedSearch, removeSavedSearch,
} from '../../store';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { groupAlertsByDate } from '../../types/alert';
import type { JobAlert, AlertFilter, AlertSort, SavedSearch } from '../../types/alert';
import { ALERT_FILTER_LABELS, ALERT_SORT_LABELS } from '../../types/alert';
import type { FilterState } from '../../types/job';
import type { AlertFrequency } from '../../types/alert';

import AlertCard from './components/AlertCard';
import SavedSearchRow from './components/SavedSearchRow';
import NewAlertSheet from './components/NewAlertSheet';
import AlertsEmptyState from './components/AlertsEmptyState';

const TABS = ['Matches', 'Saved Searches', 'Applications'] as const;
type TabName = typeof TABS[number];

const FILTER_OPTIONS: AlertFilter[] = ['all', 'unread', 'saved', 'dismissed'];
const SORT_OPTIONS: AlertSort[] = ['newest', 'score', 'deadline'];

export default function AlertsScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<any>();

  const alerts = useAppSelector((s) => s.jobs.alerts);
  const alertsTotal = useAppSelector((s) => s.jobs.alertsTotal);
  const savedIds = useAppSelector((s) => s.jobs.savedIds);
  const savedSearches = useAppSelector((s) => s.savedSearches.items);
  const pilot = useAppSelector((s) => s.auth.pilot);

  const [tab, setTab] = useState<TabName>('Matches');
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [sort, setSort] = useState<AlertSort>('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);

  const LIMIT = 20;

  // ── Fetch alerts ──────────────────────────────────────────────────────────
  const fetchAlerts = useCallback(async (p: number, refresh = false) => {
    if (refresh) setRefreshing(true);
    else if (p > 1) setLoadingMore(true);
    setError(null);
    try {
      const { data } = await jobApi.getAlerts({ page: p, limit: LIMIT, filter, sort });
      if (p === 1) {
        dispatch(setAlerts({ alerts: data.alerts, total: data.total }));
      } else {
        dispatch(appendAlerts({ alerts: data.alerts, total: data.total }));
      }
      setPage(p);
    } catch {
      setError('Failed to load alerts. Pull to retry.');
    } finally {
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [filter, sort, dispatch]);

  useEffect(() => { fetchAlerts(1); }, [fetchAlerts]);

  // ── Fetch saved searches ──────────────────────────────────────────────────
  useEffect(() => {
    jobApi.getSavedSearches()
      .then(({ data }) => dispatch(setSavedSearches(data)))
      .catch(() => {});
  }, [dispatch]);

  // ── Fetch saved job ids ───────────────────────────────────────────────────
  useEffect(() => {
    jobApi.getSaved()
      .then(({ data }) => dispatch(setSavedIds(data.map((j: any) => j.id))))
      .catch(() => {});
  }, [dispatch]);

  // ── Alert actions ─────────────────────────────────────────────────────────
  const handlePressAlert = useCallback(async (alert: JobAlert) => {
    if (!alert.readAt) {
      dispatch(markAlertRead(alert.id));
      jobApi.markRead(alert.id).catch(() => dispatch(markAlertRead(alert.id)));
    }
    navigation.navigate('Jobs', { screen: 'JobDetail', params: { job: alert.job } });
  }, [dispatch, navigation]);

  const handleSaveAlert = useCallback(async (alert: JobAlert) => {
    const wasSaved = savedIds.includes(alert.jobId);
    dispatch(toggleSavedId(alert.jobId));
    try {
      if (wasSaved) await jobApi.unsaveJob(alert.jobId);
      else await jobApi.saveJob(alert.jobId);
    } catch {
      dispatch(toggleSavedId(alert.jobId));
    }
  }, [savedIds, dispatch]);

  const handleDismissAlert = useCallback(async (alert: JobAlert) => {
    dispatch(dismissAlertAction(alert.id));
    try {
      await jobApi.dismissAlert(alert.id);
    } catch {
      // revert is complex — just re-fetch on next load
    }
  }, [dispatch]);

  const handleMarkAllRead = useCallback(async () => {
    dispatch(markAllAlertsRead());
    try {
      await jobApi.markAllRead();
    } catch {}
  }, [dispatch]);

  // ── Saved search actions ──────────────────────────────────────────────────
  const handleCreateSearch = useCallback(async (data: { name: string; filters: FilterState; frequency: AlertFrequency }) => {
    try {
      const { data: created } = await jobApi.createSavedSearch(data);
      dispatch(addSavedSearch(created));
    } catch {
      Alert.alert('Error', 'Could not save the alert rule. Please try again.');
    }
  }, [dispatch]);

  const handleUpdateSearch = useCallback(async (data: { name: string; filters: FilterState; frequency: AlertFrequency }) => {
    if (!editingSearch) return;
    const id = editingSearch.id;
    dispatch(updateSavedSearch({ id, ...data }));
    try {
      await jobApi.updateSavedSearch(id, data);
    } catch {
      Alert.alert('Error', 'Could not update the alert rule.');
    }
    setEditingSearch(null);
  }, [editingSearch, dispatch]);

  const handlePauseToggle = useCallback(async (item: SavedSearch) => {
    dispatch(updateSavedSearch({ id: item.id, paused: !item.paused }));
    try {
      await jobApi.updateSavedSearch(item.id, { paused: !item.paused });
    } catch {
      dispatch(updateSavedSearch({ id: item.id, paused: item.paused }));
    }
  }, [dispatch]);

  const handleDeleteSearch = useCallback((item: SavedSearch) => {
    Alert.alert('Delete alert?', `"${item.name}" will be deleted and you won't receive matches for it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          dispatch(removeSavedSearch(item.id));
          try { await jobApi.deleteSavedSearch(item.id); } catch {}
        },
      },
    ]);
  }, [dispatch]);

  const handleTapSearch = useCallback((item: SavedSearch) => {
    navigation.navigate('Jobs', { screen: 'JobsList', params: { prefilters: item.filters } });
  }, [navigation]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const unreadCount = alerts.filter((a: any) => !a.readAt && !a.dismissedAt).length;
  const sections = groupAlertsByDate(alerts as JobAlert[]);
  const hasMore = alerts.length < alertsTotal;
  const profileComplete = !!(pilot?.certificates?.length || pilot?.totalHours);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Alerts</Text>
        {tab === 'Matches' && unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={s.markAllBtn}>
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {tab === 'Saved Searches' && (
          <TouchableOpacity onPress={() => { setEditingSearch(null); setSheetVisible(true); }} style={s.addBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Segmented control */}
      <View style={s.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabItem, tab === t && s.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
            {t === 'Matches' && unreadCount > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{unreadCount}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Matches tab */}
      {tab === 'Matches' && (
        <>
          {/* Filter + Sort row */}
          <View style={s.controlRow}>
            <View style={s.filterChips}>
              {FILTER_OPTIONS.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[s.filterChip, filter === f && s.filterChipActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[s.filterChipText, filter === f && s.filterChipTextActive]}>
                    {ALERT_FILTER_LABELS[f]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.sortBtn} onPress={() => setSortOpen((v) => !v)}>
              <Ionicons name="swap-vertical" size={16} color="#7A8CA0" />
            </TouchableOpacity>
          </View>

          {sortOpen && (
            <View style={s.sortMenu}>
              {SORT_OPTIONS.map((o) => (
                <TouchableOpacity key={o} style={s.sortOption} onPress={() => { setSort(o); setSortOpen(false); }}>
                  <Text style={[s.sortOptionText, sort === o && s.sortOptionActive]}>
                    {ALERT_SORT_LABELS[o]}
                  </Text>
                  {sort === o && <Ionicons name="checkmark" size={16} color="#00B4D8" />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {error ? (
            <View style={s.errorBox}>
              <Ionicons name="warning-outline" size={20} color="#FF4757" />
              <Text style={s.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => fetchAlerts(1)}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => fetchAlerts(1, true)}
                  tintColor="#00B4D8"
                />
              }
              onEndReached={() => { if (hasMore && !loadingMore) fetchAlerts(page + 1); }}
              onEndReachedThreshold={0.3}
              renderSectionHeader={({ section }) => (
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>{section.title}</Text>
                  {section.unreadCount > 0 && (
                    <View style={s.sectionBadge}>
                      <Text style={s.sectionBadgeText}>{section.unreadCount} unread</Text>
                    </View>
                  )}
                </View>
              )}
              renderItem={({ item }) => (
                <AlertCard
                  alert={item}
                  onPress={handlePressAlert}
                  onSave={handleSaveAlert}
                  onDismiss={handleDismissAlert}
                />
              )}
              ListEmptyComponent={
                !refreshing ? (
                  <AlertsEmptyState
                    variant={!profileComplete ? 'no-profile' : 'watching'}
                    watchingCount={alertsTotal}
                    onAction={
                      !profileComplete
                        ? () => navigation.navigate('Profile')
                        : () => navigation.navigate('Jobs', { screen: 'JobsList' })
                    }
                  />
                ) : null
              }
              ListFooterComponent={loadingMore ? <ActivityIndicator color="#00B4D8" style={{ margin: 16 }} /> : null}
              contentContainerStyle={sections.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
            />
          )}
        </>
      )}

      {/* Saved Searches tab */}
      {tab === 'Saved Searches' && (
        <SectionList
          sections={savedSearches.length > 0 ? [{ title: '', data: savedSearches }] : []}
          keyExtractor={(item) => item.id}
          renderSectionHeader={() => null}
          renderItem={({ item }) => (
            <SavedSearchRow
              item={item}
              onTap={handleTapSearch}
              onEdit={(s) => { setEditingSearch(s); setSheetVisible(true); }}
              onPauseToggle={handlePauseToggle}
              onDelete={handleDeleteSearch}
            />
          )}
          ListEmptyComponent={
            <AlertsEmptyState
              variant="no-searches"
              onAction={() => { setEditingSearch(null); setSheetVisible(true); }}
            />
          }
          contentContainerStyle={savedSearches.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
      )}

      {/* Applications tab */}
      {tab === 'Applications' && (
        <View style={s.stubWrap}>
          <Ionicons name="document-text-outline" size={56} color="#243050" />
          <Text style={s.stubTitle}>Applications coming soon</Text>
          <Text style={s.stubBody}>Track your job applications and follow-ups in one place.</Text>
        </View>
      )}

      {/* New / Edit alert sheet */}
      <NewAlertSheet
        visible={sheetVisible}
        existing={editingSearch}
        onClose={() => { setSheetVisible(false); setEditingSearch(null); }}
        onSave={editingSearch ? handleUpdateSearch : handleCreateSearch}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1628', paddingTop: 56 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 12,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#E8F0F8' },
  markAllBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  markAllText: { fontSize: 13, color: '#00B4D8', fontWeight: '600' },
  addBtn: { backgroundColor: '#00B4D8', borderRadius: 8, padding: 6 },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#243050', marginBottom: 4 },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 6 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: '#00B4D8' },
  tabText: { fontSize: 13, color: '#7A8CA0', fontWeight: '500' },
  tabTextActive: { color: '#00B4D8', fontWeight: '700' },
  tabBadge: { backgroundColor: '#00B4D8', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  tabBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },

  controlRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  filterChips: { flex: 1, flexDirection: 'row', gap: 6 },
  filterChip: { borderWidth: 1, borderColor: '#243050', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  filterChipActive: { backgroundColor: '#00B4D822', borderColor: '#00B4D8' },
  filterChipText: { fontSize: 12, color: '#7A8CA0' },
  filterChipTextActive: { color: '#00B4D8', fontWeight: '600' },
  sortBtn: { borderWidth: 1, borderColor: '#243050', borderRadius: 8, padding: 6 },

  sortMenu: {
    backgroundColor: '#1B2B4B', borderRadius: 10, marginHorizontal: 16,
    marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#243050',
  },
  sortOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#243050',
  },
  sortOptionText: { fontSize: 14, color: '#A8BDD0' },
  sortOptionActive: { color: '#00B4D8', fontWeight: '600' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#7A8CA0', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBadge: { backgroundColor: '#00B4D822', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  sectionBadgeText: { fontSize: 11, color: '#00B4D8', fontWeight: '600' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FF475722', borderRadius: 10, margin: 16, padding: 12,
  },
  errorText: { flex: 1, fontSize: 13, color: '#FF4757' },
  retryText: { fontSize: 13, color: '#00B4D8', fontWeight: '600' },

  stubWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  stubTitle: { fontSize: 18, fontWeight: '700', color: '#E8F0F8', marginTop: 16, marginBottom: 8, textAlign: 'center' },
  stubBody: { fontSize: 14, color: '#7A8CA0', textAlign: 'center', lineHeight: 20 },
});
