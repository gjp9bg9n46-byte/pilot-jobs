import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MatchBreakdown as MatchBreakdownType } from '../../../types/alert';

interface Props {
  breakdown: MatchBreakdownType | null;
}

export default function MatchBreakdown({ breakdown }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!breakdown) return null;

  const { matched, marginal, missing } = breakdown;
  const total = matched.length + marginal.length + missing.length;
  if (total === 0) return null;

  return (
    <View style={s.container}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <Text style={s.label}>Why this match?</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#7A8CA0" />
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {matched.map((item) => (
            <Row key={item} icon="checkmark-circle" color="#2ECC71" text={item} />
          ))}
          {marginal.map((item) => (
            <Row key={item} icon="alert-circle" color="#F5A524" text={item} />
          ))}
          {missing.map((item) => (
            <Row key={item} icon="close-circle" color="#FF4757" text={item} />
          ))}
        </View>
      )}
    </View>
  );
}

function Row({ icon, color, text }: { icon: any; color: string; text: string }) {
  return (
    <View style={s.row}>
      <Ionicons name={icon} size={14} color={color} style={s.rowIcon} />
      <Text style={s.rowText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#243050', paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12, color: '#7A8CA0', fontWeight: '500' },
  body: { marginTop: 6, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowIcon: { marginRight: 6 },
  rowText: { fontSize: 12, color: '#A8BDD0', flex: 1 },
});
