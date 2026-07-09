// Slide-out navigation drawer — RN port of the custom mobile-web drawer in
// frontend/src/components/Layout.jsx. Faithful to web: a left-anchored panel
// (white/surface, editorial-light) over a dimmed backdrop, with the exact menu
// order + admin gating. Built as a custom animated overlay (not
// @react-navigation/drawer) because web's drawer is itself a custom slide-out,
// and this keeps the existing expo-router Stack + bottom Tabs 100% untouched.
//
// Menu order mirrors web exactly:
//   Jobs · Airlines · Alerts · Logbook · CV Builder · Profile
//   [admin only] Admin Dashboard · Airline Moderation · Employer Moderation
//   —— divider —— Settings · Support
//   —— pinned, border-top —— Sign Out
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PlaneMark } from './ui';
import { useAuth } from '../context/AuthContext';
import { useUnread } from '../context/UnreadContext';
import { fontFamilies, fontSizes, pilot } from '../theme/tokens';

const PANEL_W = Math.min(320, Math.round(Dimensions.get('window').width * 0.84));

type Item = { label: string; icon: keyof typeof Ionicons.glyphMap; route: string; badge?: number };

const MAIN = (unread: number): Item[] => [
  { label: 'Jobs', icon: 'briefcase-outline', route: '/jobs' },
  { label: 'Airlines', icon: 'airplane-outline', route: '/airlines' },
  { label: 'Alerts', icon: 'notifications-outline', route: '/alerts', badge: unread },
  { label: 'Logbook', icon: 'book-outline', route: '/logbook' },
  { label: 'CV Builder', icon: 'document-text-outline', route: '/cv-builder' },
  { label: 'Profile', icon: 'person-outline', route: '/profile' },
];
const ADMIN: Item[] = [
  { label: 'Admin Dashboard', icon: 'shield-checkmark-outline', route: '/admin/dashboard' },
  { label: 'Airline Moderation', icon: 'shield-checkmark-outline', route: '/admin/moderation' },
  { label: 'Employer Moderation', icon: 'shield-checkmark-outline', route: '/admin/employers' },
];
const BOTTOM: Item[] = [
  { label: 'Settings', icon: 'settings-outline', route: '/settings' },
  { label: 'Support', icon: 'chatbubble-ellipses-outline', route: '/support' },
];

export default function AppDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user, accountType, logout } = useAuth();
  const { unread } = useUnread();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAdmin = accountType === 'pilot' && (user as any)?.isAdmin === true;

  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: 240, useNativeDriver: true }).start();
  }, [open, anim]);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-PANEL_W, 0] });

  const go = (route: string) => {
    onClose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.navigate(route as any);
  };
  const signOut = async () => {
    onClose();
    await logout();
    router.replace('/(auth)/login');
  };

  const Row = ({ item }: { item: Item }) => (
    <Pressable style={styles.row} onPress={() => go(item.route)} accessibilityRole="link" accessibilityLabel={item.label}>
      <Ionicons name={item.icon} size={20} color={pilot.ink} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{item.label}</Text>
      {item.badge && item.badge > 0 ? (
        <View style={styles.rowBadge}><Text style={styles.rowBadgeText}>{item.badge > 99 ? '99+' : item.badge}</Text></View>
      ) : null}
    </Pressable>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close navigation menu" />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[styles.panel, { width: PANEL_W, transform: [{ translateX }] }]}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left']}>
          {/* Drawer header */}
          <View style={styles.header}>
            <View style={styles.headerLogo}>
              <PlaneMark size={16} />
              <Text style={styles.headerLogoText}>CockpitHire</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn} accessibilityLabel="Close menu">
              <Ionicons name="close" size={22} color={pilot.muted} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
            {MAIN(unread).map((item) => <Row key={item.route} item={item} />)}

            {isAdmin ? ADMIN.map((item) => <Row key={item.route} item={item} />) : null}

            <View style={styles.divider} />

            {BOTTOM.map((item) => <Row key={item.route} item={item} />)}
          </ScrollView>

          {/* Sign out — pinned */}
          <View style={styles.signOutWrap}>
            <Pressable style={styles.row} onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out">
              <Ionicons name="log-out-outline" size={20} color={pilot.muted} style={styles.rowIcon} />
              <Text style={[styles.rowLabel, { color: pilot.muted }]}>Sign Out</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,20,25,0.5)' },
  panel: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    backgroundColor: pilot.surface,
    borderRightWidth: 1, borderRightColor: pilot.line,
  },
  header: {
    height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: 20, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: pilot.line,
  },
  headerLogo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogoText: { fontFamily: fontFamilies.display, fontSize: 18, color: pilot.ink, letterSpacing: -0.3 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 20, gap: 14 },
  rowIcon: { width: 22, textAlign: 'center' },
  rowLabel: { flex: 1, fontFamily: fontFamilies.bodySemiBold, fontSize: 15, color: pilot.ink },
  rowBadge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: pilot.navy, alignItems: 'center', justifyContent: 'center',
  },
  rowBadgeText: { color: '#fff', fontSize: 11, fontFamily: fontFamilies.bodyBold },
  divider: { height: 1, backgroundColor: pilot.line, marginVertical: 8, marginHorizontal: 20 },
  signOutWrap: { borderTopWidth: 1, borderTopColor: pilot.line, paddingVertical: 4 },
});
