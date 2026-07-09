// Dismissible "verify your email" strip — mirrors
// frontend/src/components/auth/VerifyEmailBanner.jsx.
//
// Shows on authenticated screens when the current account's emailVerified is
// explicitly false. Resend hits POST /auth/resend-verification (works for pilot
// OR employer via the shared token). Dismissal persists in AsyncStorage under a
// versioned key (web uses localStorage 'verifyBannerDismissed_v1'; mobile uses
// the namespaced 'cockpithire.verifyBanner.dismissed.v1' per the Phase-1 spec).
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAxiosError } from 'axios';
import { useAuth } from '../context/AuthContext';
import { fontFamilies, fontSizes } from '../theme/tokens';

const DISMISS_KEY = 'cockpithire.verifyBanner.dismissed.v1';

export default function VerifyEmailBanner() {
  const { emailVerified, resendVerification } = useAuth();
  const [dismissed, setDismissed] = useState<boolean | null>(null); // null = still loading pref
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISMISS_KEY).then((v) => setDismissed(v === '1'));
  }, []);

  // Only render when the account is explicitly unverified and not dismissed.
  if (emailVerified !== false || dismissed !== false) return null;

  const resend = async () => {
    setSending(true);
    setStatus(null);
    try {
      const data = await resendVerification();
      setStatus({ ok: true, text: data?.message || 'Verification link sent — check your email.' });
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 429) {
        setStatus({ ok: false, text: 'Too many requests. Please wait an hour and try again.' });
      } else if (isAxiosError(err)) {
        setStatus({ ok: false, text: err.response?.data?.error || 'Could not send. Please try again later.' });
      } else {
        setStatus({ ok: false, text: 'Could not send. Please try again later.' });
      }
    } finally {
      setSending(false);
    }
  };

  const dismiss = async () => {
    await AsyncStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <View style={styles.bar}>
      <Text style={styles.text}>Verify your email to receive job alerts and updates.</Text>
      {status ? (
        <Text style={[styles.status, { color: status.ok ? '#166534' : '#991B1B' }]}>{status.text}</Text>
      ) : (
        <Pressable onPress={resend} disabled={sending} accessibilityRole="button">
          <Text style={styles.action}>{sending ? 'Sending…' : 'Resend verification link →'}</Text>
        </Pressable>
      )}
      <Pressable onPress={dismiss} accessibilityLabel="Dismiss" style={styles.dismiss} hitSlop={8}>
        <Text style={styles.dismissText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  text: { color: '#92400E', fontSize: fontSizes.sm, fontFamily: fontFamilies.body, flexShrink: 1 },
  action: { color: '#92400E', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold, textDecorationLine: 'underline' },
  status: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold },
  dismiss: { marginLeft: 'auto', paddingHorizontal: 4 },
  dismissText: { color: '#92400E', fontSize: 20, lineHeight: 20 },
});
