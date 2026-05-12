import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

// ─── NOAA simplified civil-twilight calculator ────────────────────────────────
// Accuracy ~0.5° (good enough for logbook purposes).

function getDayOfYear(d: Date): number {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((utc - start) / 86_400_000);
}

function getCivilTwilight(
  lat: number,
  lon: number,
  date: Date,
): { rise: Date; set: Date } | null {
  const N = getDayOfYear(date);
  const B = ((360 / 365) * (N - 81)) * (Math.PI / 180);
  const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const decl = 23.45 * Math.sin(B) * (Math.PI / 180);
  const latR = lat * (Math.PI / 180);

  const cosH =
    (Math.cos(96 * Math.PI / 180) - Math.sin(latR) * Math.sin(decl)) /
    (Math.cos(latR) * Math.cos(decl));

  if (cosH > 1 || cosH < -1) return null; // polar night / midnight sun

  const H = Math.acos(cosH) * (180 / Math.PI); // degrees
  const solarNoonUTC = 12 - EoT / 60 - lon / 15; // UTC hours

  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const rise = new Date(midnight + (solarNoonUTC - H / 15) * 3_600_000);
  const set = new Date(midnight + (solarNoonUTC + H / 15) * 3_600_000);
  return { rise, set };
}

export function computeNightHours(
  blockOff: Date,
  blockOn: Date,
  depLat: number | null,
  depLon: number | null,
  arrLat: number | null,
  arrLon: number | null,
): number | null {
  if (depLat == null || depLon == null || arrLat == null || arrLon == null) return null;

  const midLat = (depLat + arrLat) / 2;
  const midLon = (depLon + arrLon) / 2;
  const tw = getCivilTwilight(midLat, midLon, blockOff);
  if (!tw) return null;

  const start = blockOff.getTime();
  const end = blockOn.getTime();
  if (end <= start) return 0;

  const riseMs = tw.rise.getTime();
  const setMs = tw.set.getTime();

  const dayStart = Math.max(start, riseMs);
  const dayEnd = Math.min(end, setMs);
  const dayMs = dayEnd > dayStart ? dayEnd - dayStart : 0;

  return Math.max(0, (end - start - dayMs) / 3_600_000);
}

// ─── Component ────────────────────────────────────────────────────────────────

function round5(d: Date): Date {
  const ms = 5 * 60 * 1000;
  return new Date(Math.round(d.getTime() / ms) * ms);
}

interface TimeTriggerProps {
  label: string;
  value: Date | null;
  onPress: () => void;
}

function TimeTrigger({ label, value, onPress }: TimeTriggerProps) {
  const display = value
    ? value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '--:--';
  return (
    <TouchableOpacity style={s.trigger} onPress={onPress}>
      <Text style={s.triggerLabel}>{label}</Text>
      <View style={s.triggerValue}>
        <Text style={[s.triggerTime, !value && s.placeholder]}>{display}</Text>
        <Ionicons name="time-outline" size={14} color="#00B4D8" />
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  flightDate: Date;
  blockOff: Date | null;
  blockOn: Date | null;
  onBlockOffChange: (d: Date) => void;
  onBlockOnChange: (d: Date) => void;
}

export default function BlockTimePicker({
  flightDate, blockOff, blockOn, onBlockOffChange, onBlockOnChange,
}: Props) {
  const [picking, setPicking] = useState<'off' | 'on' | null>(null);
  const [tempTime, setTempTime] = useState<Date>(new Date());

  const mergeTime = (base: Date, timeSrc: Date): Date => {
    const d = new Date(base);
    d.setHours(timeSrc.getHours(), timeSrc.getMinutes(), 0, 0);
    return d;
  };

  const openPicker = (which: 'off' | 'on') => {
    const current =
      which === 'off'
        ? (blockOff ?? round5(new Date()))
        : (blockOn ?? (blockOff ? new Date(blockOff.getTime() + 3_600_000) : round5(new Date())));
    setTempTime(current);
    setPicking(which);
  };

  const handleAndroid = (event: DateTimePickerEvent, selected?: Date) => {
    setPicking(null);
    if (event.type === 'dismissed' || !selected) return;
    const merged = mergeTime(flightDate, selected);
    if (picking === 'off') onBlockOffChange(merged);
    else onBlockOnChange(merged);
  };

  const handleIOSChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (selected) setTempTime(selected);
  };

  const confirmIOS = () => {
    const merged = mergeTime(flightDate, tempTime);
    if (picking === 'off') onBlockOffChange(merged);
    else onBlockOnChange(merged);
    setPicking(null);
  };

  return (
    <>
      <View style={s.row}>
        <TimeTrigger label="Block Off (UTC)" value={blockOff} onPress={() => openPicker('off')} />
        <Ionicons name="arrow-forward" size={16} color="#4A6080" style={{ marginTop: 28 }} />
        <TimeTrigger label="Block On (UTC)" value={blockOn} onPress={() => openPicker('on')} />
      </View>

      {Platform.OS === 'ios' ? (
        <Modal visible={picking !== null} transparent animationType="slide">
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHeader}>
                <TouchableOpacity onPress={() => setPicking(null)}>
                  <Text style={s.cancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={s.sheetTitle}>{picking === 'off' ? 'Block Off' : 'Block On'}</Text>
                <TouchableOpacity onPress={confirmIOS}>
                  <Text style={s.done}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempTime}
                mode="time"
                display="spinner"
                is24Hour
                onChange={handleIOSChange}
                textColor="#fff"
                style={{ backgroundColor: '#1B2B4B' }}
              />
            </View>
          </View>
        </Modal>
      ) : (
        picking !== null && (
          <DateTimePicker
            value={tempTime}
            mode="time"
            display="default"
            is24Hour
            onChange={handleAndroid}
          />
        )
      )}
    </>
  );
}

const s = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  trigger:      { flex: 1 },
  triggerLabel: { color: '#C0CDE0', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  triggerValue: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0A1628', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#243050',
  },
  triggerTime:  { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  placeholder:  { color: '#4A6080' },
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { backgroundColor: '#1B2B4B', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHeader:  {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#243050',
  },
  sheetTitle:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancel:       { color: '#7A8CA0', fontSize: 16 },
  done:         { color: '#00B4D8', fontSize: 16, fontWeight: '700' },
});
