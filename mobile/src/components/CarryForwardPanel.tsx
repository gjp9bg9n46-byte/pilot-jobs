// Carry-forward hours — mirrors the collapsible panel in
// frontend/src/pages/Logbook.jsx. Hours logged before the digital logbook
// started; the backend's /profile/totals already folds these in, so saving
// refetches totals (via onSaved). GET/PUT /profile/carry-forward.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import { PrimaryButton, TextField } from './ui';
import { fontFamilies, fontSizes, pilot, semantic, spacing } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

// Same fields as the logbook totals grid (TOTALS_DISPLAY on web).
const KEYS: [string, string][] = [
  ['totalTime', 'Block Hours'], ['picTime', 'PIC Hours'], ['sicTime', 'SIC Hours'],
  ['multiEngineTime', 'Multi-Engine'], ['turbineTime', 'Turbine'], ['instrumentTime', 'Instrument'], ['nightTime', 'Night'],
];

export default function CarryForwardPanel({ onSaved }: { onSaved?: () => void }) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [cf, setCf] = useState<Record<string, number>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.get('/profile/carry-forward').then(({ data }) => setCf(data ?? {})).catch(() => {}); }, []);

  const hasData = KEYS.some(([k]) => (cf[k] || 0) > 0);

  const toggle = () => {
    if (!open) setForm(Object.fromEntries(KEYS.map(([k]) => [k, cf[k] ? String(cf[k]) : ''])));
    setOpen((o) => !o);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      for (const [k] of KEYS) payload[k] = parseFloat(form[k]) || 0;
      const { data } = await api.put('/profile/carry-forward', payload);
      setCf(data ?? {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.header} onPress={toggle}>
        <Ionicons name="time-outline" size={15} color={pilot.navy} />
        <Text style={styles.headerText}>Previous / carry-forward hours</Text>
        {hasData ? <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>active</Text></View> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={pilot.muted} style={{ marginLeft: 'auto' }} />
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <Text style={styles.hint}>Enter hours from your previous logbooks. These are added to the totals above.</Text>
          <View style={styles.grid}>
            {KEYS.map(([k, label]) => (
              <View key={k} style={styles.gridItem}>
                <TextField label={label} placeholder="0.0" keyboardType="decimal-pad" value={form[k] ?? ''} onChangeText={(t) => setForm((f) => ({ ...f, [k]: t }))} />
              </View>
            ))}
          </View>
          <View style={styles.saveRow}>
            <View style={{ flex: 1 }}><PrimaryButton label={saving ? 'Saving…' : 'Save'} loading={saving} onPress={save} /></View>
            {saved ? <Text style={styles.savedText}>✓ Saved</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  wrap: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  headerText: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, color: pilot.ink },
  activeBadge: { backgroundColor: semantic.infoBg, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  activeBadgeText: { fontSize: 9, color: '#1E40AF', fontFamily: fontFamilies.bodyBold },
  body: { backgroundColor: pilot.surface, borderWidth: 1, borderTopWidth: 0, borderColor: pilot.line, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, padding: spacing.lg },
  hint: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47%' },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  savedText: { color: semantic.success, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },
});
