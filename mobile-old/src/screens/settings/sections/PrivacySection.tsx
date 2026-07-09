import React, { useRef, useState } from 'react';
import { SectionCard, Row, Toast } from './shared';
import { profileApi } from '../../../services/api';
import { useAutoSave } from '../../../hooks/useAutoSave';

export interface PrivacyPrefs {
  profileVisible: boolean;
  anonymousBrowsing: boolean;
  showSeniority: boolean;
}

interface Props {
  prefs: PrivacyPrefs;
  onChange: (p: PrivacyPrefs) => void;
}

export default function PrivacySection({ prefs, onChange }: Props) {
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 2500);
  };

  const persist = useAutoSave<PrivacyPrefs>(async (p) => {
    try {
      // TODO: backend — PATCH /profile/privacy with profileVisible, anonymousBrowsing, showSeniority
      await profileApi.updatePrivacy(p);
    } catch {
      showToast('Could not save privacy settings');
    }
  }, 400);

  const update = (patch: Partial<PrivacyPrefs>) => {
    const next = { ...prefs, ...patch };
    onChange(next);
    persist(next);
  };

  return (
    <SectionCard title="Privacy" icon="shield-checkmark-outline">
      {toast ? <Toast message={toast} /> : null}
      <Row
        label="Profile visible to recruiters"
        sublabel="When off, you won't appear in employer searches."
        value={prefs.profileVisible}
        onToggle={(v) => update({ profileVisible: v })}
      />
      <Row
        label="Anonymous job browsing"
        sublabel="Viewing a listing won't record a 'viewed by' entry."
        value={prefs.anonymousBrowsing}
        onToggle={(v) => update({ anonymousBrowsing: v })}
      />
      <Row
        label="Show seniority publicly"
        sublabel="Display years of experience on your recruiter-facing profile."
        value={prefs.showSeniority}
        onToggle={(v) => update({ showSeniority: v })}
      />
    </SectionCard>
  );
}
