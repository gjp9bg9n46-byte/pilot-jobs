import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Linking, Share, Modal, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { jobApi } from '../../services/api';
import { toggleSavedId } from '../../store';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { timeAgo, formatSalary } from '../../utils/format';
import type { Job } from '../../types/job';
import { useToast } from '../../hooks/useToast';

const REPORT_REASONS = [
  'Position no longer available',
  'Duplicate listing',
  'Misleading requirements',
  'Salary not as advertised',
  'Spam or scam',
  'Other',
];

function ReqRow({ label, value, status }: { label: string; value: string | null; status?: 'met' | 'unmet' | null }) {
  if (!value) return null;
  return (
    <View style={s.reqRow}>
      <Text style={s.reqLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {status === 'met' && <Ionicons name="checkmark-circle" size={14} color="#2ECC71" />}
        {status === 'unmet' && <Ionicons name="close-circle" size={14} color="#FF4757" />}
        <Text style={s.reqValue}>{value}</Text>
      </View>
    </View>
  );
}

function ToastBar({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={s.toast}>
      <Text style={s.toastText}>{message}</Text>
    </View>
  );
}

export default function JobDetailScreen({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const savedIds = useAppSelector((s) => s.jobs.savedIds);
  const pilot = useAppSelector((s) => s.auth.pilot);
  const { showToast, toastMessage, toastVisible } = useToast();

  const job: Job = route.params.job;
  const isSaved = savedIds.includes(job.id);
  const [isApplied, setIsApplied] = useState(job.isApplied ?? false);
  const [applying, setApplying] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // Save heart in header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 14, marginRight: 4 }}>
          <TouchableOpacity onPress={handleShare} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Ionicons name="share-outline" size={22} color="#7A8CA0" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSaveToggle} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={22} color={isSaved ? '#FF4757' : '#7A8CA0'} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [isSaved, navigation]);

  const handleSaveToggle = async () => {
    dispatch(toggleSavedId(job.id));
    try {
      if (isSaved) {
        await jobApi.unsaveJob(job.id);
        showToast('Removed from saved jobs');
      } else {
        await jobApi.saveJob(job.id);
        showToast('Job saved');
      }
    } catch {
      dispatch(toggleSavedId(job.id)); // revert
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: `${job.title} — ${job.company}`,
        message: `${job.title} at ${job.company} (${job.location || job.country || 'location TBC'})\n\n${job.applyUrl}`,
      });
    } catch {}
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      await Linking.openURL(job.applyUrl);
      await jobApi.applyToJob(job.id);
      setIsApplied(true);
      showToast('Application tracked');
    } catch {
      // URL open may still succeed even if API fails
    } finally {
      setApplying(false);
    }
  };

  const handleReport = async () => {
    if (!reportReason) return;
    setReportLoading(true);
    try {
      await jobApi.reportJob(job.id, reportReason);
      setReportSent(true);
    } catch {
      showToast('Failed to send report. Try again.');
    } finally {
      setReportLoading(false);
    }
  };

  // Pilot qualification checks (best-effort from in-memory pilot data)
  const certTypes: string[] = pilot?.certificates?.map((c: any) => c.type) ?? [];
  const certAuthorities: string[] = pilot?.certificates?.map((c: any) => c.issuingAuthority) ?? [];
  const ratingAircraft: string[] = pilot?.ratings?.map((r: any) => r.aircraftType.toLowerCase()) ?? [];
  const medicalClasses: string[] = pilot?.medicals?.map((m: any) => m.medicalClass) ?? [];
  const hasProfile = certTypes.length > 0;

  function certStatus(req: string[]): 'met' | 'unmet' | null {
    if (!hasProfile || req.length === 0) return null;
    return req.some((r) => certTypes.includes(r)) ? 'met' : 'unmet';
  }
  function authorityStatus(req: string[]): 'met' | 'unmet' | null {
    if (!hasProfile || req.length === 0) return null;
    return req.some((r) => certAuthorities.includes(r)) ? 'met' : 'unmet';
  }
  function aircraftStatus(req: string[]): 'met' | 'unmet' | null {
    if (!hasProfile || req.length === 0) return null;
    return req.some((r) => ratingAircraft.includes(r.toLowerCase())) ? 'met' : 'unmet';
  }
  function medicalStatus(req: string | null): 'met' | 'unmet' | null {
    if (!hasProfile || !req) return null;
    return medicalClasses.includes(req) ? 'met' : 'unmet';
  }

  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);

  return (
    <View style={{ flex: 1, backgroundColor: '#0A1628' }}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header info */}
        <Text style={s.title}>{job.title}</Text>
        <Text style={s.company}>{job.company}</Text>

        <View style={s.metaWrap}>
          {(job.location || job.country) ? (
            <View style={s.metaRow}>
              <Ionicons name="location-outline" size={15} color="#7A8CA0" />
              <Text style={s.meta}>{job.location || job.country}</Text>
            </View>
          ) : null}
          {job.role && (
            <View style={s.metaRow}>
              <Ionicons name="person-outline" size={15} color="#7A8CA0" />
              <Text style={s.meta}>{job.role}</Text>
            </View>
          )}
          {job.contractType && (
            <View style={s.metaRow}>
              <Ionicons name="document-text-outline" size={15} color="#7A8CA0" />
              <Text style={s.meta}>{job.contractType.charAt(0) + job.contractType.slice(1).toLowerCase()}</Text>
            </View>
          )}
        </View>

        {/* Salary & timing badges */}
        <View style={s.badgeRow}>
          {salary ? (
            <View style={[s.badge, s.salaryBadge]}>
              <Ionicons name="cash-outline" size={13} color="#2ECC71" />
              <Text style={[s.badgeText, { color: '#2ECC71' }]}>{salary}</Text>
            </View>
          ) : null}
          <View style={s.badge}>
            <Ionicons name="time-outline" size={13} color="#7A8CA0" />
            <Text style={s.badgeText}>Posted {timeAgo(job.postedAt)}</Text>
          </View>
          {isApplied && (
            <View style={[s.badge, s.appliedBadge]}>
              <Ionicons name="checkmark-circle" size={13} color="#2ECC71" />
              <Text style={[s.badgeText, { color: '#2ECC71' }]}>Applied</Text>
            </View>
          )}
        </View>

        {/* Requirements */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Requirements {hasProfile ? '· vs your profile' : ''}</Text>
          {job.reqAuthorities?.length > 0 && (
            <ReqRow label="Authority" value={job.reqAuthorities.join(', ')} status={authorityStatus(job.reqAuthorities)} />
          )}
          {job.reqCertificates?.length > 0 && (
            <ReqRow label="Certificate" value={job.reqCertificates.join(', ')} status={certStatus(job.reqCertificates)} />
          )}
          <ReqRow label="Min Total Hours" value={job.reqMinTotalHours ? `${job.reqMinTotalHours.toLocaleString()} hrs` : null} />
          <ReqRow label="Min PIC Hours" value={job.reqMinPicHours ? `${job.reqMinPicHours.toLocaleString()} hrs` : null} />
          <ReqRow label="Min Multi-Engine" value={job.reqMinMultiEngineHours ? `${job.reqMinMultiEngineHours.toLocaleString()} hrs` : null} />
          <ReqRow label="Min Turbine" value={job.reqMinTurbineHours ? `${job.reqMinTurbineHours.toLocaleString()} hrs` : null} />
          {job.reqAircraftTypes?.length > 0 && (
            <ReqRow label="Aircraft Types" value={job.reqAircraftTypes.join(', ')} status={aircraftStatus(job.reqAircraftTypes)} />
          )}
          {job.reqMedicalClass && (
            <ReqRow label="Medical" value={job.reqMedicalClass.replace('_', ' ')} status={medicalStatus(job.reqMedicalClass)} />
          )}
          {!hasProfile && (
            <TouchableOpacity style={s.profileCta} onPress={() => navigation.navigate('Main', { screen: 'Profile' })}>
              <Ionicons name="information-circle-outline" size={14} color="#00B4D8" />
              <Text style={s.profileCtaText}>Complete your profile to see match indicators</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Description */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Description</Text>
          <Text style={s.description}>{job.description}</Text>
        </View>

        {/* Report link */}
        <TouchableOpacity style={s.reportLink} onPress={() => setShowReport(true)}>
          <Ionicons name="flag-outline" size={14} color="#4A6080" />
          <Text style={s.reportLinkText}>Report this listing</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Apply button (floating) */}
      <View style={s.applyWrap}>
        <TouchableOpacity
          style={[s.applyBtn, isApplied && s.applyBtnDone]}
          onPress={isApplied ? undefined : handleApply}
          disabled={applying || isApplied}
        >
          {applying ? (
            <ActivityIndicator color="#fff" />
          ) : isApplied ? (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={s.applyText}>Applied</Text>
            </>
          ) : (
            <>
              <Text style={s.applyText}>Apply Now</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Toast */}
      <ToastBar message={toastMessage} visible={toastVisible} />

      {/* Report modal */}
      <Modal visible={showReport} animationType="slide" transparent onRequestClose={() => setShowReport(false)}>
        <View style={s.reportOverlay}>
          <View style={s.reportSheet}>
            <View style={s.reportHeader}>
              <Text style={s.reportTitle}>{reportSent ? 'Report sent' : 'Report listing'}</Text>
              <TouchableOpacity onPress={() => { setShowReport(false); setReportSent(false); setReportReason(''); }}>
                <Ionicons name="close" size={22} color="#7A8CA0" />
              </TouchableOpacity>
            </View>

            {reportSent ? (
              <View style={{ alignItems: 'center', padding: 32, gap: 12 }}>
                <Ionicons name="checkmark-circle" size={48} color="#2ECC71" />
                <Text style={s.reportThanks}>Thanks for letting us know. We'll review this listing shortly.</Text>
              </View>
            ) : (
              <>
                {REPORT_REASONS.map((reason) => (
                  <TouchableOpacity key={reason} style={s.reportRow} onPress={() => setReportReason(reason)}>
                    <View style={[s.reportRadio, reportReason === reason && s.reportRadioActive]} />
                    <Text style={s.reportRowText}>{reason}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[s.reportSubmit, (!reportReason || reportLoading) && { opacity: 0.5 }]}
                  onPress={handleReport}
                  disabled={!reportReason || reportLoading}
                >
                  {reportLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.reportSubmitText}>Submit Report</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  title:        { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  company:      { color: '#00B4D8', fontSize: 16, fontWeight: '600', marginBottom: 10 },
  metaWrap:     { gap: 6, marginBottom: 14 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta:         { color: '#7A8CA0', fontSize: 14 },
  badgeRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  badge:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1B2B4B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  salaryBadge:  { backgroundColor: '#0D2A10' },
  appliedBadge: { backgroundColor: '#0D2A10' },
  badgeText:    { color: '#7A8CA0', fontSize: 12, fontWeight: '600' },
  section:      { backgroundColor: '#1B2B4B', borderRadius: 12, padding: 16, marginBottom: 14 },
  sectionTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 12 },
  reqRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#243050' },
  reqLabel:     { color: '#7A8CA0', fontSize: 13 },
  reqValue:     { color: '#fff', fontSize: 13, fontWeight: '600', maxWidth: '58%', textAlign: 'right' },
  profileCta:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  profileCtaText: { color: '#00B4D8', fontSize: 12 },
  description:  { color: '#C0CDE0', fontSize: 14, lineHeight: 22 },
  reportLink:   { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 4, marginBottom: 20, opacity: 0.6 },
  reportLinkText: { color: '#4A6080', fontSize: 13 },
  applyWrap:    { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: '#0A1628', borderTopWidth: 1, borderTopColor: '#1B2B4B' },
  applyBtn:     { backgroundColor: '#00B4D8', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  applyBtnDone: { backgroundColor: '#1B5E20' },
  applyText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  toast:        { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#243050', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  toastText:    { color: '#fff', fontSize: 13, fontWeight: '600' },
  // Report modal
  reportOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  reportSheet:   { backgroundColor: '#0E1E34', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  reportHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#243050' },
  reportTitle:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  reportThanks:  { color: '#7A8CA0', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  reportRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1B2B4B' },
  reportRadio:   { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#4A6080' },
  reportRadioActive: { borderColor: '#00B4D8', backgroundColor: '#00B4D8' },
  reportRowText: { color: '#C0CDE0', fontSize: 14 },
  reportSubmit:  { margin: 20, backgroundColor: '#00B4D8', borderRadius: 10, padding: 14, alignItems: 'center' },
  reportSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
