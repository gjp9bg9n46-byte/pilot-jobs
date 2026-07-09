// Generic credential add-form modal. Renders the fields from a CredentialConfig,
// validates + POSTs (add-only; web has no credential edit), then calls onAdded so
// the Profile view can refresh.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { isAxiosError } from 'axios';
import api from '../lib/api';
import { CredentialConfig, Field, Form } from '../lib/credentialConfigs';
import {
  Checkbox, DateField, ErrorBanner, PrimaryButton, SelectField, Sheet, TextField,
} from './ui';

export default function CredentialModal({
  config, visible, onClose, onAdded,
}: {
  config: CredentialConfig | null;
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState<Form>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && config) { setForm({ ...config.initial }); setErrors({}); setBanner(''); }
  }, [visible, config]);

  if (!config) return null;
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBanner('');
    const errs = config.validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api.post(config.postPath, config.buildPayload(form));
      onAdded();
      onClose();
    } catch (err) {
      if (isAxiosError(err) && !err.response) setBanner("Couldn't reach the server — check your connection and try again.");
      else if (isAxiosError(err)) setBanner(err.response?.data?.error || (Array.isArray(err.response?.data?.errors) ? err.response.data.errors[0]?.msg : '') || 'Could not save. Please try again.');
      else setBanner('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: Field) => {
    if (field.visibleIf && !field.visibleIf(form)) return null;
    const err = errors[field.key];
    const val = form[field.key];
    switch (field.kind) {
      case 'text':
      case 'number':
        return (
          <View key={field.key} style={{ marginBottom: 14 }}>
            <TextField
              label={field.label}
              placeholder={field.placeholder}
              value={String(val ?? '')}
              onChangeText={(t) => set(field.key, t)}
              error={err}
              keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
              autoCapitalize={field.key === 'aircraftType' ? 'characters' : 'sentences'}
            />
          </View>
        );
      case 'select':
        return (
          <View key={field.key} style={{ marginBottom: 14 }}>
            <SelectField label={field.label} value={String(val ?? '')} options={field.options} onSelect={(v) => set(field.key, v)} error={err} />
          </View>
        );
      case 'date':
        return (
          <View key={field.key} style={{ marginBottom: 14 }}>
            <DateField label={field.label} required={field.required} value={String(val ?? '')} onChange={(v) => set(field.key, v)} error={err} disabled={field.disabledIf ? field.disabledIf(form) : false} />
          </View>
        );
      case 'checkbox':
        return (
          <View key={field.key} style={{ marginBottom: 14 }}>
            <Checkbox label={field.label} value={!!val} onChange={(v) => set(field.key, v)} />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Sheet visible={visible} title={config.title} onClose={onClose}>
      <ErrorBanner>{banner}</ErrorBanner>
      {config.fields.map(renderField)}
      <PrimaryButton label={saving ? 'Saving…' : 'Save'} loading={saving} onPress={submit} />
    </Sheet>
  );
}
