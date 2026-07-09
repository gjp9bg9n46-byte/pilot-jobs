// Employer status notice (REJECTED / SUSPENDED) — mirrors
// frontend/src/pages/employer/EmployerStatusNotice.jsx.
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryButton } from '../../../src/components/ui';
import { StatusBadge } from '../../../src/components/employer/EmployerChrome';
import { useAuth, Employer } from '../../../src/context/AuthContext';
import { employer as emp, fontFamilies, fontSizes, spacing } from '../../../src/theme/tokens';

const COPY: Record<string, { badge: string; headline: string; body: string }> = {
  REJECTED: { badge: 'APPLICATION DECLINED', headline: 'Your application was not approved.', body: 'After review, we were unable to approve your employer account at this time.' },
  SUSPENDED: { badge: 'ACCOUNT SUSPENDED', headline: 'Your account is suspended.', body: 'Your employer account has been suspended. Existing job listings may remain live, but you cannot post new jobs.' },
};

export default function EmployerStatus() {
  const { user, logout } = useAuth();
  const e = user as Employer | null;
  if (!e) return null;
  const copy = COPY[e.status] || COPY.REJECTED;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.wrap}>
        <View style={styles.card}>
          <StatusBadge status={e.status} />
          <Text style={styles.headline}>{copy.headline}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          {e.rejectionReason ? <View style={styles.reason}><Text style={styles.reasonText}><Text style={{ fontFamily: fontFamilies.bodySemiBold }}>Reason: </Text>{String(e.rejectionReason)}</Text></View> : null}
          <SecondaryButton label="Log out" onPress={logout} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: emp.bg },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { backgroundColor: emp.surface, borderWidth: 1, borderColor: emp.line, borderRadius: 12, padding: 32, width: '100%', maxWidth: 520 },
  headline: { fontSize: fontSizes.xl, fontFamily: fontFamilies.bodyBold, color: emp.ink, marginTop: 16, marginBottom: 14 },
  body: { color: emp.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.base, lineHeight: 24, marginBottom: 18 },
  reason: { backgroundColor: emp.bg, borderWidth: 1, borderColor: emp.line, borderRadius: 8, padding: 14, marginBottom: 20 },
  reasonText: { color: emp.ink, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },
});
