// Aircraft type combobox — mirrors frontend/src/components/AircraftCombobox.jsx.
// TextInput + a grouped, filtered dropdown over the static AIRCRAFT_GROUPS list.
// Substring filter on the designator; group headers; free-text allowed (type an
// unmatched value and it's kept); "Other (specify)" closes keeping typed text.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getVisibleAircraft } from '../data/aircraft';
import { TextField } from './ui';
import { fontFamilies, fontSizes, pilot } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

export default function AircraftCombobox({
  label = 'Aircraft Type', required, value, onChange, error,
}: {
  label?: string; required?: boolean; value: string; onChange: (v: string) => void; error?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const visible = getVisibleAircraft(value || '');

  return (
    <View>
      <TextField
        label={label}
        required={required}
        value={value}
        onChangeText={(t) => { onChange(t); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="e.g. B737, A320, C172"
        autoCapitalize="characters"
        autoCorrect={false}
        error={error}
      />
      {open ? (
        <View style={styles.dropdown}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
            {visible.length === 0 ? (
              <Text style={styles.noMatch}>No match — type to use custom value</Text>
            ) : visible.map((g) => (
              <View key={g.group}>
                <Text style={styles.groupHeader}>{g.group}</Text>
                {g.items.map((item) => (
                  <Pressable key={item} onPress={() => { onChange(item); setOpen(false); }} style={styles.item}>
                    <Text style={styles.itemText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            <Pressable onPress={() => setOpen(false)} style={[styles.item, styles.other]}>
              <Text style={styles.otherText}>Other (specify)</Text>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  // Inline (in-flow) dropdown that pushes the fields below down while open — no
  // overlap on any platform (the spec's permitted fix; web uses an absolute
  // overlay, but push-down is cleaner cross-platform).
  dropdown: { marginTop: 4, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 8 },
  noMatch: { padding: 12, color: pilot.muted, fontStyle: 'italic', fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
  groupHeader: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2, fontSize: 10, fontFamily: fontFamilies.bodyBold, color: pilot.navy, textTransform: 'uppercase', letterSpacing: 0.8, borderTopWidth: 1, borderTopColor: pilot.line },
  item: { paddingVertical: 9, paddingHorizontal: 14 },
  itemText: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: pilot.ink },
  other: { borderTopWidth: 1, borderTopColor: pilot.line },
  otherText: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, fontStyle: 'italic', color: pilot.muted },
});
