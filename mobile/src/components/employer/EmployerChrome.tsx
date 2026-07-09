// Employer (b2b "cool-operator") chrome — mirrors the header + badges in
// frontend/src/pages/employer/EmployerDashboard.jsx. Grey surface, Inter
// everywhere, navy accent. Used across the employer screens.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { employer as emp, fontFamilies, fontSizes, semantic } from '../../theme/tokens';

const ACCT_VARIANT: Record<string, { fg: string; bg: string }> = {
  APPROVED: { fg: semantic.success, bg: semantic.successBg },
  PENDING: { fg: '#1E40AF', bg: semantic.infoBg },
  REJECTED: { fg: semantic.error, bg: semantic.errorBg },
  SUSPENDED: { fg: semantic.error, bg: semantic.errorBg },
};
const JOB_VARIANT: Record<string, { fg: string; bg: string }> = {
  ACTIVE: { fg: semantic.success, bg: semantic.successBg },
  EXPIRED: { fg: emp.muted, bg: '#F1F1F1' },
  FILLED: { fg: semantic.warning, bg: semantic.warningBg },
  PENDING_REVIEW: { fg: '#1E40AF', bg: semantic.infoBg },
};

export function StatusBadge({ status }: { status: string }) {
  const v = ACCT_VARIANT[status] || { fg: emp.muted, bg: '#F1F1F1' };
  return <Pill fg={v.fg} bg={v.bg} label={status} />;
}
export function JobStatusBadge({ status }: { status: string }) {
  const v = JOB_VARIANT[status] || { fg: emp.muted, bg: '#F1F1F1' };
  return <Pill fg={v.fg} bg={v.bg} label={status} />;
}
function Pill({ fg, bg, label }: { fg: string; bg: string; label: string }) {
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={[styles.pillText, { color: fg }]}>{label}</Text></View>;
}

// Top header bar: brand + company + account status + Logout.
export function EmployerHeader({ companyName, status, onLogout }: { companyName: string; status: string; onLogout: () => void }) {
  return (
    <SafeAreaView edges={['top']} style={styles.headerSafe}>
      <View style={styles.header}>
        <View style={styles.hLeft}>
          <Text style={styles.brand}>✈ CockpitHire</Text>
          <Text style={styles.co} numberOfLines={1}>{companyName}</Text>
          <StatusBadge status={status} />
        </View>
        <Pressable onPress={onLogout} hitSlop={8}><Text style={styles.logout}>Logout</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerSafe: { backgroundColor: emp.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: emp.line, backgroundColor: emp.surface },
  hLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  brand: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodyBold, color: emp.navy },
  co: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: emp.ink, flexShrink: 1 },
  logout: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: emp.muted },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, fontFamily: fontFamilies.bodyBold, letterSpacing: 0.3 },
});
