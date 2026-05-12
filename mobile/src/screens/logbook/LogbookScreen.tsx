import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, RefreshControl, ActivityIndicator, TextInput, AppState,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { flightLogApi, profileApi } from '../../services/api';
import { setLogs, setTotals, appendLogs, removeLog, addLog } from '../../store';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { drainOutbox } from './AddLogScreen';

const OUTBOX_KEY = 'flightlog_outbox';
const PAGE_SIZE = 50;

// ─── Currency helpers ─────────────────────────────────────────────────────────

function useCurrency(logs: any[]) {
  return useMemo(() => {
    const now = Date.now();
    const d30 = now - 30 * 86_400_000;
    const d90 = now - 90 * 86_400_000;

    let hrs30 = 0, hrs90 = 0, dayLand90 = 0, nightLand90 = 0;
    let lastFlightMs = 0;

    for (const l of logs) {
      const t = new Date(l.date).getTime();
      if (t > lastFlightMs) lastFlightMs = t;
      if (t >= d90) {
        hrs90 += l.totalTime;
        dayLand90   += l.landingsDay;
        nightLand90 += l.landingsNight;
      }
      if (t >= d30) hrs30 += l.totalTime;
    }

    const daysSinceLast = lastFlightMs > 0 ? Math.floor((now - lastFlightMs) / 86_400_000) : null;
    return { hrs30, hrs90, dayLand90, nightLand90, daysSinceLast };
  }, [logs]);
}

// ─── Totals card ─────────────────────────────────────────────────────────────

function TotalsCard({ totals, currency }: any) {
  const { hrs30, hrs90, dayLand90, nightLand90, daysSinceLast } = currency;
  const dayCurrentBadge = dayLand90 >= 3
    ? { label: 'DAY CURRENT', color: '#00B4D8' }
    : { label: 'DAY NOT CURRENT', color: '#F5A524' };
  const nightCurrentBadge = nightLand90 >= 3
    ? { label: 'NIGHT CURRENT', color: '#00B4D8' }
    : { label: 'NIGHT NOT CURRENT', color: '#F5A524' };

  return (
    <View style={s.totalsCard}>
      <Text style={s.totalsTitle}>Flight Totals</Text>
      <View style={s.totalsRow}>
        {[
          { label: 'Total', value: totals.totalTime },
          { label: 'PIC',   value: totals.picTime },
          { label: 'Multi', value: totals.multiEngineTime },
          { label: 'Turbine', value: totals.turbineTime },
        ].map(({ label, value }) => (
          <View key={label} style={s.totalItem}>
            <Text style={s.totalValue}>{Number(value).toFixed(0)}</Text>
            <Text style={s.totalLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={s.divider} />

      <Text style={[s.totalsTitle, { fontSize: 12, marginBottom: 8 }]}>Currency (from loaded flights*)</Text>
      <View style={s.totalsRow}>
        {[
          { label: 'Last 30d', value: hrs30.toFixed(1) },
          { label: 'Last 90d', value: hrs90.toFixed(1) },
          { label: 'Ldgs (90d)', value: String(dayLand90 + nightLand90) },
          { label: 'Days since', value: daysSinceLast != null ? String(daysSinceLast) : '—' },
        ].map(({ label, value }) => (
          <View key={label} style={s.totalItem}>
            <Text style={[s.totalValue, { fontSize: 16 }]}>{value}</Text>
            <Text style={s.totalLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={s.badgeRow}>
        <View style={[s.badge, { borderColor: dayCurrentBadge.color }]}>
          <Text style={[s.badgeText, { color: dayCurrentBadge.color }]}>{dayCurrentBadge.label}</Text>
        </View>
        <View style={[s.badge, { borderColor: nightCurrentBadge.color }]}>
          <Text style={[s.badgeText, { color: nightCurrentBadge.color }]}>{nightCurrentBadge.label}</Text>
        </View>
      </View>
      <Text style={s.currencyNote}>* 3 landings in last 90 days. Not legal advice.</Text>
    </View>
  );
}

// ─── Log row with swipe actions ───────────────────────────────────────────────

interface LogRowProps {
  log: any;
  onDelete: () => void;
  onEdit: () => void;
  onClone: () => void;
  onReverse: () => void;
}

function LogRow({ log, onDelete, onEdit, onClone, onReverse }: LogRowProps) {
  const swipeRef = useRef<Swipeable>(null);
  const date = new Date(log.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const close = () => swipeRef.current?.close();

  const renderRight = () => (
    <View style={s.swipeContainer}>
      <TouchableOpacity
        style={[s.swipeBtn, { backgroundColor: '#00B4D8' }]}
        onPress={() => { close(); onEdit(); }}
      >
        <Ionicons name="create-outline" size={18} color="#fff" />
        <Text style={s.swipeBtnText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.swipeBtn, { backgroundColor: '#FF4757' }]}
        onPress={() => { close(); onDelete(); }}
      >
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <Text style={s.swipeBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLeft = () => (
    <View style={s.swipeContainer}>
      <TouchableOpacity
        style={[s.swipeBtn, { backgroundColor: '#1B2B4B', borderWidth: 1, borderColor: '#00B4D8' }]}
        onPress={() => { close(); onClone(); }}
      >
        <Ionicons name="copy-outline" size={18} color="#00B4D8" />
        <Text style={[s.swipeBtnText, { color: '#00B4D8' }]}>Dup</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.swipeBtn, { backgroundColor: '#1B2B4B', borderWidth: 1, borderColor: '#00B4D8' }]}
        onPress={() => { close(); onReverse(); }}
      >
        <Ionicons name="swap-horizontal-outline" size={18} color="#00B4D8" />
        <Text style={[s.swipeBtnText, { color: '#00B4D8' }]}>Flip</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRight} renderLeftActions={renderLeft} friction={2}>
      <View style={s.logRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.logDate}>{date}</Text>
          <Text style={s.logAircraft}>
            {log.aircraftType}{log.registration ? ` · ${log.registration}` : ''}
            {log.pending ? '  🔴 pending sync' : ''}
          </Text>
          {(log.departure || log.arrival) && (
            <Text style={s.logRoute}>{log.departure} → {log.arrival}</Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.logHours}>{Number(log.totalTime).toFixed(1)} hrs</Text>
          {log.picTime > 0 && <Text style={s.logSub}>PIC {Number(log.picTime).toFixed(1)}</Text>}
        </View>
      </View>
    </Swipeable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LogbookScreen({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { logs, totals, total } = useAppSelector((s) => s.logbook);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  const currency = useCurrency(logs);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.trim().toLowerCase();
    return logs.filter(
      (l) =>
        l.aircraftType?.toLowerCase().includes(q) ||
        l.registration?.toLowerCase().includes(q) ||
        l.departure?.toLowerCase().includes(q) ||
        l.arrival?.toLowerCase().includes(q),
    );
  }, [logs, search]);

  const fetchData = async (refresh = false) => {
    refresh ? setRefreshing(true) : undefined;
    try {
      const [logsRes, totalsRes] = await Promise.all([
        flightLogApi.list(1, PAGE_SIZE),
        profileApi.getTotals(),
      ]);
      dispatch(setLogs({ logs: logsRes.data.logs, total: logsRes.data.total }));
      dispatch(setTotals(totalsRes.data));
      setPage(1);
      setHasMore(logsRes.data.logs.length === PAGE_SIZE);
    } catch {
      // keep existing state visible
    } finally {
      refresh && setRefreshing(false);
    }
  };

  const fetchMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const { data } = await flightLogApi.list(nextPage, PAGE_SIZE);
      dispatch(appendLogs({ logs: data.logs, total: data.total }));
      setPage(nextPage);
      setHasMore(data.logs.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  const checkOutbox = async () => {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    const q = raw ? JSON.parse(raw) : [];
    setPendingCount(q.length);
  };

  const syncNow = async () => {
    await drainOutbox(dispatch);
    await checkOutbox();
    await fetchData(true);
  };

  useEffect(() => {
    fetchData();
    checkOutbox();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        drainOutbox(dispatch).then(checkOutbox);
      }
    });
    return () => sub.remove();
  }, []);

  const handleDelete = (id: string) => {
    Alert.alert('Delete Flight', 'Remove this log entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await flightLogApi.delete(id);
          dispatch(removeLog(id));
        },
      },
    ]);
  };

  const handleImport = () => {
    Alert.alert('Import Logbook', 'Choose logbook format', [
      { text: 'ForeFlight (CSV)', onPress: () => pickFile('FOREFLIGHT') },
      { text: 'Logbook Pro (CSV)', onPress: () => pickFile('LOGBOOK_PRO') },
      // TODO: backend — add parsers for LogTen Pro, MyFlightbook, generic CSV
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickFile = async (source: string) => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', '*/*'] });
    if (result.canceled) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('source', source);
      formData.append('file', {
        uri: result.assets[0].uri,
        name: result.assets[0].name,
        type: 'text/csv',
      } as any);
      const { data } = await flightLogApi.import(formData);
      Alert.alert('Import Complete', `${data.imported} flights imported`);
      fetchData(true);
    } catch {
      Alert.alert('Error', 'Import failed. Check file format.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={s.container}>
        {/* Header actions */}
        <View style={s.actions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('AddLog')}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.actionText}>Log Flight</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.secondaryBtn]} onPress={handleImport} disabled={importing}>
            {importing
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="cloud-upload-outline" size={18} color="#fff" /><Text style={s.actionText}>Import</Text></>
            }
          </TouchableOpacity>
          {pendingCount > 0 && (
            <TouchableOpacity style={[s.actionBtn, s.syncBtn]} onPress={syncNow}>
              <Ionicons name="cloud-upload" size={18} color="#F5A524" />
              <Text style={[s.actionText, { color: '#F5A524' }]}>Sync {pendingCount}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search */}
        <TextInput
          style={s.search}
          placeholder="Search by aircraft, reg, or airport…"
          placeholderTextColor="#4A6080"
          value={search}
          onChangeText={setSearch}
        />

        <FlatList
          data={filtered}
          keyExtractor={(l) => l.id}
          ListHeaderComponent={totals ? (
            <TotalsCard totals={totals} currency={currency} />
          ) : null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor="#00B4D8" />
          }
          renderItem={({ item }) => (
            <LogRow
              log={item}
              onDelete={() => handleDelete(item.id)}
              onEdit={() => navigation.navigate('AddLog', { logId: item.id, mode: 'edit', prefill: item })}
              onClone={() => navigation.navigate('AddLog', { mode: 'clone', prefill: item })}
              onReverse={() => navigation.navigate('AddLog', { mode: 'reverse', prefill: item })}
            />
          )}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color="#00B4D8" style={{ padding: 16 }} /> : null
          }
          ListEmptyComponent={
            !refreshing ? <Text style={s.empty}>No flights logged yet</Text> : null
          }
          contentContainerStyle={{ paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0A1628', paddingHorizontal: 16, paddingTop: 16 },

  totalsCard:   { backgroundColor: '#1B2B4B', borderRadius: 14, padding: 16, marginBottom: 12 },
  totalsTitle:  { color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 10 },
  totalsRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalItem:    { alignItems: 'center', flex: 1 },
  totalValue:   { color: '#00B4D8', fontSize: 20, fontWeight: '800' },
  totalLabel:   { color: '#7A8CA0', fontSize: 11, marginTop: 2 },
  divider:      { height: 1, backgroundColor: '#243050', marginVertical: 12 },
  badgeRow:     { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  badge:        { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:    { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  currencyNote: { color: '#4A6080', fontSize: 10, marginTop: 8 },

  actions:      { flexDirection: 'row', gap: 8, marginBottom: 10 },
  actionBtn:    { flex: 1, backgroundColor: '#00B4D8', borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  secondaryBtn: { backgroundColor: '#1B2B4B' },
  syncBtn:      { backgroundColor: '#1A1400', borderWidth: 1, borderColor: '#F5A524', flex: 0, paddingHorizontal: 14 },
  actionText:   { color: '#fff', fontWeight: '700', fontSize: 13 },

  search:       { backgroundColor: '#1B2B4B', color: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14 },

  logRow: {
    backgroundColor: '#1B2B4B', borderRadius: 10, padding: 14,
    marginBottom: 6, flexDirection: 'row', alignItems: 'center',
  },
  logDate:    { color: '#7A8CA0', fontSize: 12, marginBottom: 2 },
  logAircraft: { color: '#fff', fontWeight: '700', fontSize: 14 },
  logRoute:   { color: '#7A8CA0', fontSize: 12, marginTop: 2 },
  logHours:   { color: '#00B4D8', fontWeight: '800', fontSize: 16 },
  logSub:     { color: '#4A6080', fontSize: 11, marginTop: 2 },

  swipeContainer: { flexDirection: 'row', alignItems: 'center' },
  swipeBtn: {
    width: 72, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch', gap: 4, marginBottom: 6, borderRadius: 10,
  },
  swipeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  empty: { color: '#7A8CA0', textAlign: 'center', marginTop: 60, fontSize: 15 },
});
