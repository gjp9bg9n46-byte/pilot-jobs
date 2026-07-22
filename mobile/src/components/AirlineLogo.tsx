// Airline logo with initials fallback — RN port of frontend/src/components/AirlineLogo.jsx.
// Used by the Jobs list + Airlines list cards so the treatment stays identical.
//
// logoUrl present → the self-hosted logo (contained, aspect preserved) on a
//   bordered white box. logoUrl null OR the image fails to load → an initials
//   chip (IATA code, else first 2 letters of name) matching the app's card style.
//
// The logos are hosted on Wikimedia Commons, which returns HTTP 403 to requests
// that send a library/bot User-Agent (e.g. axios) or none. iOS's native image
// loader sends a CFNetwork UA that Wikimedia accepts, but we set an explicit
// User-Agent header so Android (okhttp) is covered too. onError logs so a future
// broken logo host is visible instead of silently falling through to initials.
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fontFamilies, pilot } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

// Wikimedia's UA policy requires contact info — short generic UAs get
// intermittently 403'd, which made logos "disappear" after navigation
// (a failed reload latched the hidden state). Compliant UA fixes the root.
const LOGO_HEADERS = { 'User-Agent': 'CockpitHire/1.0 (https://cockpithire.com; support@cockpithire.com)' };

export default function AirlineLogo({
  logoUrl,
  iataCode,
  name,
  box = 44,
  bare = false,
  hideIfMissing = false,
}: {
  logoUrl?: string | null;
  iataCode?: string | null;
  name?: string | null;
  box?: number;
  /** true → no bordered white box behind the logo; the image floats on the card. */
  bare?: boolean;
  /** true → render nothing at all when there is no logo (no initials fallback). */
  hideIfMissing?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const [failed, setFailed] = useState(false);

  // hideIfMissing applies only when the airline HAS no logo. If a logo exists
  // but a load fails (network blip, rate limit), show the initials chip
  // instead of vanishing — a card must never lose its brand mark mid-session.
  if (!logoUrl && hideIfMissing) return null;

  const initials =
    (iataCode && iataCode.slice(0, 2).toUpperCase()) ||
    String(name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() ||
    '—';

  if (logoUrl && !failed) {
    return (
      <View style={[!bare && styles.imageBox, { width: box, height: box, alignItems: 'center', justifyContent: 'center' }]}>
        <Image
          source={{ uri: logoUrl, headers: LOGO_HEADERS }}
          resizeMode="contain"
          style={{ width: bare ? box : box - 8, height: bare ? box : box - 8 }}
          onError={(e) => {
            // eslint-disable-next-line no-console
            console.warn('[AirlineLogo] failed to load', logoUrl, e?.nativeEvent?.error);
            setFailed(true);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fallback, { width: box, height: box }]}>
      <Text style={[styles.initials, { fontSize: box < 44 ? 13 : 14 }]}>{initials}</Text>
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  imageBox: {
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: pilot.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    borderRadius: 8,
    backgroundColor: 'rgba(0,63,136,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontFamily: fontFamilies.bodyBold, color: pilot.navy },
});
