// Employer moderation — mirrors frontend/src/pages/AdminEmployers.jsx. Dark.
// GET /admin/employers → Employer[] (client-side status tabs + search). Actions:
// approve (no reason) · reject/suspend (reason 10–500) · re-approve/unsuspend (= approve).
// POST /admin/employers/:id/approve|reject|suspend. Optimistic move + re-sync.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Linking, Modal, Pressable, RefreshControl,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api from '../../../src/lib/api';
import { admin, fontFamilies, fontSizes, spacing } from '../../../src/theme/tokens';

const TABS = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
type Tab = typeof TABS[number];
const TYPE_LABEL: Record<string, string> = { AIRLINE: 'Airline', CHARTER: 'Charter', CARGO: 'Cargo', EMS: 'EMS / Air Ambulance', FLIGHT_SCHOOL: 'Flight School', CORPORATE: 'Corporate', RECRUITER: 'Recruiter / Agency', OTHER: 'Other' };
const STATUS_COLOR: Record<string, [string, string]> = {
  PENDING: ['#E0C24A', 'rgba(224,194,74,0.12)'], APPROVED: ['#34D399', 'rgba(52,211,153,0.12)'],
  REJECTED: ['#FF6B6B', 'rgba(255,107,107,0.12)'], SUSPENDED: ['#F59E0B', 'rgba(245,158,11,0.12)'],
};
const REASON_MIN = 10, REASON_MAX = 500;
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

type ModalState = { type: 'approve' | 'reject' | 'suspend'; emp: any } | null;

export default function AdminEmployers() {
  const router = useRouter();
  const [employers, setEmployers] = useState<any[] | null>(null);
  const [tab, setTab] = useState<Tab>('PENDING');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/admin/employers'); setEmployers(data); }
    catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 401) router.replace('/jobs');
      else setEmployers([]);
    }
  }, [router]);
  useEffect(() => { load(); }, [load]);

  const showToast = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 4000); };
  const counts = useMemo(() => {
    const c: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, SUSPENDED: 0 };
    (employers || []).forEach((e) => { c[e.status] = (c[e.status] || 0) + 1; });
    return c;
  }, [employers]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employers || []).filter((e) => e.status === tab)
      .filter((e) => !q || e.companyName.toLowerCase().includes(q) || e.contactEmail.toLowerCase().includes(q));
  }, [employers, tab, search]);

  const patch = (id: string, changes: any) => setEmployers((prev) => (prev || []).map((e) => e.id === id ? { ...e, ...changes } : e));

  const doAction = async (type: 'approve' | 'reject' | 'suspend', emp: any, reasonText?: string) => {
    setBusy(true);
    const prevStatus = emp.status;
    const optimistic: any = { approve: { status: 'APPROVED' }, reject: { status: 'REJECTED', rejectionReason: reasonText }, suspend: { status: 'SUSPENDED', rejectionReason: reasonText } }[type];
    patch(emp.id, optimistic);
    try {
      if (type === 'approve') await api.post(`/admin/employers/${emp.id}/approve`);
      if (type === 'reject') await api.post(`/admin/employers/${emp.id}/reject`, { reason: reasonText });
      if (type === 'suspend') await api.post(`/admin/employers/${emp.id}/suspend`, { reason: reasonText });
      showToast(true, `${emp.companyName} ${type === 'approve' ? 'approved' : type === 'reject' ? 'rejected' : 'suspended'}.`);
      setModal(null); setReason(''); setTouched(false);
      load();
    } catch (err: any) {
      patch(emp.id, { status: prevStatus });
      showToast(false, err?.response?.data?.error || 'Action failed. Please try again.');
    } finally { setBusy(false); }
  };

  const openModal = (type: 'approve' | 'reject' | 'suspend', emp: any) => { setModal({ type, emp }); setReason(''); setTouched(false); };
  const reasonValid = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  const renderRow = ({ item: e }: { item: any }) => {
    const sc = STATUS_COLOR[e.status];
    const open = expanded === e.id;
    return (
      <View style={styles.row}>
        <Pressable style={styles.rowTop} onPress={() => setExpanded(open ? null : e.id)}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name}>{e.companyName}</Text>
            <Text style={styles.meta}>{TYPE_LABEL[e.companyType] || e.companyType} · {e.country}</Text>
            <Text style={styles.meta}>{e.contactName} · {e.contactEmail}</Text>
            <Text style={styles.meta}>Registered {fmtDate(e.createdAt)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sc[1], borderColor: sc[0] + '55' }]}><Text style={[styles.badgeText, { color: sc[0] }]}>{e.status}</Text></View>
        </Pressable>

        {open ? (
          <View style={styles.detail}>
            <DK k="HQ City" v={e.headquartersCity || '—'} />
            <DK k="IATA / ICAO" v={`${e.iataCode || '—'} / ${e.icaoCode || '—'}`} />
            <DK k="Phone" v={e.contactPhone || '—'} />
            <DK k="Approved" v={e.approvedAt ? `${fmtDate(e.approvedAt)} by ${e.approvedBy || '—'}` : '—'} />
            {e.website ? (
              <Pressable style={styles.detailFull} onPress={() => Linking.openURL(e.website)}>
                <Text style={styles.dK}>Website: </Text><Text style={styles.link}>{e.website}</Text>
              </Pressable>
            ) : null}
            {e.description ? <View style={styles.detailFull}><Text style={styles.dK}>Description: </Text><Text style={styles.dV}>{e.description}</Text></View> : null}
            {(e.status === 'REJECTED' || e.status === 'SUSPENDED') && e.rejectionReason ? (
              <View style={styles.reasonBox}><Text style={styles.reasonText}><Text style={{ fontFamily: fontFamilies.bodyBold }}>{e.status === 'REJECTED' ? 'Rejection' : 'Suspension'} reason: </Text>{e.rejectionReason}</Text></View>
            ) : null}
            <Text style={styles.jobsLine}>Posted jobs ({e._count?.postedJobs ?? 0})</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {e.status === 'PENDING' ? (
            <>
              <ActBtn label="Approve" kind="green" onPress={() => openModal('approve', e)} />
              <ActBtn label="Reject" kind="red" onPress={() => openModal('reject', e)} />
            </>
          ) : null}
          {e.status === 'APPROVED' ? (
            <>
              <ActBtn label={open ? 'Hide details' : 'View details'} kind="plain" onPress={() => setExpanded(open ? null : e.id)} />
              <ActBtn label="Suspend" kind="red" onPress={() => openModal('suspend', e)} />
            </>
          ) : null}
          {e.status === 'REJECTED' ? (
            <>
              <ActBtn label={open ? 'Hide details' : 'View details'} kind="plain" onPress={() => setExpanded(open ? null : e.id)} />
              <ActBtn label="Re-approve" kind="green" onPress={() => openModal('approve', e)} />
            </>
          ) : null}
          {e.status === 'SUSPENDED' ? (
            <>
              <ActBtn label={open ? 'Hide details' : 'View details'} kind="plain" onPress={() => setExpanded(open ? null : e.id)} />
              <ActBtn label="Unsuspend" kind="green" onPress={() => openModal('approve', e)} />
            </>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        renderItem={renderRow}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={admin.accent} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.h1}>Employer Moderation</Text>
            <Text style={styles.sub}>Review and manage employer accounts.</Text>
            {toast ? (
              <View style={[styles.toast, { backgroundColor: toast.ok ? 'rgba(52,211,153,0.12)' : 'rgba(255,107,107,0.12)', borderColor: (toast.ok ? '#34D399' : '#FF6B6B') + '55' }]}>
                <Text style={[styles.toastText, { color: toast.ok ? admin.success : admin.dangerBright }]}>{toast.msg}</Text>
              </View>
            ) : null}
            <View style={styles.tabBar}>
              {TABS.map((t) => {
                const on = tab === t;
                return (
                  <Pressable key={t} onPress={() => { setTab(t); setExpanded(null); }} accessibilityLabel={`${cap(t)} tab`} style={[styles.tab, on && styles.tabOn]}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{cap(t)}<Text style={[styles.tabCount, on && { color: admin.accent }]}>  {counts[t]}</Text></Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput style={styles.search} placeholder="Search by company or contact email…" placeholderTextColor={admin.dim} value={search} onChangeText={setSearch} autoCapitalize="none" />
          </View>
        }
        ListEmptyComponent={
          employers === null
            ? <View style={styles.center}><ActivityIndicator color={admin.accent} /></View>
            : <View style={styles.empty}><Text style={styles.emptyText}>No {tab.toLowerCase()} employers{search ? ' match your search' : ''}.</Text></View>
        }
      />

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => !busy && setModal(null)}>
        <Pressable style={styles.modalBg} onPress={() => !busy && setModal(null)}>
          <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
            {modal?.type === 'approve' ? (
              <>
                <Text style={styles.mTitle}>Approve {modal.emp.companyName}?</Text>
                <Text style={styles.mNote}>This employer will be able to post jobs immediately. They'll receive an approval email.</Text>
                <View style={styles.mRow}>
                  <ActBtn label="Cancel" kind="plain" onPress={() => setModal(null)} />
                  <ActBtn label={busy ? 'Approving…' : 'Confirm Approve'} kind="green" onPress={() => doAction('approve', modal.emp)} disabled={busy} accessibilityLabel="Confirm Approve" />
                </View>
              </>
            ) : null}
            {(modal?.type === 'reject' || modal?.type === 'suspend') ? (
              <>
                <Text style={styles.mTitle}>{modal.type === 'reject' ? 'Reject' : 'Suspend'} {modal.emp.companyName}</Text>
                {modal.type === 'suspend' ? <Text style={styles.mNote}>Suspension blocks new job posting but does NOT remove existing jobs from the public Jobs page.</Text> : null}
                <TextInput style={styles.textarea} multiline placeholder={`Reason (${REASON_MIN}–${REASON_MAX} characters)…`} placeholderTextColor={admin.dim} value={reason} onChangeText={setReason} onBlur={() => setTouched(true)} maxLength={REASON_MAX} />
                {touched && !reasonValid ? <Text style={styles.mErr}>Reason must be {REASON_MIN}–{REASON_MAX} characters.</Text> : null}
                <View style={styles.mRow}>
                  <ActBtn label="Cancel" kind="plain" onPress={() => setModal(null)} />
                  <ActBtn label={busy ? 'Saving…' : (modal.type === 'reject' ? 'Confirm Reject' : 'Confirm Suspend')} kind="red" disabled={!reasonValid || busy} onPress={() => doAction(modal.type, modal.emp, reason.trim())} accessibilityLabel={modal.type === 'reject' ? 'Confirm Reject' : 'Confirm Suspend'} />
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function DK({ k, v }: { k: string; v: string }) {
  return <View style={styles.dItem}><Text style={styles.dK}>{k}: </Text><Text style={styles.dV}>{v}</Text></View>;
}
function ActBtn({ label, kind, onPress, disabled, accessibilityLabel }: { label: string; kind: 'green' | 'red' | 'plain'; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const kindStyle = kind === 'green' ? styles.btnGreen : kind === 'red' ? styles.btnRed : styles.btnPlain;
  const textStyle = kind === 'green' ? { color: admin.success } : kind === 'red' ? { color: '#FF8A8A' } : { color: '#C0CDE0' };
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel ?? label} style={[styles.btn, kindStyle, disabled && { opacity: 0.5 }]}>
      <Text style={[styles.btnText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: admin.bg },
  content: { padding: spacing.xl, paddingBottom: 40 },
  center: { paddingVertical: 60, alignItems: 'center' },
  h1: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xl, color: admin.ink, marginBottom: 4 },
  sub: { color: admin.muted, fontSize: fontSizes.sm, marginBottom: 16, fontFamily: fontFamilies.body },
  toast: { borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1 },
  toastText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },
  tabBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#243050', backgroundColor: admin.surface },
  tabOn: { borderColor: admin.accent, backgroundColor: admin.accentSoft },
  tabText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, color: admin.muted },
  tabTextOn: { color: admin.accent },
  tabCount: { fontFamily: fontFamilies.bodyBold, color: '#5E6B80' },
  search: { backgroundColor: admin.surface, borderWidth: 1, borderColor: '#243050', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, color: admin.ink, fontSize: fontSizes.md, fontFamily: fontFamilies.body, marginBottom: 16 },
  row: { backgroundColor: admin.surface, borderWidth: 1, borderColor: admin.line, borderRadius: 12, padding: 16, marginBottom: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  name: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodyBold, color: admin.ink },
  meta: { color: admin.muted, fontSize: fontSizes.sm, marginTop: 3, fontFamily: fontFamilies.body },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  badgeText: { fontSize: 11, fontFamily: fontFamilies.bodyBold },
  detail: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: admin.line, gap: 8 },
  dItem: { flexDirection: 'row', flexWrap: 'wrap' },
  detailFull: { flexDirection: 'row', flexWrap: 'wrap' },
  dK: { color: '#6B7A90', fontSize: fontSizes.sm, fontFamily: fontFamilies.body },
  dV: { color: '#C0CDE0', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },
  link: { color: admin.accent, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },
  reasonBox: { backgroundColor: '#1C1010', borderWidth: 1, borderColor: '#3D2020', borderRadius: 8, padding: 10 },
  reasonText: { color: '#FF8A8A', fontSize: fontSizes.sm, fontFamily: fontFamilies.body, lineHeight: 19 },
  jobsLine: { color: '#C0CDE0', fontSize: fontSizes.sm, fontFamily: fontFamilies.body },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  btnText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },
  btnPlain: { borderColor: '#2A3A55', backgroundColor: admin.surfaceAlt },
  btnGreen: { borderColor: '#1E5C3E', backgroundColor: 'rgba(52,211,153,0.12)' },
  btnRed: { borderColor: '#5C2626', backgroundColor: '#2D1A1A' },
  empty: { backgroundColor: admin.surface, borderWidth: 1, borderColor: '#243050', borderStyle: 'dashed', borderRadius: 12, padding: 40, alignItems: 'center' },
  emptyText: { color: admin.muted, fontSize: fontSizes.sm, fontFamily: fontFamilies.body },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modal: { backgroundColor: admin.surface, borderWidth: 1, borderColor: admin.line, borderRadius: 14, padding: 22, width: '100%', maxWidth: 440 },
  mTitle: { fontSize: fontSizes.lg, fontFamily: fontFamilies.bodyBold, color: admin.ink, marginBottom: 12 },
  mNote: { color: '#A8B6CC', fontSize: fontSizes.sm, marginBottom: 14, lineHeight: 20, fontFamily: fontFamilies.body },
  textarea: { backgroundColor: '#1B2B4B', borderWidth: 1, borderColor: '#243050', borderRadius: 9, padding: 12, color: admin.ink, fontSize: fontSizes.md, minHeight: 90, textAlignVertical: 'top', fontFamily: fontFamilies.body },
  mErr: { color: admin.dangerBright, fontSize: fontSizes.xs, marginTop: 6, fontFamily: fontFamilies.body },
  mRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
});
