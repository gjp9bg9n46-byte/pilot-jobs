import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Known multi-engine turbine types — auto-check flags when selected
const MULTI_ENGINE_TYPES = ['B737','B747','B757','B767','B777','B787','A318','A319','A320','A321','A330','A340','A350','A380','E170','E175','E190','E195','CRJ700','CRJ900','ATR42','ATR72','Q400','MD80','DC9'];
const TURBINE_TYPES = [...MULTI_ENGINE_TYPES, 'C208', 'PC12', 'TBM930', 'TBM960', 'PA46T'];

export interface AircraftFlags {
  multiEngine: boolean;
  turbine: boolean;
}

interface Props {
  aircraftType: string;
  registration: string;
  onTypeChange: (type: string, flags: AircraftFlags) => void;
  onRegChange: (reg: string) => void;
  typeRatings: string[];     // from pilot profile
  recentTypes: string[];     // from recentAircraft API
  recentRegs: Record<string, string[]>;
}

function inferFlags(type: string): AircraftFlags {
  const t = type.toUpperCase().replace(/[-\s]/g, '');
  return {
    multiEngine: MULTI_ENGINE_TYPES.some((m) => t.startsWith(m) || m.startsWith(t)),
    turbine:     TURBINE_TYPES.some((m) => t.startsWith(m) || m.startsWith(t)),
  };
}

export default function AircraftPicker({
  aircraftType, registration,
  onTypeChange, onRegChange,
  typeRatings, recentTypes, recentRegs,
}: Props) {
  const allTypeChips = Array.from(new Set([...typeRatings, ...recentTypes]));
  const suggestedRegs = (aircraftType && recentRegs[aircraftType]) || [];

  const handleTypeChip = (t: string) => {
    onTypeChange(t, inferFlags(t));
  };

  const handleTypeInput = (t: string) => {
    const trimmed = t.trim().toUpperCase();
    onTypeChange(trimmed, inferFlags(trimmed));
  };

  return (
    <View style={s.container}>
      {/* Type chips */}
      {allTypeChips.length > 0 && (
        <>
          <Text style={s.smallLabel}>Your ratings / recent types</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
            {allTypeChips.map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.chip, aircraftType === t && s.chipActive]}
                onPress={() => handleTypeChip(t)}
              >
                <Text style={[s.chipText, aircraftType === t && s.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Manual type input */}
      <Text style={s.label}>Aircraft type *</Text>
      <TextInput
        style={s.input}
        value={aircraftType}
        onChangeText={handleTypeInput}
        placeholder="e.g. B737, A320, C172"
        placeholderTextColor="#4A6080"
        autoCapitalize="characters"
      />

      {/* Registration */}
      <Text style={s.label}>Registration</Text>
      {suggestedRegs.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.chipScroll, { marginBottom: 6 }]}>
          {suggestedRegs.map((r) => (
            <TouchableOpacity
              key={r}
              style={[s.chip, registration === r && s.chipActive]}
              onPress={() => onRegChange(r)}
            >
              <Text style={[s.chipText, registration === r && s.chipTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <TextInput
        style={s.input}
        value={registration}
        onChangeText={(v) => onRegChange(v.trim().toUpperCase())}
        placeholder="e.g. A6-EKA"
        placeholderTextColor="#4A6080"
        autoCapitalize="characters"
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:    {},
  label:        { color: '#C0CDE0', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  smallLabel:   { color: '#4A6080', fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 },
  input:        {
    backgroundColor: '#0A1628', borderRadius: 8, padding: 12, color: '#fff',
    fontSize: 15, borderWidth: 1, borderColor: '#243050', marginBottom: 4,
  },
  chipScroll:   { marginBottom: 8 },
  chip:         {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#0F2040', borderWidth: 1, borderColor: '#243050', marginRight: 8,
  },
  chipActive:   { backgroundColor: '#0A2F50', borderColor: '#00B4D8' },
  chipText:     { color: '#7A8CA0', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#00B4D8' },
});
