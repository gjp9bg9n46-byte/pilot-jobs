// Edit a flight (single leg) → PATCH /flight-logs/:id. Prefill comes from the
// module holder set by the logbook row (no GET /flight-logs/:id exists). If the
// holder is empty (deep link / reload), show a not-found state.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FlightForm, { legFromLog } from '../../../../src/components/FlightForm';
import { getPendingFlight } from '../../../../src/lib/pendingFlight';
import { fontFamilies, fontSizes, pilot } from '../../../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../../../src/theme/ThemeContext';

export default function EditFlight() {
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const log = getPendingFlight();

  if (!log || log.id !== id) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Flight not found</Text>
          <Text style={styles.body}>Open a flight from your logbook to edit it.</Text>
          <Pressable onPress={() => router.replace('/logbook')}><Text style={styles.link}>← Back to logbook</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <FlightForm
      mode="edit"
      editId={id}
      title="Edit Flight"
      initialDate={log.date ? new Date(log.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}
      initialAircraft={log.aircraftType || ''}
      initialRegistration={log.registration || ''}
      initialLeg={legFromLog(log)}
    />
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  title: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink },
  body: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, textAlign: 'center' },
  link: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base, marginTop: 6 },
});
