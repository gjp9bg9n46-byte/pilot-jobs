import React, { useState } from 'react';
import { View, Text, Switch, TouchableOpacity, TextInput, StyleSheet, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Ionicons name={icon as any} size={20} color="#00B4D8" />
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function Row({
  label, value, onToggle, sublabel,
}: { label: string; value: boolean; onToggle: (v: boolean) => void; sublabel?: string }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {sublabel ? <Text style={s.rowSub}>{sublabel}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#243050', true: '#00B4D8' }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <View style={s.toast}>
      <Ionicons name="checkmark-circle-outline" size={14} color="#2ED573" />
      <Text style={s.toastText}>{message}</Text>
    </View>
  );
}

export function SavedLine({ savedAt }: { savedAt: Date | null }) {
  if (!savedAt) return null;
  const secs = Math.round((Date.now() - savedAt.getTime()) / 1000);
  const label = secs < 5 ? 'just now' : `${secs}s ago`;
  return (
    <Text style={s.savedLine}>Saved {label}</Text>
  );
}

export function NavRow({ label, sublabel, onPress, danger }: { label: string; sublabel?: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={s.navRow} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[s.navLabel, danger && { color: '#FF4757' }]}>{label}</Text>
        {sublabel ? <Text style={s.navSub}>{sublabel}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#4A6080" />
    </TouchableOpacity>
  );
}

export function ComingSoonRow({ label }: { label: string }) {
  return (
    <View style={s.navRow}>
      <Text style={s.navLabel}>{label}</Text>
      <View style={s.badge}><Text style={s.badgeText}>Coming soon</Text></View>
    </View>
  );
}

// Searchable multi-select picker modal
interface PickerItem { value: string; label: string }
interface MultiPickerProps {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selected: string[];
  pinnedSection?: { title: string; items: PickerItem[] };
  onClose: () => void;
  onConfirm: (sel: string[]) => void;
}

export function MultiPickerModal({ visible, title, items, selected, pinnedSection, onClose, onConfirm }: MultiPickerProps) {
  const [query, setQuery] = useState('');
  const [local, setLocal] = useState<string[]>(selected);

  React.useEffect(() => { if (visible) setLocal(selected); }, [visible]);

  const filtered = items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()) || i.value.toLowerCase().includes(query.toLowerCase()));
  const toggle = (v: string) => setLocal((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  const renderItem = ({ item }: { item: PickerItem }) => {
    const on = local.includes(item.value);
    return (
      <TouchableOpacity style={[ms.item, on && ms.itemActive]} onPress={() => toggle(item.value)}>
        <Text style={[ms.itemText, on && ms.itemTextActive]}>{item.label}</Text>
        {on && <Ionicons name="checkmark" size={16} color="#00B4D8" />}
      </TouchableOpacity>
    );
  };

  const pinnedFiltered = pinnedSection
    ? pinnedSection.items.filter((i) => !query || i.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={ms.container}>
        <View style={ms.header}>
          <TouchableOpacity onPress={onClose}><Text style={ms.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={ms.title}>{title}</Text>
          <TouchableOpacity onPress={() => { onConfirm(local); onClose(); }}>
            <Text style={ms.done}>Done ({local.length})</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={ms.search}
          placeholder="Search…"
          placeholderTextColor="#4A6080"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        <FlatList
          data={[
            ...(pinnedSection && pinnedFiltered.length > 0 ? [{ value: '__pinned_header__', label: pinnedSection.title }] : []),
            ...(pinnedSection && pinnedFiltered.length > 0 ? pinnedFiltered : []),
            ...(pinnedSection && pinnedFiltered.length > 0 && filtered.length > 0 ? [{ value: '__all_header__', label: 'All' }] : []),
            ...filtered,
          ]}
          keyExtractor={(i) => i.value}
          renderItem={({ item }) => {
            if (item.value.startsWith('__') && item.value.endsWith('__')) {
              return <Text style={ms.sectionHeader}>{item.label}</Text>;
            }
            return renderItem({ item });
          }}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card:       { margin: 16, marginBottom: 0, backgroundColor: '#1B2B4B', borderRadius: 14, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  cardTitle:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#243050' },
  rowLabel:   { color: '#C0CDE0', fontSize: 14 },
  rowSub:     { color: '#7A8CA0', fontSize: 12, marginTop: 2 },
  toast:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0A2010', borderRadius: 6, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: '#2ED573' },
  toastText:  { color: '#2ED573', fontSize: 12, flex: 1 },
  savedLine:  { color: '#4A6080', fontSize: 11, textAlign: 'right', marginTop: 6 },
  navRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#243050' },
  navLabel:   { color: '#C0CDE0', fontSize: 14, flex: 1 },
  navSub:     { color: '#7A8CA0', fontSize: 12, marginTop: 2 },
  badge:      { backgroundColor: '#0A2F50', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { color: '#00B4D8', fontSize: 11, fontWeight: '600' },
});

const ms = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0A1628' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#1B2B4B', borderBottomWidth: 1, borderBottomColor: '#243050' },
  title:         { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancel:        { color: '#7A8CA0', fontSize: 15 },
  done:          { color: '#00B4D8', fontWeight: '700', fontSize: 15 },
  search:        { margin: 12, backgroundColor: '#1B2B4B', borderRadius: 8, padding: 12, color: '#fff', borderWidth: 1, borderColor: '#243050', fontSize: 15 },
  sectionHeader: { color: '#4A6080', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#0A1628' },
  item:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1B2B4B' },
  itemActive:    { backgroundColor: '#0A2040' },
  itemText:      { flex: 1, color: '#C0CDE0', fontSize: 14 },
  itemTextActive:{ color: '#00B4D8', fontWeight: '600' },
});
