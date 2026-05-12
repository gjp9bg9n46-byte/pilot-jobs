import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  label?: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
}

export default function DatePickerInput({
  label, value, onChange, minimumDate, maximumDate, placeholder = 'Select date',
}: Props) {
  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value || new Date());

  const displayDate = value
    ? value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder;

  const handleAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShow(false);
    if (event.type !== 'dismissed' && selected) {
      onChange(selected);
    }
  };

  const handleIOSChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (selected) setTempDate(selected);
  };

  return (
    <View>
      {label && <Text style={s.label}>{label}</Text>}
      <TouchableOpacity style={s.trigger} onPress={() => setShow(true)}>
        <Text style={[s.triggerText, !value && s.placeholder]}>{displayDate}</Text>
        <Ionicons name="calendar-outline" size={16} color="#00B4D8" />
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={s.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    onChange(tempDate);
                    setShow(false);
                  }}
                >
                  <Text style={s.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleIOSChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                textColor="#fff"
                style={{ backgroundColor: '#1B2B4B' }}
              />
            </View>
          </View>
        </Modal>
      ) : (
        show && (
          <DateTimePicker
            value={value || new Date()}
            mode="date"
            display="default"
            onChange={handleAndroidChange}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
          />
        )
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { color: '#C0CDE0', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0A1628', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#243050', marginBottom: 12,
  },
  triggerText: { color: '#fff', fontSize: 14 },
  placeholder: { color: '#4A6080' },
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: { backgroundColor: '#1B2B4B', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#243050',
  },
  modalCancel: { color: '#7A8CA0', fontSize: 16 },
  modalDone: { color: '#00B4D8', fontSize: 16, fontWeight: '700' },
});
