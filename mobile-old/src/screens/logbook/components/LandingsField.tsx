import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

export default function LandingsField({ label, value, onChange }: Props) {
  return (
    <View style={s.container}>
      <Text style={s.label}>{label}</Text>
      <View style={s.stepper}>
        <TouchableOpacity
          style={[s.btn, value <= 0 && s.btnDisabled]}
          onPress={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
        >
          <Text style={s.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={s.value}>{value}</Text>
        <TouchableOpacity style={s.btn} onPress={() => onChange(value + 1)}>
          <Text style={s.btnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { alignItems: 'center', flex: 1 },
  label:     { color: '#C0CDE0', fontSize: 12, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  stepper:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn:       {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#0A2040', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#243050',
  },
  btnDisabled: { opacity: 0.3 },
  btnText:   { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 24 },
  value:     { color: '#00B4D8', fontSize: 22, fontWeight: '800', minWidth: 32, textAlign: 'center' },
});
