// Shared top header for every pilot (app)/ screen — brand-navy bar with the
// CockpitHire wordmark on the left; airlines directory, notification bell +
// settings gear on the right (all white on navy). Mounted once in (app)/_layout
// above the Stack so it persists across screen changes. The bell badge comes
// from the same source web uses (unread alerts). Navigation lives in the bottom
// Tabs; Settings (with Support inside) is reached from the gear here.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PlaneMark } from './ui';
import { useUnread } from '../context/UnreadContext';
import { fontFamilies, pilot } from '../theme/tokens';

export default function AppHeader() {
  const router = useRouter();
  const { unread } = useUnread();

  return (
    <View style={styles.bar}>
      <View style={styles.logo} pointerEvents="none">
        <PlaneMark size={16} color="#FFFFFF" />
        <Text style={styles.logoText}>CockpitHire</Text>
      </View>

      <View style={styles.right}>
        <Pressable onPress={() => router.navigate({ pathname: '/jobs', params: { view: 'matches' } })} hitSlop={8} style={styles.iconBtn} accessibilityLabel={`Alerts${unread > 0 ? `, ${unread} unread` : ''}`}>
          <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable onPress={() => router.navigate('/settings')} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    backgroundColor: pilot.navy,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoText: {
    fontFamily: fontFamilies.display,
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  badge: {
    position: 'absolute', top: 6, right: 4,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: pilot.navy, fontSize: 10, fontFamily: fontFamilies.bodyBold },
});
