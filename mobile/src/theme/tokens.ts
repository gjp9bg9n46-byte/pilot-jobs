// Design tokens — mirrored 1:1 from the web app's frontend/src/styles/design-tokens.css.
// The web app is the source of truth: mobile must match its editorial-light identity
// exactly. Where the Phase-0 spec named approximate values (e.g. ink #0B1220), we use
// the web's ACTUAL token values instead, because the top-level directive is "mirror web
// exactly." Keep this file in sync with design-tokens.css if the web palette ever moves.

/**
 * PILOT (default) — Tier-2 editorial-light identity.
 * Warm cream background, editorial serif display (Fraunces), navy accent.
 * Source: :root in design-tokens.css
 */
export const pilot = {
  cream: '#F8F6F1', // --bg
  surface: '#FFFFFF', // --surface
  ink: '#0F1419', // --text-primary (body text)
  muted: '#5A5F66', // --text-secondary
  line: '#E5E1D8', // --border (hairlines)
  navy: '#003F88', // --accent
  navyHover: '#002B5C', // --accent-hover
  amber: '#D97706', // --accent-amber
} as const;

/**
 * EMPLOYER — "cool-operator" B2B identity (Phase 14). Cooler neutral dashboard
 * palette; keeps the brand navy accent but uses Inter for everything (no serif).
 * Source: .app-b2b in design-tokens.css
 */
export const employer = {
  bg: '#F3F4F6',
  surface: '#FFFFFF',
  ink: '#16191D',
  muted: '#5B6470',
  line: '#E2E4E8',
  navy: '#003F88',
  navyHover: '#002B5C',
} as const;

/**
 * ADMIN — dark surface, cyan accent. Mobile admin stays dark like the web.
 * Source: AdminDashboard.jsx (dark tiles, #00B4D8 accent).
 */
export const admin = {
  bg: '#0A1628', // page (matches web Layout.jsx dark body)
  surface: '#0D1E35', // cards/tiles
  surfaceAlt: '#16263F', // nested surface / buttons
  line: '#1E3050', // borders
  ink: '#FFFFFF', // primary text
  muted: '#7A8CA0', // secondary text
  dim: '#4A6080', // tertiary / de-emphasised text
  onAccent: '#04121F', // text on cyan accent
  accent: '#00B4D8', // cyan accent
  accentSoft: 'rgba(0,180,216,0.12)',
  success: '#34D399',
  warning: '#F39C12',
  queue: '#F39C12',
  danger: '#E74C3C',
  dangerBright: '#FF6B6B',
  approve: '#27AE60',
  reject: '#C0392B',
} as const;

/**
 * Shared semantic colors (Badge variants etc.) — brand navy accent is constant.
 */
export const semantic = {
  accent: '#003F88',
  accentHover: '#002B5C',
  success: '#166534',
  successBg: '#DCFCE7',
  warning: '#92400E',
  warningBg: '#FEF3C7',
  error: '#991B1B',
  errorBg: '#FEE2E2',
  info: '#003F88',
  infoBg: '#EFF6FF',
} as const;

/**
 * Typography — font-family keys must match the names registered via expo-font in
 * the root layout. The web uses Fraunces (display), Inter (body), JetBrains Mono.
 */
export const fontFamilies = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
} as const;

export const fontSizes = {
  xs: 12,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 26,
  '3xl': 32,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

// Default theme = pilot editorial-light (the pilot-facing app is the primary surface).
export const theme = {
  colors: pilot,
  pilot,
  employer,
  admin,
  semantic,
  fontFamilies,
  fontSizes,
  spacing,
  radii,
} as const;

export type Theme = typeof theme;
export default theme;

// ── Account-type-aware theme ─────────────────────────────────────────────────
// Pilot = editorial-light (cream + Fraunces display). Employer = cool-operator
// .app-b2b (grey surface + Inter everywhere, no serif). Both keep the navy accent.
// Employer screens use this so their identity switches on accountType.
export interface AccountTheme {
  bg: string; surface: string; ink: string; muted: string; line: string;
  accent: string; accentHover: string; display: string; isEmployer: boolean;
}

export const pilotTheme: AccountTheme = {
  bg: pilot.cream, surface: pilot.surface, ink: pilot.ink, muted: pilot.muted,
  line: pilot.line, accent: pilot.navy, accentHover: pilot.navyHover,
  display: fontFamilies.display, // Fraunces
  isEmployer: false,
};

export const employerTheme: AccountTheme = {
  bg: employer.bg, surface: employer.surface, ink: employer.ink, muted: employer.muted,
  line: employer.line, accent: employer.navy, accentHover: employer.navyHover,
  display: fontFamilies.bodyBold, // Inter (b2b collapses the serif to Inter)
  isEmployer: true,
};
export function themeFor(accountType?: string | null): AccountTheme {
  return accountType === 'employer' ? employerTheme : pilotTheme;
}
