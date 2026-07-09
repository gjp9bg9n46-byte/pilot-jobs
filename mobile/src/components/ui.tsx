// Shared themed UI primitives for the auth screens (and beyond). Mirrors the web
// app's editorial-light form styling: navy filled primary buttons, ghost
// secondary, inline field errors, and the red/green banner treatments from
// frontend/src/components/auth/*. Pilot surfaces use Fraunces for the logo;
// employer surfaces pass `variant="employer"` to render Inter headers (the web
// .app-b2b scope collapses the display font to Inter).
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import DateTimePicker from '@react-native-community/datetimepicker';
import { fontFamilies, fontSizes, pilot, semantic, spacing } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

const DP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: string): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${String(dt.getDate()).padStart(2, '0')} ${DP_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

// Date field — pressable that opens a native date picker; value is 'YYYY-MM-DD' | ''.
export function DateField({
  label, required, value, onChange, error, disabled, clearable = true,
}: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void;
  error?: string; disabled?: boolean; clearable?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <FieldLabel label={label} required={required} />
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={[styles.input, styles.selectRow, !!error && styles.inputError, disabled && { opacity: 0.5 }]}
      >
        <Text style={value ? styles.selectValue : styles.selectPlaceholder}>{value ? fmtDate(value) : 'Select date'}</Text>
        {value && clearable && !disabled
          ? <Text onPress={() => onChange('')} style={styles.dateClear}>✕</Text>
          : <Text style={styles.selectChevron}>▾</Text>}
      </Pressable>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {open ? (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_e, d) => { setOpen(Platform.OS === 'ios'); if (d) onChange(d.toISOString().slice(0, 10)); }}
        />
      ) : null}
    </View>
  );
}

// Checkbox row.
export function Checkbox({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable style={styles.checkboxRow} onPress={() => onChange(!value)}>
      <View style={[styles.checkbox, value && styles.checkboxOn]}>{value ? <Text style={styles.checkboxTick}>✓</Text> : null}</View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

// Bottom-sheet modal used by the credential add forms.
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheetBody}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.sheetClose}>✕</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Logo ────────────────────────────────────────────────────────────────────

export function PlaneMark({ size = 22, color }: { size?: number; color?: string }) {
  const pilot = useThemeColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M16 9H3.5M10 4L16 9l-6 5M7 6L2 9l5 3"
        stroke={color ?? pilot.navy}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function Logo() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.logoRow}>
      <PlaneMark />
      <Text style={styles.logoText}>CockpitHire</Text>
    </View>
  );
}

// ── Screen scaffold ───────────────────────────────────────────────────────────
// SafeAreaView + KeyboardAvoidingView + ScrollView so the iOS keyboard never
// covers inputs. `center` vertically centers short forms (login/forgot).

export function AuthScreen({
  children,
  center = false,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, center && styles.scrollCenter]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Headings ──────────────────────────────────────────────────────────────────

export function ScreenTitle({
  children,
  variant = 'pilot',
}: {
  children: React.ReactNode;
  variant?: 'pilot' | 'employer';
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Text style={[styles.title, variant === 'employer' && styles.titleEmployer]}>{children}</Text>
  );
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.subtitle}>{children}</Text>;
}

// ── Banners ───────────────────────────────────────────────────────────────────

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  if (!children) return null;
  return (
    <View style={styles.errorBanner} accessibilityRole="alert">
      <Text style={styles.errorBannerText}>{children}</Text>
    </View>
  );
}

export function SuccessBanner({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.successBanner} accessibilityRole="text">
      <Text style={styles.successBannerText}>{children}</Text>
    </View>
  );
}

// ── Field label (with required asterisk + optional hint) ──────────────────────

export function FieldLabel({
  label,
  required,
  hint,
}: {
  label: string;
  required?: boolean;
  hint?: string;
}) {
  const styles = useThemedStyles(createStyles);
  // Label-less fields (label="") render nothing — otherwise the empty <Text>
  // still occupies a line + margin and misaligns fields sitting in a row next
  // to non-field controls (e.g. the Jobs sort select vs. the Qualified toggle).
  if (!label) return null;
  return (
    <Text style={styles.label}>
      {label}
      {required ? <Text style={styles.req}>*</Text> : null}
      {hint ? <Text style={styles.hint}>{'  '}{hint}</Text> : null}
    </Text>
  );
}

// ── Text field ────────────────────────────────────────────────────────────────

export interface TextFieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export const TextField = React.forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, required, hint, error, containerStyle, style, ...rest },
  ref,
) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.field, containerStyle]}>
      <FieldLabel label={label} required={required} hint={hint} />
      <TextInput
        ref={ref}
        style={[styles.input, !!error && styles.inputError, style]}
        placeholderTextColor="#9AA0A6"
        {...rest}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
});

// ── Select field (modal dropdown, mirrors web <select>) ───────────────────────

export function SelectField({
  label,
  required,
  error,
  value,
  options,
  placeholder = 'Select…',
  onSelect,
}: {
  label: string;
  required?: boolean;
  error?: string;
  value: string;
  options: [string, string][];
  placeholder?: string;
  onSelect: (value: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find(([v]) => v === value)?.[1];
  return (
    <View style={styles.field}>
      <FieldLabel label={label} required={required} />
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.input, styles.selectRow, !!error && styles.inputError]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={selectedLabel ? styles.selectValue : styles.selectPlaceholder}>
          {selectedLabel || placeholder}
        </Text>
        <Text style={styles.selectChevron}>▾</Text>
      </Pressable>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView>
              {options.map(([v, l]) => (
                <Pressable
                  key={v}
                  onPress={() => {
                    onSelect(v);
                    setOpen(false);
                  }}
                  style={styles.modalRow}
                  accessibilityLabel={l}
                >
                  <Text style={[styles.modalRowText, v === value && styles.modalRowActive]}>{l}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────────

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.primaryBtn,
        (isDisabled || pressed) && styles.btnDim,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.secondaryBtn, (disabled || pressed) && styles.btnDim]}
    >
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </Pressable>
  );
}

// ── Footer link row ───────────────────────────────────────────────────────────

export function FooterText({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.footer}>{children}</Text>;
}

export function LinkText({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Text style={styles.link} onPress={onPress} accessibilityRole="link">
      {children}
    </Text>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: pilot.cream },
  scroll: { flexGrow: 1, paddingVertical: spacing.xl, paddingHorizontal: spacing.xl },
  scrollCenter: { justifyContent: 'center' },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center' },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  logoText: {
    fontFamily: fontFamilies.display,
    fontSize: 28,
    color: pilot.ink,
    letterSpacing: -0.3,
  },

  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes['2xl'],
    color: pilot.ink,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  // Employer surfaces use Inter (bold) for headers, matching the web .app-b2b scope.
  titleEmployer: { fontFamily: fontFamilies.bodyBold },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: pilot.muted,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },

  errorBanner: {
    backgroundColor: semantic.errorBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: spacing.lg,
  },
  errorBannerText: { color: semantic.error, fontSize: fontSizes.sm, fontFamily: fontFamilies.body, lineHeight: 20 },
  successBanner: {
    backgroundColor: semantic.successBg,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  successBannerText: { color: semantic.success, fontSize: fontSizes.base, fontFamily: fontFamilies.body, lineHeight: 22 },

  field: { marginBottom: 0 },
  label: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.sm,
    color: pilot.ink,
    marginBottom: 6,
  },
  req: { color: pilot.navy },
  hint: { color: pilot.muted, fontSize: fontSizes.xs, fontFamily: fontFamilies.body },
  input: {
    borderWidth: 1,
    borderColor: pilot.line,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: pilot.ink,
    backgroundColor: pilot.surface,
  },
  inputError: { borderColor: '#FECACA' },
  fieldError: { color: semantic.error, fontSize: fontSizes.xs, fontFamily: fontFamilies.body, marginTop: 5 },

  primaryBtn: {
    backgroundColor: pilot.navy,
    borderRadius: 4,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.md },
  secondaryBtn: {
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: pilot.navy,
    marginTop: spacing.md,
  },
  secondaryBtnText: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.md },
  btnDim: { opacity: 0.6 },

  footer: {
    textAlign: 'center',
    marginTop: spacing.xl,
    color: pilot.muted,
    fontSize: fontSizes.base,
    fontFamily: fontFamilies.body,
  },
  link: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },

  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectValue: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: pilot.ink },
  selectPlaceholder: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: '#9AA0A6' },
  selectChevron: { color: pilot.muted, fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: pilot.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    maxHeight: '70%',
  },
  modalTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base, color: pilot.muted, marginBottom: spacing.sm },
  modalRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: pilot.line },
  modalRowText: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: pilot.ink },
  modalRowActive: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold },

  descCounter: { color: pilot.muted, fontSize: fontSizes.xs, fontFamily: fontFamilies.body, marginTop: 5, textAlign: 'right' },

  dateClear: { color: pilot.muted, fontSize: 14, paddingHorizontal: 4 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: pilot.line, alignItems: 'center', justifyContent: 'center', backgroundColor: pilot.surface },
  checkboxOn: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  checkboxTick: { color: '#fff', fontSize: 13, fontFamily: fontFamilies.bodyBold },
  checkboxLabel: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: pilot.ink },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheetBody: { backgroundColor: pilot.cream, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl, maxHeight: '90%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  sheetTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: pilot.ink },
  sheetClose: { fontSize: 18, color: pilot.muted, padding: 4 },
});
