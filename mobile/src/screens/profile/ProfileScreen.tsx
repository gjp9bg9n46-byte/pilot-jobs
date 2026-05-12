import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Switch, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { profileApi } from '../../services/api';
import DatePickerInput from '../../components/DatePickerInput';

const LICENCE_TYPES = [
  { value: 'ATP',  label: 'ATPL (Airline Transport)' },
  { value: 'CPL',  label: 'CPL (Commercial)' },
  { value: 'MPL',  label: 'MPL (Multi-crew)' },
  { value: 'PPL',  label: 'PPL (Private)' },
  { value: 'IR',   label: 'IR (Instrument Rating)' },
  { value: 'ME',   label: 'ME (Multi-Engine)' },
];

const AUTHORITIES = [
  { value: 'FAA',    label: '🇺🇸 FAA — USA' },
  { value: 'EASA',   label: '🇪🇺 EASA — Europe' },
  { value: 'GCAA',   label: '🇦🇪 GCAA — UAE' },
  { value: 'CAAC',   label: '🇨🇳 CAAC — China' },
  { value: 'DGCA',   label: '🇮🇳 DGCA — India' },
  { value: 'CASA',   label: '🇦🇺 CASA — Australia' },
  { value: 'CAA_UK', label: '🇬🇧 CAA — UK' },
  { value: 'TCCA',   label: '🇨🇦 TCCA — Canada' },
  { value: 'ANAC',   label: '🇧🇷 ANAC — Brazil' },
  { value: 'JCAB',   label: '🇯🇵 JCAB — Japan' },
  { value: 'CAAS',   label: '🇸🇬 CAAS — Singapore' },
  { value: 'SACAA',  label: '🇿🇦 SACAA — South Africa' },
  { value: 'CAAN',   label: '🇳🇿 CAA — New Zealand' },
];

const MEDICAL_CLASSES = [
  { value: 'CLASS_1', label: 'Class 1 (Airline)' },
  { value: 'CLASS_2', label: 'Class 2 (Commercial)' },
  { value: 'CLASS_3', label: 'Class 3 (Private)' },
];

const ENGLISH_LEVELS = [
  { value: '4', label: 'ICAO Level 4 (Operational)' },
  { value: '5', label: 'ICAO Level 5 (Extended)' },
  { value: '6', label: 'ICAO Level 6 (Expert)' },
];

const LICENCE_ENDORSEMENTS = ['NVFR', 'IFR', 'Multi-engine', 'Seaplane', 'Mountain', 'Aerobatics', 'Instructor (FI)', 'Examiner (FE)'];

const RATING_CATEGORIES = ['Multi-Engine Land', 'Single-Engine Land', 'Multi-Engine Sea', 'Single-Engine Sea', 'Helicopter', 'Turboprop'];

const RATING_CAPACITIES = ['PIC', 'SIC / Co-pilot', 'Dual / Student'];

const TRAINING_TYPES = ['CRM', 'Dangerous Goods (DGR)', 'First Aid / AED', 'Fire & Evacuation', 'Security Awareness', 'RVSM', 'ETOPS', 'Low Visibility Ops', 'Other'];

const RTW_DOC_TYPES = ['Citizen / Passport', 'Work Visa', 'Permanent Residency', 'Sponsored Work Permit', 'EU Freedom of Movement', 'Other'];

function confirmDelete(message: string, onConfirm: () => Promise<void>) {
  Alert.alert('Confirm', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [personalForm, setPersonalForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([profileApi.get(), profileApi.getTotals()])
      .then(([{ data: p }, { data: t }]) => {
        setProfile(p);
        setTotals(t);
        setPersonalForm({
          firstName:            p.firstName ?? '',
          lastName:             p.lastName ?? '',
          phone:                p.phone ?? '',
          country:              p.country ?? '',
          city:                 p.city ?? '',
          nationality:          p.nationality ?? '',
          dateOfBirth:          p.dateOfBirth ? new Date(p.dateOfBirth) : null,
          passportNumber:       p.passportNumber ?? '',
          passportExpiry:       p.passportExpiry ? new Date(p.passportExpiry) : null,
          emergencyContactName:  p.emergencyContactName ?? '',
          emergencyContactPhone: p.emergencyContactPhone ?? '',
          willingToRelocate:    p.willingToRelocate ?? false,
          isInstructor:         p.isInstructor ?? false,
          isExaminer:           p.isExaminer ?? false,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const savePersonal = async () => {
    setSaving(true);
    try {
      await profileApi.update({
        ...personalForm,
        dateOfBirth:    personalForm.dateOfBirth?.toISOString() ?? null,
        passportExpiry: personalForm.passportExpiry?.toISOString() ?? null,
      });
      setProfile((p: any) => ({ ...p, ...personalForm }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      Alert.alert('Error', 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A1628', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#00B4D8" size="large" />
        <Text style={{ color: '#7A8CA0', marginTop: 12 }}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{profile?.firstName?.[0]}{profile?.lastName?.[0]}</Text>
        </View>
        <Text style={s.name}>{profile?.firstName} {profile?.lastName}</Text>
        <Text style={s.email}>{profile?.email}</Text>
        <Text style={s.hint}>The more complete your profile, the better jobs we match you to.</Text>
      </View>

      {/* Flight Hours Summary */}
      {totals && (
        <SectionCard title="Flight Experience" subtitle="Aggregated from your logbook" icon="time-outline">
          <View style={s.totalsGrid}>
            {[
              { label: 'Total', value: totals.totalTime },
              { label: 'PIC', value: totals.picTime },
              { label: 'SIC', value: totals.sicTime },
              { label: 'Night', value: totals.nightTime },
              { label: 'Multi-Engine', value: totals.multiEngineTime },
              { label: 'Turbine', value: totals.turbineTime },
              { label: 'Instrument', value: totals.instrumentTime },
            ].map(({ label, value }) => (
              <View key={label} style={s.totalCell}>
                <Text style={s.totalValue}>{Number(value).toLocaleString()}</Text>
                <Text style={s.totalLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={s.totalsNote}>
            {(totals.landingsDay + totals.landingsNight).toLocaleString()} total landings
            ({totals.landingsDay.toLocaleString()} day · {totals.landingsNight.toLocaleString()} night)
          </Text>
        </SectionCard>
      )}

      {/* Personal info */}
      {personalForm && (
        <SectionCard title="Personal Information" subtitle="Your account and contact details" icon="person-outline">
          {([
            { k: 'firstName',  label: 'First Name' },
            { k: 'lastName',   label: 'Last Name'  },
            { k: 'phone',      label: 'Phone',   keyboard: 'phone-pad' },
            { k: 'country',    label: 'Country of Residence' },
            { k: 'city',       label: 'City'     },
            { k: 'nationality', label: 'Nationality' },
          ] as { k: string; label: string; keyboard?: any }[]).map(({ k, label, keyboard }) => (
            <View key={k} style={{ marginBottom: 12 }}>
              <Text style={s.formLabel}>{label}</Text>
              <TextInput
                style={s.textInput}
                value={personalForm[k]}
                onChangeText={(v) => setPersonalForm((f: any) => ({ ...f, [k]: v }))}
                placeholder={label}
                placeholderTextColor="#4A6080"
                keyboardType={keyboard ?? 'default'}
                autoCapitalize={keyboard === 'phone-pad' ? 'none' : 'words'}
              />
            </View>
          ))}

          <DatePickerInput
            label="Date of Birth"
            value={personalForm.dateOfBirth}
            onChange={(d) => setPersonalForm((f: any) => ({ ...f, dateOfBirth: d }))}
            maximumDate={new Date()}
          />

          <View style={{ marginBottom: 12 }}>
            <Text style={s.formLabel}>Passport Number</Text>
            <TextInput
              style={s.textInput}
              value={personalForm.passportNumber}
              onChangeText={(v) => setPersonalForm((f: any) => ({ ...f, passportNumber: v }))}
              placeholder="e.g. A12345678"
              placeholderTextColor="#4A6080"
              autoCapitalize="characters"
            />
          </View>

          <DatePickerInput
            label="Passport Expiry"
            value={personalForm.passportExpiry}
            onChange={(d) => setPersonalForm((f: any) => ({ ...f, passportExpiry: d }))}
            minimumDate={new Date()}
          />

          <Text style={[s.formLabel, { marginTop: 4 }]}>Emergency Contact</Text>
          <TextInput
            style={[s.textInput, { marginBottom: 8 }]}
            value={personalForm.emergencyContactName}
            onChangeText={(v) => setPersonalForm((f: any) => ({ ...f, emergencyContactName: v }))}
            placeholder="Full name"
            placeholderTextColor="#4A6080"
            autoCapitalize="words"
          />
          <TextInput
            style={[s.textInput, { marginBottom: 12 }]}
            value={personalForm.emergencyContactPhone}
            onChangeText={(v) => setPersonalForm((f: any) => ({ ...f, emergencyContactPhone: v }))}
            placeholder="Phone number"
            placeholderTextColor="#4A6080"
            keyboardType="phone-pad"
          />

          {([
            { k: 'willingToRelocate', label: 'Willing to relocate' },
            { k: 'isInstructor',      label: 'Flight instructor'   },
            { k: 'isExaminer',        label: 'Examiner / TRE'      },
          ] as { k: string; label: string }[]).map(({ k, label }) => (
            <View key={k} style={s.switchRow}>
              <Text style={s.switchLabel}>{label}</Text>
              <Switch
                value={personalForm[k]}
                onValueChange={(v) => setPersonalForm((f: any) => ({ ...f, [k]: v }))}
                trackColor={{ false: '#243050', true: '#00B4D8' }}
                thumbColor="#fff"
              />
            </View>
          ))}

          <TouchableOpacity
            style={[s.saveBtn, { marginTop: 16, flex: 0 }, saving && { opacity: 0.6 }]}
            onPress={savePersonal}
            disabled={saving}
          >
            <Text style={s.saveBtnText}>
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </SectionCard>
      )}

      {/* Licences */}
      <SectionCard title="Pilot Licences" subtitle="Add every licence you hold" icon="ribbon-outline">
        {!profile?.certificates?.length && (
          <Text style={s.empty}>No licences added yet.</Text>
        )}
        {profile?.certificates?.map((cert: any) => {
          const licenceLabel = LICENCE_TYPES.find((l) => l.value === cert.type)?.label || cert.type;
          const authorityLabel = AUTHORITIES.find((a) => a.value === cert.issuingAuthority)?.label || cert.issuingAuthority;
          const expiry = cert.expiryDate ? new Date(cert.expiryDate) : null;
          const expired = expiry && expiry < new Date();
          const sub = [
            authorityLabel,
            cert.certificateNumber && `#${cert.certificateNumber}`,
            expiry && `${expired ? '⚠️ Expired' : 'Expires'} ${expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
            cert.englishLevel && `ICAO Eng. L${cert.englishLevel}`,
          ].filter(Boolean).join('  ·  ');
          return (
            <ItemRow
              key={cert.id}
              title={licenceLabel}
              subtitle={sub}
              onDelete={() =>
                confirmDelete('Remove this licence?', async () => {
                  await profileApi.deleteCertificate(cert.id);
                  setProfile((p: any) => ({ ...p, certificates: p.certificates.filter((c: any) => c.id !== cert.id) }));
                })
              }
            />
          );
        })}
        <AddLicenceForm
          onAdd={async (data: any) => {
            const { data: cert } = await profileApi.addCertificate(data);
            setProfile((p: any) => ({ ...p, certificates: [...(p.certificates || []), cert] }));
          }}
        />
      </SectionCard>

      {/* Medical */}
      <SectionCard title="Medical Certificate" subtitle="Required by most airlines" icon="medkit-outline">
        {!profile?.medicals?.length && (
          <Text style={s.empty}>No medical certificate added yet.</Text>
        )}
        {profile?.medicals?.map((med: any) => {
          const classLabel = MEDICAL_CLASSES.find((m) => m.value === med.medicalClass)?.label || med.medicalClass;
          const authorityLabel = AUTHORITIES.find((a) => a.value === med.issuingAuthority)?.label || med.issuingAuthority;
          const expiry = new Date(med.expiryDate);
          const expired = expiry < new Date();
          return (
            <ItemRow
              key={med.id}
              title={classLabel}
              subtitle={`${authorityLabel}  ·  ${expired ? '⚠️ Expired' : 'Expires'} ${expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              onDelete={() =>
                confirmDelete('Remove this medical?', async () => {
                  await profileApi.deleteMedical(med.id);
                  setProfile((p: any) => ({ ...p, medicals: p.medicals.filter((m: any) => m.id !== med.id) }));
                })
              }
            />
          );
        })}
        <AddMedicalForm
          onAdd={async (data: any) => {
            const { data: med } = await profileApi.addMedical(data);
            setProfile((p: any) => ({ ...p, medicals: [...(p.medicals || []), med] }));
          }}
        />
      </SectionCard>

      {/* Type Ratings */}
      <SectionCard title="Aircraft Type Ratings" subtitle="Aircraft you are rated to fly" icon="airplane-outline">
        {!profile?.ratings?.length && (
          <Text style={s.empty}>No type ratings added yet.</Text>
        )}
        {profile?.ratings?.map((r: any) => {
          const authorityLabel = AUTHORITIES.find((a) => a.value === r.issuingAuthority)?.label || r.issuingAuthority;
          const sub = [
            authorityLabel,
            r.category,
            r.capacity,
            r.hoursOnType != null && `${Number(r.hoursOnType).toLocaleString()} hrs`,
            r.proficiencyCheckDue && `OPC due ${new Date(r.proficiencyCheckDue).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`,
          ].filter(Boolean).join('  ·  ');
          return (
            <ItemRow
              key={r.id}
              title={r.aircraftType}
              subtitle={sub}
              onDelete={() =>
                confirmDelete('Remove this type rating?', async () => {
                  await profileApi.deleteRating(r.id);
                  setProfile((p: any) => ({ ...p, ratings: p.ratings.filter((rt: any) => rt.id !== r.id) }));
                })
              }
            />
          );
        })}
        <AddRatingForm
          onAdd={async (data: any) => {
            const { data: rating } = await profileApi.addRating(data);
            setProfile((p: any) => ({ ...p, ratings: [...(p.ratings || []), rating] }));
          }}
        />
      </SectionCard>

      {/* Training Records */}
      <SectionCard title="Recurrent Training" subtitle="CRM, DGR, OPC and other courses" icon="school-outline">
        {!profile?.trainingRecords?.length && (
          <Text style={s.empty}>No training records added yet.</Text>
        )}
        {profile?.trainingRecords?.map((t: any) => {
          const completed = new Date(t.completedAt);
          const expiry = t.expiresAt ? new Date(t.expiresAt) : null;
          const expired = expiry && expiry < new Date();
          const sub = [
            t.provider,
            completed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            expiry && `${expired ? '⚠️ Expired' : 'Valid until'} ${expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
          ].filter(Boolean).join('  ·  ');
          return (
            <ItemRow
              key={t.id}
              title={t.type}
              subtitle={sub}
              onDelete={() =>
                confirmDelete('Remove this training record?', async () => {
                  await profileApi.deleteTraining(t.id);
                  setProfile((p: any) => ({ ...p, trainingRecords: p.trainingRecords.filter((tr: any) => tr.id !== t.id) }));
                })
              }
            />
          );
        })}
        <AddTrainingForm
          onAdd={async (data: any) => {
            const { data: record } = await profileApi.addTraining(data);
            setProfile((p: any) => ({ ...p, trainingRecords: [record, ...(p.trainingRecords || [])] }));
          }}
        />
      </SectionCard>

      {/* Right to Work */}
      <SectionCard title="Right to Work" subtitle="Countries you are authorised to work in" icon="earth-outline">
        {!profile?.rightToWork?.length && (
          <Text style={s.empty}>No right-to-work documents added yet.</Text>
        )}
        {profile?.rightToWork?.map((rtw: any) => {
          const expiry = rtw.expiresAt ? new Date(rtw.expiresAt) : null;
          const expired = expiry && expiry < new Date();
          const sub = [
            rtw.documentType,
            rtw.documentNumber && `#${rtw.documentNumber}`,
            expiry ? `${expired ? '⚠️ Expired' : 'Expires'} ${expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No expiry',
          ].filter(Boolean).join('  ·  ');
          return (
            <ItemRow
              key={rtw.id}
              title={rtw.country}
              subtitle={sub}
              onDelete={() =>
                confirmDelete('Remove this right-to-work entry?', async () => {
                  await profileApi.deleteRightToWork(rtw.id);
                  setProfile((p: any) => ({ ...p, rightToWork: p.rightToWork.filter((r: any) => r.id !== rtw.id) }));
                })
              }
            />
          );
        })}
        <AddRightToWorkForm
          onAdd={async (data: any) => {
            const { data: rtw } = await profileApi.addRightToWork(data);
            setProfile((p: any) => ({ ...p, rightToWork: [...(p.rightToWork || []), rtw] }));
          }}
        />
      </SectionCard>

    </ScrollView>
  );
}

// ─────────────────────────── shared sub-components ───────────────────────────

function SectionCard({ title, subtitle, icon, children }: any) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Ionicons name={icon} size={20} color="#00B4D8" />
        <View style={{ marginLeft: 10 }}>
          <Text style={s.cardTitle}>{title}</Text>
          <Text style={s.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function ItemRow({ title, subtitle, onDelete }: any) {
  return (
    <View style={s.itemRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.itemTitle}>{title}</Text>
        {subtitle ? <Text style={s.itemSubtitle}>{subtitle}</Text> : null}
      </View>
      <TouchableOpacity onPress={onDelete} style={s.deleteBtnSmall}>
        <Ionicons name="trash-outline" size={17} color="#FF4757" />
      </TouchableOpacity>
    </View>
  );
}

// ────────────────────────────── Add Licence Form ──────────────────────────────

function AddLicenceForm({ onAdd }: { onAdd: (d: any) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('ATP');
  const [authority, setAuthority] = useState('FAA');
  const [certNumber, setCertNumber] = useState('');
  const [issueDate, setIssueDate] = useState<Date | null>(null);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [englishLevel, setEnglishLevel] = useState('');
  const [endorsements, setEndorsements] = useState<string[]>([]);

  const reset = () => {
    setType('ATP'); setAuthority('FAA'); setCertNumber('');
    setIssueDate(null); setExpiryDate(null); setEnglishLevel(''); setEndorsements([]);
  };

  const toggleEndorsement = (e: string) =>
    setEndorsements((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);

  if (!open) {
    return (
      <TouchableOpacity style={s.addBtn} onPress={() => setOpen(true)}>
        <Ionicons name="add-circle-outline" size={18} color="#00B4D8" />
        <Text style={s.addBtnText}>Add a licence</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.form}>
      <Text style={s.formLabel}>Licence type</Text>
      {LICENCE_TYPES.map((lt) => (
        <OptionRow key={lt.value} label={lt.label} selected={type === lt.value} onPress={() => setType(lt.value)} />
      ))}

      <Text style={[s.formLabel, { marginTop: 14 }]}>Issuing authority</Text>
      <AuthorityPicker value={authority} onChange={setAuthority} />

      <Text style={[s.formLabel, { marginTop: 14 }]}>Certificate / Licence number (optional)</Text>
      <TextInput
        style={s.textInput}
        value={certNumber}
        onChangeText={setCertNumber}
        placeholder="e.g. ATP-123456"
        placeholderTextColor="#4A6080"
        autoCapitalize="characters"
      />

      <DatePickerInput label="Issue date (optional)" value={issueDate} onChange={setIssueDate} />
      <DatePickerInput label="Expiry date (optional)" value={expiryDate} onChange={setExpiryDate} />

      <Text style={[s.formLabel, { marginTop: 2 }]}>ICAO English level (optional)</Text>
      <View style={s.chipRow}>
        {ENGLISH_LEVELS.map((el) => (
          <TouchableOpacity
            key={el.value}
            style={[s.chip, englishLevel === el.value && s.chipActive]}
            onPress={() => setEnglishLevel(englishLevel === el.value ? '' : el.value)}
          >
            <Text style={[s.chipText, englishLevel === el.value && s.chipTextActive]}>{el.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.formLabel, { marginTop: 14 }]}>Endorsements (optional)</Text>
      <View style={s.chipRow}>
        {LICENCE_ENDORSEMENTS.map((e) => (
          <TouchableOpacity
            key={e}
            style={[s.chip, endorsements.includes(e) && s.chipActive]}
            onPress={() => toggleEndorsement(e)}
          >
            <Text style={[s.chipText, endorsements.includes(e) && s.chipTextActive]}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.formActions}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => { reset(); setOpen(false); }}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.saveBtn}
          onPress={async () => {
            await onAdd({
              type,
              issuingAuthority: authority,
              certificateNumber: certNumber || null,
              issueDate: issueDate?.toISOString() ?? null,
              expiryDate: expiryDate?.toISOString() ?? null,
              englishLevel: englishLevel || null,
              endorsements,
            });
            reset(); setOpen(false);
          }}
        >
          <Text style={s.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ────────────────────────────── Add Medical Form ──────────────────────────────

function AddMedicalForm({ onAdd }: { onAdd: (d: any) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [medClass, setMedClass] = useState('CLASS_1');
  const [authority, setAuthority] = useState('FAA');
  const [issueDate, setIssueDate] = useState<Date | null>(null);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);

  const reset = () => {
    setMedClass('CLASS_1'); setAuthority('FAA'); setIssueDate(null); setExpiryDate(null);
  };

  if (!open) {
    return (
      <TouchableOpacity style={s.addBtn} onPress={() => setOpen(true)}>
        <Ionicons name="add-circle-outline" size={18} color="#00B4D8" />
        <Text style={s.addBtnText}>Add medical certificate</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.form}>
      <Text style={s.formLabel}>Medical class</Text>
      {MEDICAL_CLASSES.map((mc) => (
        <OptionRow key={mc.value} label={mc.label} selected={medClass === mc.value} onPress={() => setMedClass(mc.value)} />
      ))}

      <Text style={[s.formLabel, { marginTop: 14 }]}>Issuing authority</Text>
      <AuthorityPicker value={authority} onChange={setAuthority} />

      <DatePickerInput label="Issue date" value={issueDate} onChange={setIssueDate} />
      <DatePickerInput label="Expiry date" value={expiryDate} onChange={setExpiryDate} />

      <View style={s.formActions}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => { reset(); setOpen(false); }}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.saveBtn}
          onPress={async () => {
            if (!issueDate || !expiryDate)
              return Alert.alert('Missing dates', 'Please select issue and expiry dates.');
            await onAdd({
              medicalClass: medClass,
              issuingAuthority: authority,
              issueDate: issueDate.toISOString(),
              expiryDate: expiryDate.toISOString(),
            });
            reset(); setOpen(false);
          }}
        >
          <Text style={s.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ──────────────────────────── Add Rating Form ─────────────────────────────────

function AddRatingForm({ onAdd }: { onAdd: (d: any) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [aircraftType, setAircraftType] = useState('');
  const [authority, setAuthority] = useState('FAA');
  const [category, setCategory] = useState('Multi-Engine Land');
  const [capacity, setCapacity] = useState('PIC');
  const [hoursOnType, setHoursOnType] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [profCheckDate, setProfCheckDate] = useState<Date | null>(null);
  const [profCheckDue, setProfCheckDue] = useState<Date | null>(null);

  const reset = () => {
    setAircraftType(''); setAuthority('FAA'); setCategory('Multi-Engine Land');
    setCapacity('PIC'); setHoursOnType(''); setExpiryDate(null);
    setProfCheckDate(null); setProfCheckDue(null);
  };

  if (!open) {
    return (
      <TouchableOpacity style={s.addBtn} onPress={() => setOpen(true)}>
        <Ionicons name="add-circle-outline" size={18} color="#00B4D8" />
        <Text style={s.addBtnText}>Add type rating</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.form}>
      <Text style={s.formLabel}>Aircraft type (e.g. B737, A320, ATR72)</Text>
      <TextInput
        style={s.textInput}
        value={aircraftType}
        onChangeText={setAircraftType}
        placeholder="e.g. B737"
        placeholderTextColor="#4A6080"
        autoCapitalize="characters"
      />

      <Text style={[s.formLabel, { marginTop: 4 }]}>Issuing authority</Text>
      <AuthorityPicker value={authority} onChange={setAuthority} />

      <Text style={[s.formLabel, { marginTop: 14 }]}>Category</Text>
      <View style={s.chipRow}>
        {RATING_CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[s.chip, category === c && s.chipActive]}
            onPress={() => setCategory(c)}
          >
            <Text style={[s.chipText, category === c && s.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.formLabel, { marginTop: 14 }]}>Capacity</Text>
      <View style={s.chipRow}>
        {RATING_CAPACITIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[s.chip, capacity === c && s.chipActive]}
            onPress={() => setCapacity(c)}
          >
            <Text style={[s.chipText, capacity === c && s.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.formLabel, { marginTop: 14 }]}>Hours on type (optional)</Text>
      <TextInput
        style={s.textInput}
        value={hoursOnType}
        onChangeText={setHoursOnType}
        placeholder="e.g. 1200"
        placeholderTextColor="#4A6080"
        keyboardType="decimal-pad"
      />

      <DatePickerInput label="Rating expiry (optional)" value={expiryDate} onChange={setExpiryDate} />
      <DatePickerInput label="Last OPC / proficiency check (optional)" value={profCheckDate} onChange={setProfCheckDate} />
      <DatePickerInput label="Next OPC / proficiency check due (optional)" value={profCheckDue} onChange={setProfCheckDue} />

      <View style={s.formActions}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => { reset(); setOpen(false); }}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.saveBtn}
          onPress={async () => {
            if (!aircraftType.trim())
              return Alert.alert('Missing aircraft', 'Please enter the aircraft type.');
            await onAdd({
              aircraftType: aircraftType.trim(),
              issuingAuthority: authority,
              category,
              capacity,
              hoursOnType: hoursOnType ? Number(hoursOnType) : null,
              expiryDate: expiryDate?.toISOString() ?? null,
              proficiencyCheckDate: profCheckDate?.toISOString() ?? null,
              proficiencyCheckDue: profCheckDue?.toISOString() ?? null,
            });
            reset(); setOpen(false);
          }}
        >
          <Text style={s.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ──────────────────────────── Add Training Form ───────────────────────────────

function AddTrainingForm({ onAdd }: { onAdd: (d: any) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('CRM');
  const [customType, setCustomType] = useState('');
  const [provider, setProvider] = useState('');
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [remarks, setRemarks] = useState('');

  const reset = () => {
    setType('CRM'); setCustomType(''); setProvider('');
    setCompletedAt(null); setExpiresAt(null); setRemarks('');
  };

  if (!open) {
    return (
      <TouchableOpacity style={s.addBtn} onPress={() => setOpen(true)}>
        <Ionicons name="add-circle-outline" size={18} color="#00B4D8" />
        <Text style={s.addBtnText}>Add training record</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.form}>
      <Text style={s.formLabel}>Training type</Text>
      <View style={s.chipRow}>
        {TRAINING_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.chip, type === t && s.chipActive]}
            onPress={() => setType(t)}
          >
            <Text style={[s.chipText, type === t && s.chipTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {type === 'Other' && (
        <>
          <Text style={[s.formLabel, { marginTop: 14 }]}>Custom type name</Text>
          <TextInput
            style={s.textInput}
            value={customType}
            onChangeText={setCustomType}
            placeholder="e.g. Upset Recovery Training"
            placeholderTextColor="#4A6080"
          />
        </>
      )}

      <Text style={[s.formLabel, { marginTop: 14 }]}>Provider / Organisation (optional)</Text>
      <TextInput
        style={s.textInput}
        value={provider}
        onChangeText={setProvider}
        placeholder="e.g. CAE, FlightSafety, Airline Training Dept"
        placeholderTextColor="#4A6080"
      />

      <DatePickerInput label="Completed on" value={completedAt} onChange={setCompletedAt} maximumDate={new Date()} />
      <DatePickerInput label="Expires / renewal due (optional)" value={expiresAt} onChange={setExpiresAt} />

      <Text style={s.formLabel}>Remarks (optional)</Text>
      <TextInput
        style={[s.textInput, { minHeight: 72, textAlignVertical: 'top' }]}
        value={remarks}
        onChangeText={setRemarks}
        placeholder="Any notes about this training..."
        placeholderTextColor="#4A6080"
        multiline
      />

      <View style={s.formActions}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => { reset(); setOpen(false); }}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.saveBtn}
          onPress={async () => {
            if (!completedAt)
              return Alert.alert('Missing date', 'Please select a completion date.');
            const finalType = type === 'Other' ? (customType.trim() || 'Other') : type;
            await onAdd({
              type: finalType,
              provider: provider.trim() || null,
              completedAt: completedAt.toISOString(),
              expiresAt: expiresAt?.toISOString() ?? null,
              remarks: remarks.trim() || null,
            });
            reset(); setOpen(false);
          }}
        >
          <Text style={s.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────── Add Right to Work Form ──────────────────────────

function AddRightToWorkForm({ onAdd }: { onAdd: (d: any) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState('');
  const [docType, setDocType] = useState('Citizen / Passport');
  const [docNumber, setDocNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [noExpiry, setNoExpiry] = useState(false);

  const reset = () => {
    setCountry(''); setDocType('Citizen / Passport');
    setDocNumber(''); setExpiresAt(null); setNoExpiry(false);
  };

  if (!open) {
    return (
      <TouchableOpacity style={s.addBtn} onPress={() => setOpen(true)}>
        <Ionicons name="add-circle-outline" size={18} color="#00B4D8" />
        <Text style={s.addBtnText}>Add right-to-work country</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.form}>
      <Text style={s.formLabel}>Country</Text>
      <TextInput
        style={s.textInput}
        value={country}
        onChangeText={setCountry}
        placeholder="e.g. United States"
        placeholderTextColor="#4A6080"
        autoCapitalize="words"
      />

      <Text style={[s.formLabel, { marginTop: 4 }]}>Document type</Text>
      {RTW_DOC_TYPES.map((dt) => (
        <OptionRow key={dt} label={dt} selected={docType === dt} onPress={() => setDocType(dt)} />
      ))}

      <Text style={[s.formLabel, { marginTop: 14 }]}>Document number (optional)</Text>
      <TextInput
        style={s.textInput}
        value={docNumber}
        onChangeText={setDocNumber}
        placeholder="Visa / permit number"
        placeholderTextColor="#4A6080"
        autoCapitalize="characters"
      />

      <View style={s.switchRow}>
        <Text style={s.switchLabel}>No expiry (citizenship / permanent)</Text>
        <Switch
          value={noExpiry}
          onValueChange={setNoExpiry}
          trackColor={{ false: '#243050', true: '#00B4D8' }}
          thumbColor="#fff"
        />
      </View>

      {!noExpiry && (
        <DatePickerInput label="Expiry date" value={expiresAt} onChange={setExpiresAt} minimumDate={new Date()} />
      )}

      <View style={s.formActions}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => { reset(); setOpen(false); }}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.saveBtn}
          onPress={async () => {
            if (!country.trim())
              return Alert.alert('Missing country', 'Please enter a country.');
            if (!noExpiry && !expiresAt)
              return Alert.alert('Missing expiry', 'Please select an expiry date or toggle "No expiry".');
            await onAdd({
              country: country.trim(),
              documentType: docType,
              documentNumber: docNumber.trim() || null,
              expiresAt: noExpiry ? null : expiresAt?.toISOString(),
            });
            reset(); setOpen(false);
          }}
        >
          <Text style={s.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────── authority picker ────────────────────────────────

const OTHER_VALUE = '__OTHER__';

function AuthorityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isKnown = AUTHORITIES.some((a) => a.value === value);
  const [customText, setCustomText] = useState(isKnown ? '' : value);

  const handleSelect = (v: string) => {
    if (v === OTHER_VALUE) {
      onChange(customText);
    } else {
      onChange(v);
    }
  };

  const selectedKey = isKnown ? value : OTHER_VALUE;

  return (
    <>
      {AUTHORITIES.map((a) => (
        <OptionRow key={a.value} label={a.label} selected={selectedKey === a.value} onPress={() => handleSelect(a.value)} />
      ))}
      <OptionRow
        label="✏️  Other / Custom..."
        selected={selectedKey === OTHER_VALUE}
        onPress={() => handleSelect(OTHER_VALUE)}
      />
      {selectedKey === OTHER_VALUE && (
        <TextInput
          style={[s.textInput, { marginTop: 6 }]}
          value={customText}
          onChangeText={(t) => { setCustomText(t); onChange(t); }}
          placeholder="e.g. SACAA — South Africa, DGCA — Pakistan"
          placeholderTextColor="#4A6080"
          autoCapitalize="characters"
          autoFocus
        />
      )}
    </>
  );
}

// ──────────────────────────── reusable option row ─────────────────────────────

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.optionRow, selected && s.optionRowActive]}
      onPress={onPress}
    >
      <Text style={[s.optionText, selected && s.optionTextActive]}>{label}</Text>
      {selected && <Ionicons name="checkmark" size={16} color="#00B4D8" />}
    </TouchableOpacity>
  );
}

// ─────────────────────────────── styles ──────────────────────────────────────

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0A1628' },
  header:       { alignItems: 'center', paddingTop: 60, paddingBottom: 24, backgroundColor: '#1B2B4B', paddingHorizontal: 20 },
  avatar:       { width: 72, height: 72, borderRadius: 36, backgroundColor: '#00B4D8', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:   { color: '#fff', fontSize: 26, fontWeight: '800' },
  name:         { color: '#fff', fontSize: 20, fontWeight: '700' },
  email:        { color: '#7A8CA0', fontSize: 13, marginTop: 4 },
  hint:         { color: '#4A6080', fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 18 },

  // totals
  totalsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  totalCell:    { backgroundColor: '#0F2040', borderRadius: 8, padding: 10, alignItems: 'center', minWidth: 80, flex: 1 },
  totalValue:   { color: '#00B4D8', fontWeight: '800', fontSize: 16 },
  totalLabel:   { color: '#7A8CA0', fontSize: 11, marginTop: 2 },
  totalsNote:   { color: '#4A6080', fontSize: 12, marginTop: 4 },

  card:         { margin: 16, marginBottom: 0, backgroundColor: '#1B2B4B', borderRadius: 14, padding: 16 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardTitle:    { color: '#fff', fontWeight: '700', fontSize: 15 },
  cardSubtitle: { color: '#7A8CA0', fontSize: 12, marginTop: 2 },

  itemRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#243050' },
  itemTitle:     { color: '#fff', fontWeight: '600', fontSize: 14 },
  itemSubtitle:  { color: '#7A8CA0', fontSize: 12, marginTop: 3 },
  deleteBtnSmall: { padding: 6 },

  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 4 },
  addBtnText:    { color: '#00B4D8', fontWeight: '600', fontSize: 14 },

  form:          { marginTop: 14, backgroundColor: '#0F2040', borderRadius: 10, padding: 14 },
  formLabel:     { color: '#C0CDE0', fontSize: 13, fontWeight: '600', marginBottom: 8 },

  optionRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 6, backgroundColor: '#1B2B4B' },
  optionRowActive: { backgroundColor: '#0A2F50', borderWidth: 1, borderColor: '#00B4D8' },
  optionText:    { color: '#7A8CA0', fontSize: 14 },
  optionTextActive: { color: '#00B4D8', fontWeight: '600' },

  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1B2B4B', borderWidth: 1, borderColor: '#243050' },
  chipActive:    { backgroundColor: '#0A2F50', borderColor: '#00B4D8' },
  chipText:      { color: '#7A8CA0', fontSize: 12 },
  chipTextActive: { color: '#00B4D8', fontWeight: '600' },

  textInput:     { backgroundColor: '#0A1628', borderRadius: 8, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#243050', marginBottom: 12 },

  switchRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#243050', marginTop: 4 },
  switchLabel:   { color: '#C0CDE0', fontSize: 14, flex: 1, marginRight: 12 },

  formActions:   { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:     { flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#1B2B4B' },
  cancelText:    { color: '#7A8CA0', fontWeight: '600' },
  saveBtn:       { flex: 1, backgroundColor: '#00B4D8', borderRadius: 8, padding: 12, alignItems: 'center' },
  saveBtnText:   { color: '#fff', fontWeight: '700' },

  empty:         { color: '#4A6080', fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
});
