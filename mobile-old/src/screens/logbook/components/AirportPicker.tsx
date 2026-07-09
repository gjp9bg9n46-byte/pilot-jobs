import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Modal, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Airport } from '../../../types/airport';

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

interface Props {
  label: string;
  value: string;           // ICAO code
  onSelect: (airport: Airport) => void;
  recentIcaos?: string[];  // from redux logs
}

export default function AirportPicker({ label, value, onSelect, recentIcaos = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allAirports, setAllAirports] = useState<Airport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debouncedQuery = useDebounce(query, 150);

  useEffect(() => {
    if (open && !loaded) {
      // Lazy-load on first open
      const data: Airport[] = require('../../../data/airports.json');
      setAllAirports(data);
      setLoaded(true);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const recentAirports = useMemo(
    () => allAirports.filter((a) => recentIcaos.includes(a.icao)).slice(0, 8),
    [allAirports, recentIcaos],
  );

  const results = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allAirports
      .filter(
        (a) =>
          a.icao.toLowerCase().includes(q) ||
          a.iata.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [debouncedQuery, allAirports]);

  const handleSelect = (airport: Airport) => {
    onSelect(airport);
    setOpen(false);
    setQuery('');
  };

  const AirportRow = ({ item }: { item: Airport }) => (
    <TouchableOpacity style={s.row} onPress={() => handleSelect(item)}>
      <View style={s.rowCodes}>
        <Text style={s.icao}>{item.icao}</Text>
        <Text style={s.iata}>· {item.iata}</Text>
      </View>
      <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity style={s.trigger} onPress={() => setOpen(true)}>
        <Text style={s.triggerLabel}>{label}</Text>
        <View style={s.triggerBody}>
          <Text style={[s.triggerCode, !value && s.placeholder]}>
            {value || 'ICAO / IATA / Name'}
          </Text>
          <Ionicons name="search-outline" size={14} color="#00B4D8" />
        </View>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{label}</Text>
            <TouchableOpacity onPress={() => { setOpen(false); setQuery(''); }}>
              <Ionicons name="close" size={24} color="#7A8CA0" />
            </TouchableOpacity>
          </View>

          <TextInput
            ref={inputRef}
            style={s.search}
            value={query}
            onChangeText={setQuery}
            placeholder="ICAO, IATA, or airport name…"
            placeholderTextColor="#4A6080"
            autoCapitalize="characters"
            returnKeyType="search"
          />

          {!loaded && <ActivityIndicator color="#00B4D8" style={{ marginTop: 20 }} />}

          {loaded && (
            <FlatList
              data={debouncedQuery.trim().length >= 2 ? results : recentAirports}
              keyExtractor={(a) => a.icao}
              ListHeaderComponent={
                debouncedQuery.trim().length < 2 && recentAirports.length > 0 ? (
                  <Text style={s.sectionLabel}>Recently used</Text>
                ) : null
              }
              ListEmptyComponent={
                debouncedQuery.trim().length >= 2 ? (
                  <Text style={s.empty}>No airports found for "{debouncedQuery}"</Text>
                ) : (
                  <Text style={s.empty}>Type at least 2 characters to search</Text>
                )
              }
              renderItem={({ item }) => <AirportRow item={item} />}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  trigger:       { flex: 1 },
  triggerLabel:  { color: '#C0CDE0', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  triggerBody:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0A1628', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#243050',
  },
  triggerCode:   { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  placeholder:   { color: '#4A6080', fontSize: 14, fontWeight: '400' },

  modal:         { flex: 1, backgroundColor: '#0A1628', paddingTop: 16 },
  modalHeader:   {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#243050',
  },
  modalTitle:    { color: '#fff', fontWeight: '700', fontSize: 17 },
  search:        {
    margin: 16, backgroundColor: '#1B2B4B', color: '#fff', borderRadius: 10,
    padding: 13, fontSize: 15,
  },
  sectionLabel:  { color: '#4A6080', fontSize: 12, fontWeight: '600', paddingHorizontal: 16, paddingBottom: 8, letterSpacing: 0.5 },
  row:           {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1B2B4B',
  },
  rowCodes:      { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 90 },
  icao:          { color: '#00B4D8', fontWeight: '800', fontSize: 15 },
  iata:          { color: '#4A6080', fontSize: 13 },
  rowName:       { color: '#C0CDE0', fontSize: 13, flex: 1 },
  empty:         { color: '#4A6080', textAlign: 'center', marginTop: 40, fontSize: 14 },
});
