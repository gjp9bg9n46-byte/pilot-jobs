// ── Skeletons ────────────────────────────────────────────────────────────────
// Shown only when there is nothing cached — after that the real data is already
// on screen and a loader would be a lie about what we know.
//
// These are shaped like the screen they stand in for (a logbook day with two
// sectors and a time on the right; a job card with a title, an airline and two
// chips), so the layout does not jump when the data lands. The pulse is a
// single slow opacity breath rather than a sweeping gradient: one quiet signal
// that the app is working, not a second thing competing for attention.
import { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { DURATION, EASE_IN_OUT, timing } from '../theme/motion';
import { ThemePalette, useThemedStyles } from '../theme/ThemeContext';
import { spacing } from '../theme/tokens';

export function Bone({ w, h = 12, r = 6, style }: { w?: number | `${number}%`; h?: number; r?: number; style?: ViewStyle }) {
  const styles = useThemedStyles(createStyles);
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, timing(900, EASE_IN_OUT)), withTiming(0.55, timing(900, EASE_IN_OUT))),
      -1, false,
    );
  }, [pulse]);
  const a = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.bone, { width: w ?? '100%', height: h, borderRadius: r }, style, a]} />;
}

const Row = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>
);

/** Logbook: the recency strip, the totals, then day-grouped sectors. */
export function LogbookSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.pad} accessibilityLabel="Loading your logbook">
      <Bone w="45%" h={26} r={8} />
      <Bone w="60%" h={13} style={{ marginTop: 8 }} />
      <Row style={{ marginTop: 16 }}>
        {[0, 1, 2].map((i) => <View key={i} style={styles.card}><Bone w="70%" h={20} /><Bone w="40%" h={10} style={{ marginTop: 8 }} /></View>)}
      </Row>
      <View style={[styles.block, { marginTop: 14 }]}><Bone w="80%" h={14} /></View>
      {[0, 1].map((d) => (
        <View key={d} style={{ marginTop: 18 }}>
          <Row style={{ justifyContent: 'space-between' }}><Bone w={110} h={11} /><Bone w={44} h={11} /></Row>
          {[0, 1].map((s) => (
            <View key={s} style={[styles.block, { marginTop: 8 }]}>
              <Row style={{ justifyContent: 'space-between' }}><Bone w={140} h={15} /><Bone w={48} h={15} /></Row>
              <Bone w="55%" h={11} style={{ marginTop: 8 }} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Jobs / Airlines: a stack of cards with a logo slot on the right. */
export function CardListSkeleton({ rows = 5, chips = true }: { rows?: number; chips?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.pad} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[styles.block, { marginBottom: 12 }]}>
          <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Bone w="85%" h={16} />
              <Bone w="60%" h={12} style={{ marginTop: 8 }} />
            </View>
            <Bone w={42} h={42} r={10} />
          </Row>
          {chips && <Row style={{ marginTop: 12 }}><Bone w={64} h={22} r={11} /><Bone w={52} h={22} r={11} /><Bone w={78} h={22} r={11} /></Row>}
        </View>
      ))}
    </View>
  );
}

/** Home: blockers, then the matches card. */
export function DashboardSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.pad} accessibilityLabel="Loading your dashboard">
      <Bone w="55%" h={28} r={8} />
      <Bone w="75%" h={13} style={{ marginTop: 8 }} />
      <View style={[styles.block, { marginTop: 18 }]}>
        <Row style={{ justifyContent: 'space-between' }}><Bone w="50%" h={18} /><Bone w={76} h={13} /></Row>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ marginTop: 16 }}>
            <Bone w="80%" h={15} />
            <Bone w="55%" h={11} style={{ marginTop: 7 }} />
            <Row style={{ marginTop: 10, justifyContent: 'space-between' }}><Bone w={64} h={20} /><Bone w={62} h={30} r={8} /></Row>
          </View>
        ))}
      </View>
    </View>
  );
}

/** CV: the checks panel, then the A4 sheet. */
export function CvSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.pad} accessibilityLabel="Loading your CV">
      <View style={styles.block}>
        <Bone w="55%" h={16} />
        {[0, 1, 2].map((i) => <Bone key={i} w={i === 2 ? '70%' : '90%'} h={12} style={{ marginTop: 12 }} />)}
      </View>
      <View style={[styles.sheet, { marginTop: 14 }]}>
        <Bone w="50%" h={20} />
        <Bone w="30%" h={11} style={{ marginTop: 8 }} />
        {[0, 1, 2, 3, 4].map((i) => <Bone key={i} w={i % 2 ? '85%' : '95%'} h={10} style={{ marginTop: 14 }} />)}
      </View>
    </View>
  );
}

/** Profile: avatar, name, then the readiness rows. */
export function ProfileSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.pad} accessibilityLabel="Loading your profile">
      <Row>
        <Bone w={64} h={64} r={32} />
        <View style={{ flex: 1 }}><Bone w="70%" h={20} /><Bone w="45%" h={12} style={{ marginTop: 8 }} /></View>
      </Row>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.block, { marginTop: 14 }]}>
          <Bone w="40%" h={14} />
          <Bone w="90%" h={11} style={{ marginTop: 10 }} />
        </View>
      ))}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  bone: { backgroundColor: pilot.line },
  pad: { padding: spacing.lg },
  block: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, padding: 14 },
  card: { flex: 1, backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 14, padding: 14 },
  sheet: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 10, padding: 20, minHeight: 420 },
});
