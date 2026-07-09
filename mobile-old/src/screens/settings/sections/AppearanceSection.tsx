import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useDispatch } from 'react-redux';
import { setUIPrefs } from '../../../store';
import { useTheme } from '../../../hooks/useTheme';
import { useUnits } from '../../../hooks/useUnits';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import type { Theme, AltitudeUnit, DistanceUnit, WindSpeedUnit, DateFormat } from '../../../types/settings';
import { SectionCard } from './shared';

// NOTE: Language picker scaffold is present but English-only. i18n (react-i18next) is
// not yet wired — no translation strings exist beyond English. Add languages here when
// translations ship.

export default function AppearanceSection() {
  const dispatch   = useDispatch();
  const ui         = useSelector((s: RootState) => (s as any).ui);
  const theme      = useTheme();

  const theme_     = ui?.theme      ?? 'system';
  const altUnit    = ui?.altitudeUnit  ?? 'ft';
  const distUnit   = ui?.distanceUnit  ?? 'nm';
  const windUnit   = ui?.windSpeedUnit  ?? 'kt';
  const dateFormat = ui?.dateFormat   ?? 'auto';
  const language   = ui?.language    ?? 'en';

  const set = (patch: Record<string, string>) => dispatch(setUIPrefs(patch as any));

  return (
    <SectionCard title="Appearance & Locale" icon="color-palette-outline">
      <Group label="THEME">
        <ChipRow
          options={[
            { value: 'system', label: 'System' },
            { value: 'dark',   label: 'Dark'   },
            { value: 'light',  label: 'Light'  },
          ]}
          value={theme_}
          onChange={(v) => set({ theme: v })}
        />
      </Group>

      <Group label="UNITS — ALTITUDE">
        <ChipRow
          options={[{ value: 'ft', label: 'ft' }, { value: 'm', label: 'm' }]}
          value={altUnit}
          onChange={(v) => set({ altitudeUnit: v })}
        />
      </Group>

      <Group label="UNITS — DISTANCE">
        <ChipRow
          options={[{ value: 'nm', label: 'nm' }, { value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }]}
          value={distUnit}
          onChange={(v) => set({ distanceUnit: v })}
        />
      </Group>

      <Group label="UNITS — WIND SPEED">
        <ChipRow
          options={[{ value: 'kt', label: 'kt' }, { value: 'm/s', label: 'm/s' }, { value: 'km/h', label: 'km/h' }]}
          value={windUnit}
          onChange={(v) => set({ windSpeedUnit: v })}
        />
      </Group>

      <Group label="DATE FORMAT">
        <ChipRow
          options={[
            { value: 'auto',       label: 'Auto (locale)' },
            { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY'    },
            { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY'    },
            { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD'    },
          ]}
          value={dateFormat}
          onChange={(v) => set({ dateFormat: v })}
        />
      </Group>

      <Group label="LANGUAGE">
        <ChipRow
          options={[{ value: 'en', label: 'English' }]}
          value={language}
          onChange={(v) => set({ language: v })}
        />
        <Text style={s.langNote}>More languages coming soon.</Text>
      </Group>

      <Text style={s.themeNote}>
        Light mode applies to the Settings screen. Full app rollout is deferred — see summary.
      </Text>
    </SectionCard>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.group}>
      <Text style={s.groupLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChipRow({
  options, value, onChange,
}: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.chipRow}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          style={[s.chip, value === o.value && s.chipActive]}
          onPress={() => onChange(o.value)}
        >
          <Text style={[s.chipText, value === o.value && s.chipTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  group:         { marginBottom: 14 },
  groupLabel:    { color: '#4A6080', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#0F2040', borderWidth: 1, borderColor: '#243050' },
  chipActive:    { backgroundColor: '#0A2F50', borderColor: '#00B4D8' },
  chipText:      { color: '#7A8CA0', fontSize: 13, fontWeight: '600' },
  chipTextActive:{ color: '#00B4D8' },
  langNote:      { color: '#4A6080', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  themeNote:     { color: '#4A6080', fontSize: 11, marginTop: 8, fontStyle: 'italic', lineHeight: 16 },
});
