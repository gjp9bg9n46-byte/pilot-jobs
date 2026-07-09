// Employer pending-approval landing — mirrors
// frontend/src/pages/employer/EmployerPendingApproval.jsx. Shown while the
// employer account status is PENDING (right after registration, or on login).
// Uses the cool-operator (.app-b2b) light palette to match the web employer
// identity. The VerifyEmailBanner mounts above via app/(app)/_layout.
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryButton } from '../../../src/components/ui';
import { useAuth, Employer } from '../../../src/context/AuthContext';
import { COMPANY_TYPE_LABEL } from '../../../src/lib/employerTypes';
import { employer as emp, fontFamilies, fontSizes, spacing } from '../../../src/theme/tokens';

function Row({ k, v, last }: { k: string; v?: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal}>{v || '—'}</Text>
    </View>
  );
}

export default function EmployerPendingApproval() {
  const { user, accountType, logout } = useAuth();
  // Guard: only meaningful for employer accounts (the gate handles redirects).
  if (accountType !== 'employer' || !user) return null;
  const e = user as Employer;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>UNDER REVIEW</Text>
          </View>
          <Text style={styles.headline}>Your account is under review.</Text>
          <Text style={styles.body}>
            Thanks for registering, {e.contactName}. Our team reviews new employer applications,
            usually within 48 hours. You'll receive an email at <Text style={styles.strong}>{e.contactEmail}</Text> once
            your account is approved. Once approved, you'll be able to post jobs that appear on our
            pilot-facing Jobs page.
          </Text>

          <View style={styles.summary}>
            <Row k="Company" v={e.companyName} />
            <Row k="Type" v={COMPANY_TYPE_LABEL[e.companyType] || e.companyType} />
            <Row k="Country" v={e.country} />
            <Row k="Contact Name" v={e.contactName} />
            <Row k="Contact Email" v={e.contactEmail} last />
          </View>

          <SecondaryButton label="Log out" onPress={logout} />

          <Text style={styles.contact}>
            Have questions? Contact us at{' '}
            <Text style={styles.link} onPress={() => Linking.openURL('mailto:support@cockpithire.com')}>
              support@cockpithire.com
            </Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: emp.bg },
  scroll: { flexGrow: 1, padding: spacing.xl },
  card: {
    backgroundColor: emp.surface,
    borderWidth: 1,
    borderColor: emp.line,
    borderRadius: 12,
    padding: spacing.xl,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: spacing.md,
  },
  badgeText: { color: '#92400E', fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyBold, letterSpacing: 0.5 },
  headline: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xl, color: emp.ink, marginBottom: 12 },
  body: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: emp.muted, lineHeight: 24, marginBottom: spacing.xl },
  strong: { color: emp.ink, fontFamily: fontFamilies.bodySemiBold },
  summary: {
    backgroundColor: emp.bg,
    borderWidth: 1,
    borderColor: emp.line,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: emp.line,
  },
  rowLast: { borderBottomWidth: 0 },
  rowKey: { color: emp.muted, fontSize: fontSizes.sm, fontFamily: fontFamilies.body },
  rowVal: { color: emp.ink, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, flexShrink: 1, textAlign: 'right' },
  contact: { textAlign: 'center', marginTop: spacing.lg, color: emp.muted, fontSize: fontSizes.sm, fontFamily: fontFamilies.body },
  link: { color: emp.navy, fontFamily: fontFamilies.bodySemiBold },
});
