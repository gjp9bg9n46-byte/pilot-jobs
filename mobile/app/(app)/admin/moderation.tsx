// Airline factfile moderation — mirrors frontend/src/pages/AdminModeration.jsx. Dark.
// GET /admin/contributions?{page,limit:25} → { items, total, page, totalPages }; each
// item = { id, airline (current values via AIRLINE_DIFF_SELECT), proposedChanges,
// createdAt, contributorContext:{role,country,approvedCount} }. Expandable current→proposed
// diff per changed field (fleetDetail gets a readable line diff). Approve applies the
// changes immediately (POST /:id/approve); reject requires a note (POST /:id/reject {note}).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api from '../../../src/lib/api';
import { admin, fontFamilies, fontSizes, spacing } from '../../../src/theme/tokens';

const FIELD_LABELS: Record<string, string> = {
  headquarters: 'Headquarters', description: 'Description', bases: 'Bases', fleet: 'Fleet',
  fleetDetail: 'Fleet (detailed)', hiringStatus: 'Hiring Status', hiringFrequency: 'Hiring Frequency',
  payRanges: 'Pay Ranges', rosterPattern: 'Roster Pattern', contractType: 'Contract Type',
  workAuthRequired: 'Work Auth Required', avgResponseDays: 'Avg Response Days', interviewStages: 'Interview Stages',
  simType: 'Sim Type', upgradeTimeMinYears: 'Upgrade Min Years', upgradeTimeMaxYears: 'Upgrade Max Years',
  notes: 'Notes', region: 'Region',
};

function fmtValue(v: any): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '[ empty ]';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function relTime(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function contributorTag(ctx: any) {
  const parts: string[] = [];
  if (ctx.role) parts.push(ctx.role === 'FIRST_OFFICER' ? 'FO' : ctx.role === 'CAPTAIN' ? 'CPT' : ctx.role);
  if (ctx.country) parts.push(ctx.country);
  parts.push(`${ctx.approvedCount} approved`);
  return parts.join(' · ');
}
// Readable fleetDetail diff, matched by `type`.
function fleetDetailLines(before: any, after: any): string[] {
  const b = Array.isArray(before) ? before : [];
  const a = Array.isArray(after) ? after : [];
  const bm = Object.fromEntries(b.map((r: any) => [r.type, r]));
  const am = Object.fromEntries(a.map((r: any) => [r.type, r]));
  const c = (v: any) => (v == null ? '—' : v);
  const lines: string[] = [];
  for (const r of b) if (!(r.type in am)) lines.push(`Removed: ${r.type} (was ${c(r.inService)} in service)`);
  for (const r of a) if (!(r.type in bm)) lines.push(`Added: ${r.type} (${c(r.inService)} in service / ${c(r.ordered)} on order / ${c(r.retired)} retired)`);
  for (const r of a) {
    const o = bm[r.type];
    if (!o) continue;
    const parts: string[] = [];
    if ((o.inService ?? null) !== (r.inService ?? null)) parts.push(`in service ${c(o.inService)} → ${c(r.inService)}`);
    if ((o.ordered ?? null) !== (r.ordered ?? null)) parts.push(`on order ${c(o.ordered)} → ${c(r.ordered)}`);
    if ((o.retired ?? null) !== (r.retired ?? null)) parts.push(`retired ${c(o.retired)} → ${c(r.retired)}`);
    if (parts.length) lines.push(`Changed: ${r.type} (${parts.join(', ')})`);
  }
  return lines;
}

function DiffRow({ field, airline, proposed }: { field: string; airline: any; proposed: any }) {
  const current = airline[field];
  if (field === 'fleetDetail') {
    const lines = fleetDetailLines(current, proposed);
    return (
      <View style={styles.diffRow}>
        <Text style={styles.diffField}>Fleet (detailed)</Text>
        {lines.length === 0
          ? <Text style={styles.diffEmpty}>No effective changes</Text>
          : lines.map((l, i) => <Text key={i} style={styles.diffLine}>{l}</Text>)}
      </View>
    );
  }
  return (
    <View style={styles.diffRow}>
      <Text style={styles.diffField}>{FIELD_LABELS[field] || field}</Text>
      <View style={styles.diffValues}>
        <Text style={styles.diffCurrent}>{fmtValue(current)}</Text>
        <Text style={styles.diffArrow}> → </Text>
        <Text style={styles.diffProposed}>{fmtValue(proposed)}</Text>
      </View>
    </View>
  );
}

function ContributionCard({ item, onApprove, onReject }: { item: any; onApprove: (id: string) => Promise<void>; onReject: (id: string, note: string) => Promise<void> }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = Object.keys(item.proposedChanges);

  const handleApprove = async () => {
    setBusy(true); setError(null);
    try { await onApprove(item.id); } catch (e: any) { setError(e?.response?.data?.error || 'Failed to approve.'); setBusy(false); }
  };
  const handleReject = async () => {
    if (!rejectNote.trim()) { setError('Rejection note is required.'); return; }
    setBusy(true); setError(null);
    try { await onReject(item.id, rejectNote.trim()); } catch (e: any) { setError(e?.response?.data?.error || 'Failed to reject.'); setBusy(false); }
  };

  return (
    <View style={styles.card}>
      <Pressable style={[styles.cardHead, expanded && styles.cardHeadOpen]} onPress={() => setExpanded((v) => !v)}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={styles.cardHeadTop}>
            <Pressable onPress={() => router.push(`/airlines/${item.airline.id}`)}><Text style={styles.airlineLink}>{item.airline.name}</Text></Pressable>
            <View style={styles.fieldsBadge}><Text style={styles.fieldsBadgeText}>{fields.length} field{fields.length !== 1 ? 's' : ''} changed</Text></View>
            <Text style={styles.relTime}>{relTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.contributor}>{contributorTag(item.contributorContext)}</Text>
        </View>
        <Text style={styles.collapse}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.cardBody}>
          <View style={{ marginBottom: 12 }}>
            {fields.map((f) => <DiffRow key={f} field={f} airline={item.airline} proposed={item.proposedChanges[f]} />)}
          </View>
          {error ? <Text style={styles.cardError}>{error}</Text> : null}

          {rejecting ? (
            <View style={{ gap: 8 }}>
              <TextInput style={styles.rejectInput} multiline placeholder="Rejection reason (required, max 500 chars)…" placeholderTextColor={admin.dim} maxLength={500} value={rejectNote} onChangeText={setRejectNote} />
              <View style={styles.actionRow}>
                <Btn label="Cancel" bg={admin.surfaceAlt} fg={admin.muted} disabled={busy} onPress={() => { setRejecting(false); setRejectNote(''); setError(null); }} />
                <Btn label={busy ? 'Rejecting…' : 'Confirm reject'} bg={admin.reject} fg="#fff" disabled={busy} onPress={handleReject} accessibilityLabel="Confirm reject" />
              </View>
            </View>
          ) : confirmingApprove ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.confirmText}>Apply {fields.length} change{fields.length !== 1 ? 's' : ''} to {item.airline.name}? This is applied immediately and can't be undone here.</Text>
              <View style={styles.actionRow}>
                <Btn label="Cancel" bg={admin.surfaceAlt} fg={admin.muted} disabled={busy} onPress={() => { setConfirmingApprove(false); setError(null); }} />
                <Btn label={busy ? 'Approving…' : 'Confirm approve'} bg={admin.approve} fg="#fff" disabled={busy} onPress={handleApprove} accessibilityLabel="Confirm approve" />
              </View>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <Btn label="Reject" bg={admin.reject} fg="#fff" onPress={() => setRejecting(true)} />
              <Btn label="Approve" bg={admin.approve} fg="#fff" onPress={() => setConfirmingApprove(true)} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Btn({ label, bg, fg, onPress, disabled, accessibilityLabel }: { label: string; bg: string; fg: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel ?? label} style={[styles.actBtn, { backgroundColor: bg }, disabled && { opacity: 0.6 }]}>
      <Text style={[styles.actBtnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export default function AdminModeration() {
  const router = useRouter();
  const [data, setData] = useState<{ items: any[]; total: number; page: number; totalPages: number }>({ items: [], total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true); setError(false);
    try { const { data: res } = await api.get('/admin/contributions', { params: { page: p, limit: 25 } }); setData(res); }
    catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 401) router.replace('/jobs');
      else setError(true);
    } finally { setLoading(false); }
  }, [router]);
  useEffect(() => { load(page); }, [load, page]);

  const handleApprove = useCallback(async (id: string) => {
    await api.post(`/admin/contributions/${id}/approve`);
    setData((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id), total: prev.total - 1 }));
  }, []);
  const handleReject = useCallback(async (id: string, note: string) => {
    await api.post(`/admin/contributions/${id}/reject`, { note });
    setData((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id), total: prev.total - 1 }));
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={data.items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ContributionCard item={item} onApprove={handleApprove} onReject={handleReject} />}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(page)} tintColor={admin.accent} />}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.h1}>Moderation Queue{!loading ? <Text style={styles.pendingCount}>  {data.total} pending</Text> : null}</Text>
            <Text style={styles.sub}>Contributions are applied immediately on approval and cannot be undone here.</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? <View style={styles.center}><ActivityIndicator color={admin.accent} /></View>
            : error ? <View style={styles.center}><Text style={styles.errText}>Failed to load contributions.</Text></View>
              : <View style={styles.center}><Text style={styles.emptyText}>No pending contributions. The queue is clear.</Text></View>
        }
        ListFooterComponent={
          data.totalPages > 1 ? (
            <View style={styles.pager}>
              <Btn label="← Prev" bg="#1B2B4B" fg={admin.muted} disabled={page <= 1} onPress={() => setPage((p) => p - 1)} />
              <Text style={styles.pagerText}>{data.page} / {data.totalPages}</Text>
              <Btn label="Next →" bg="#1B2B4B" fg={admin.muted} disabled={page >= data.totalPages} onPress={() => setPage((p) => p + 1)} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: admin.bg },
  content: { padding: spacing.xl, paddingBottom: 40 },
  center: { paddingVertical: 60, alignItems: 'center' },
  h1: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xl, color: admin.ink },
  pendingCount: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodySemiBold, color: admin.queue },
  sub: { fontSize: fontSizes.xs, color: admin.dim, marginTop: 4, fontFamily: fontFamilies.body },
  emptyText: { color: admin.dim, fontSize: fontSizes.sm, fontFamily: fontFamilies.body, textAlign: 'center' },
  errText: { color: admin.danger, fontSize: fontSizes.sm, fontFamily: fontFamilies.body },
  card: { backgroundColor: admin.surface, borderWidth: 1, borderColor: admin.line, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  cardHead: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardHeadOpen: { borderBottomWidth: 1, borderBottomColor: admin.line },
  cardHeadTop: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  airlineLink: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodyBold, color: admin.accent },
  fieldsBadge: { backgroundColor: 'rgba(243,156,18,0.15)', borderWidth: 1, borderColor: 'rgba(243,156,18,0.3)', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 1 },
  fieldsBadgeText: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: admin.queue },
  relTime: { fontSize: fontSizes.xs, color: admin.dim, fontFamily: fontFamilies.body },
  contributor: { fontSize: 11, color: admin.muted, fontFamily: fontFamilies.body },
  collapse: { color: admin.dim, fontSize: 12 },
  cardBody: { padding: 16 },
  diffRow: { borderBottomWidth: 1, borderBottomColor: '#1B2B4B', paddingVertical: 8 },
  diffField: { fontSize: 12, fontFamily: fontFamilies.bodyBold, color: admin.dim, marginBottom: 4 },
  diffValues: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  diffCurrent: { fontSize: fontSizes.sm, color: admin.dim, fontFamily: fontFamilies.body, flexShrink: 1 },
  diffArrow: { color: '#2A3C55', fontSize: fontSizes.sm },
  diffProposed: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, color: '#C8D8E8', flexShrink: 1 },
  diffLine: { fontSize: fontSizes.sm, color: '#C8D8E8', lineHeight: 22, fontFamily: fontFamilies.body },
  diffEmpty: { fontSize: 12, color: admin.dim, fontStyle: 'italic', fontFamily: fontFamilies.body },
  cardError: { fontSize: 12, color: admin.danger, marginBottom: 10, fontFamily: fontFamilies.body },
  confirmText: { fontSize: fontSizes.sm, color: '#C8D8E8', lineHeight: 20, fontFamily: fontFamilies.body },
  rejectInput: { backgroundColor: admin.bg, borderWidth: 1, borderColor: '#2A3C55', borderRadius: 8, padding: 12, color: admin.ink, fontSize: fontSizes.sm, minHeight: 72, textAlignVertical: 'top', fontFamily: fontFamilies.body },
  actionRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  actBtn: { borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8 },
  actBtnText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold },
  pager: { flexDirection: 'row', gap: 12, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  pagerText: { fontSize: fontSizes.sm, color: admin.dim, fontFamily: fontFamilies.body },
});
