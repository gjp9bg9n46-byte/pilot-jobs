import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ActionSheetIOS, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { timeAgo } from '../../../utils/format';
import type { SavedSearch } from '../../../types/alert';
import { FREQUENCY_LABELS } from '../../../types/alert';

interface Props {
  item: SavedSearch;
  onTap: (item: SavedSearch) => void;
  onEdit: (item: SavedSearch) => void;
  onPauseToggle: (item: SavedSearch) => void;
  onDelete: (item: SavedSearch) => void;
}

export default function SavedSearchRow({ item, onTap, onEdit, onPauseToggle, onDelete }: Props) {
  function showActions() {
    const options = [
      item.paused ? 'Resume' : 'Pause',
      'Edit',
      'Delete',
      'Cancel',
    ];
    const destructiveIndex = 2;
    const cancelIndex = 3;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
        (idx) => {
          if (idx === 0) onPauseToggle(item);
          else if (idx === 1) onEdit(item);
          else if (idx === 2) onDelete(item);
        },
      );
    } else {
      Alert.alert(item.name, undefined, [
        { text: item.paused ? 'Resume' : 'Pause', onPress: () => onPauseToggle(item) },
        { text: 'Edit', onPress: () => onEdit(item) },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(item) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  return (
    <TouchableOpacity style={s.row} onPress={() => onTap(item)} onLongPress={showActions} activeOpacity={0.8}>
      <View style={s.left}>
        <View style={s.nameRow}>
          <Text style={[s.name, item.paused && s.paused]} numberOfLines={1}>{item.name}</Text>
          {item.paused && (
            <View style={s.pausedBadge}>
              <Text style={s.pausedText}>Paused</Text>
            </View>
          )}
        </View>
        <View style={s.meta}>
          <View style={s.freqBadge}>
            <Text style={s.freqText}>{FREQUENCY_LABELS[item.frequency]}</Text>
          </View>
          {item.newMatchCount > 0 && (
            <View style={s.newBadge}>
              <Text style={s.newText}>{item.newMatchCount} new</Text>
            </View>
          )}
          {item.lastTriggeredAt && (
            <Text style={s.ago}>Last: {timeAgo(item.lastTriggeredAt)}</Text>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={showActions} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="ellipsis-horizontal" size={18} color="#7A8CA0" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B2B4B',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 14,
  },
  left: { flex: 1, marginRight: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  name: { fontSize: 15, fontWeight: '600', color: '#E8F0F8', flex: 1 },
  paused: { color: '#7A8CA0' },
  pausedBadge: { backgroundColor: '#243050', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pausedText: { fontSize: 11, color: '#7A8CA0' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  freqBadge: { backgroundColor: '#0A1628', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  freqText: { fontSize: 11, color: '#00B4D8' },
  newBadge: { backgroundColor: '#00B4D822', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  newText: { fontSize: 11, color: '#00B4D8', fontWeight: '600' },
  ago: { fontSize: 11, color: '#7A8CA0' },
});
