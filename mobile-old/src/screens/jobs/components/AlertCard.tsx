import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useAppSelector } from '../../../hooks/useAppDispatch';
import { matchLabel } from '../../../utils/matchLabel';
import { timeAgo, formatSalary } from '../../../utils/format';
import MatchBreakdown from './MatchBreakdown';
import type { JobAlert } from '../../../types/alert';

interface Props {
  alert: JobAlert;
  onPress: (alert: JobAlert) => void;
  onSave: (alert: JobAlert) => void;
  onDismiss: (alert: JobAlert) => void;
}

export default function AlertCard({ alert, onPress, onSave, onDismiss }: Props) {
  const swipeRef = useRef<Swipeable>(null);
  const savedIds = useAppSelector((s) => s.jobs.savedIds);
  const isSaved = savedIds.includes(alert.jobId);
  const isUnread = !alert.readAt && !alert.dismissedAt;
  const { job } = alert;
  const ml = matchLabel(alert.matchScore);

  const renderLeft = () => (
    <TouchableOpacity
      style={[s.action, s.actionSave]}
      onPress={() => { swipeRef.current?.close(); onSave(alert); }}
    >
      <Ionicons name={isSaved ? 'star' : 'star-outline'} size={24} color="#fff" />
      <Text style={s.actionText}>{isSaved ? 'Saved' : 'Save'}</Text>
    </TouchableOpacity>
  );

  const renderRight = () => (
    <TouchableOpacity
      style={[s.action, s.actionDismiss]}
      onPress={() => { swipeRef.current?.close(); onDismiss(alert); }}
    >
      <Ionicons name="close-circle-outline" size={24} color="#fff" />
      <Text style={s.actionText}>Dismiss</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeft}
      renderRightActions={renderRight}
      overshootLeft={false}
      overshootRight={false}
    >
      <TouchableOpacity style={s.card} onPress={() => onPress(alert)} activeOpacity={0.85}>
        {isUnread && <View style={s.unreadDot} />}

        <View style={s.row}>
          <View style={s.titleBlock}>
            <Text style={s.title} numberOfLines={1}>{job.title}</Text>
            <Text style={s.company} numberOfLines={1}>{job.company}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: ml.color + '22', borderColor: ml.color }]}>
            <Text style={[s.badgeText, { color: ml.color }]}>{alert.matchScore}%</Text>
          </View>
        </View>

        <View style={s.meta}>
          {job.location ? (
            <View style={s.metaItem}>
              <Ionicons name="location-outline" size={12} color="#7A8CA0" />
              <Text style={s.metaText}>{job.location}</Text>
            </View>
          ) : null}
          {(job as any).salaryMin || (job as any).salaryMax ? (
            <View style={s.metaItem}>
              <Ionicons name="cash-outline" size={12} color="#7A8CA0" />
              <Text style={s.metaText}>
                {formatSalary((job as any).salaryMin, (job as any).salaryMax, (job as any).currency, (job as any).salaryPeriod)}
              </Text>
            </View>
          ) : null}
          {(job as any).minHours ? (
            <View style={s.metaItem}>
              <Ionicons name="time-outline" size={12} color="#7A8CA0" />
              <Text style={s.metaText}>{(job as any).minHours}h min</Text>
            </View>
          ) : null}
          <View style={s.metaItem}>
            <Ionicons name="calendar-outline" size={12} color="#7A8CA0" />
            <Text style={s.metaText}>{timeAgo(alert.createdAt)}</Text>
          </View>
        </View>

        <MatchBreakdown breakdown={alert.breakdown} />
      </TouchableOpacity>
    </Swipeable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#1B2B4B',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 14,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00B4D8',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleBlock: { flex: 1, marginRight: 10 },
  title: { fontSize: 15, fontWeight: '600', color: '#E8F0F8', marginBottom: 2 },
  company: { fontSize: 13, color: '#7A8CA0' },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: '#7A8CA0' },
  action: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    marginVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  actionSave: { backgroundColor: '#F5A524', marginLeft: 16 },
  actionDismiss: { backgroundColor: '#FF4757', marginRight: 16 },
  actionText: { fontSize: 11, color: '#fff', fontWeight: '600' },
});
