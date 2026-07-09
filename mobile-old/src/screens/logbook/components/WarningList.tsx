import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  warnings: string[];
}

export default function WarningList({ warnings }: Props) {
  if (warnings.length === 0) return null;
  return (
    <View style={s.container}>
      {warnings.map((w) => (
        <View key={w} style={s.row}>
          <Ionicons name="warning-outline" size={15} color="#F5A524" />
          <Text style={s.text}>{w}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: '#1A1400', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#F5A524', gap: 8,
  },
  row:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  text: { color: '#F5A524', fontSize: 13, flex: 1, lineHeight: 18 },
});
