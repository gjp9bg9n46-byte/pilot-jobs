import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { flightLogApi, profileApi } from '../../../services/api';

// expo-file-system v18+ moved documentDirectory to FileSystem.Paths.document.uri
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docDir: string = (FileSystem as any).documentDirectory ?? '';
import { SectionCard } from './shared';

// TODO: install expo-sharing for the share sheet (expo install expo-sharing)
// import * as Sharing from 'expo-sharing';

export default function DataSection() {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExportCsv = async () => {
    setExporting('csv');
    try {
      // TODO: backend — GET /flight-logs/export/csv endpoint needed
      const { data } = await flightLogApi.exportCsv();
      const path = docDir + `logbook_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, typeof data === 'string' ? data : JSON.stringify(data));
      alert(`CSV saved to app documents.\nInstall expo-sharing to open share sheet.`);
    } catch {
      alert('CSV export requires backend support (GET /flight-logs/export/csv).');
    } finally {
      setExporting(null);
    }
  };

  const handleExportForeFlight = async () => {
    setExporting('ff');
    try {
      // TODO: backend — GET /flight-logs/export/foreflight endpoint needed
      const { data } = await flightLogApi.exportForeFlight();
      const path = docDir + `logbook_foreflight_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, typeof data === 'string' ? data : JSON.stringify(data));
      alert(`ForeFlight CSV saved to app documents.`);
    } catch {
      alert('ForeFlight export requires backend support.');
    } finally {
      setExporting(null);
    }
  };

  const handleExportAllData = async () => {
    setExporting('all');
    try {
      // TODO: backend — GET /me/export endpoint needed
      const { data } = await profileApi.exportData();
      const path = docDir + `pilot_data_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2));
      alert(`All data exported to app documents.`);
    } catch {
      alert('Data export requires backend support (GET /me/export).');
    } finally {
      setExporting(null);
    }
  };

  return (
    <SectionCard title="Data" icon="server-outline">
      {/* Logbook exports */}
      <Text style={s.groupLabel}>EXPORT LOGBOOK</Text>
      <ExportRow
        icon="document-text-outline"
        label="CSV (raw)"
        sublabel="All flight records as a spreadsheet"
        loading={exporting === 'csv'}
        onPress={handleExportCsv}
      />
      <ExportRow
        icon="airplane-outline"
        label="ForeFlight CSV"
        sublabel="Compatible with ForeFlight import format"
        loading={exporting === 'ff'}
        onPress={handleExportForeFlight}
      />

      {/* Cloud backup */}
      <Text style={[s.groupLabel, { marginTop: 14 }]}>CLOUD BACKUP</Text>
      <View style={s.backupRow}>
        <Ionicons name="cloud-upload-outline" size={18} color="#7A8CA0" />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.backupLabel}>Automatic logbook backup</Text>
          <Text style={s.backupSub}>Daily / weekly / off</Text>
        </View>
        <Text style={s.comingSoon}>Coming soon</Text>
        {/* TODO: backend — schedule backup cron / trigger */}
      </View>

      {/* Export all */}
      <Text style={[s.groupLabel, { marginTop: 14 }]}>MY DATA</Text>
      <ExportRow
        icon="download-outline"
        label="Export all my data"
        sublabel="Profile, logbook, licences, applications as JSON"
        loading={exporting === 'all'}
        onPress={handleExportAllData}
      />
    </SectionCard>
  );
}

function ExportRow({ icon, label, sublabel, loading, onPress }: {
  icon: string; label: string; sublabel: string; loading: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.exportRow} onPress={onPress} disabled={loading}>
      <Ionicons name={icon as any} size={18} color="#00B4D8" />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={s.exportLabel}>{label}</Text>
        <Text style={s.exportSub}>{sublabel}</Text>
      </View>
      {loading
        ? <ActivityIndicator color="#00B4D8" size="small" />
        : <Ionicons name="chevron-forward" size={16} color="#4A6080" />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  groupLabel:  { color: '#4A6080', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  exportRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#243050' },
  exportLabel: { color: '#C0CDE0', fontSize: 14, fontWeight: '600' },
  exportSub:   { color: '#7A8CA0', fontSize: 12, marginTop: 2 },
  backupRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#243050' },
  backupLabel: { color: '#C0CDE0', fontSize: 14, fontWeight: '600' },
  backupSub:   { color: '#7A8CA0', fontSize: 12, marginTop: 2 },
  comingSoon:  { color: '#4A6080', fontSize: 12 },
});
