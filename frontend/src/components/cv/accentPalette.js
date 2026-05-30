// Accent colour presets for CV templates.
// hex is stored on CvData.accentColor and passed into both PDF templates.
// light/dark are pre-computed variants used inside templates (no runtime colour math needed).
export const ACCENT_PALETTE = [
  { name: 'Navy',       hex: '#0D1E35', light: '#1B2B4B', dark: '#07101E' },
  { name: 'Charcoal',   hex: '#2c2c2c', light: '#484848', dark: '#1a1a1a' },
  { name: 'Burgundy',   hex: '#722f37', light: '#8d3a44', dark: '#4d1f24' },
  { name: 'Forest',     hex: '#1f3d2b', light: '#2d5a3d', dark: '#122214' },
  { name: 'Slate Blue', hex: '#3a5068', light: '#4d6a85', dark: '#253344' },
  { name: 'Midnight',   hex: '#1C2451', light: '#2E3D6F', dark: '#121735' },
  { name: 'Teal',       hex: '#0A3D40', light: '#195154', dark: '#062728' },
  { name: 'Bronze',     hex: '#4A3200', light: '#634600', dark: '#1E1300' },
  { name: 'Plum',       hex: '#3A1F38', light: '#4E2E4C', dark: '#170C16' },
  { name: 'Indigo',     hex: '#2D1B69', light: '#412A82', dark: '#130C2C' },
];

// Keyed by hex for O(1) lookup inside template components
export const ACCENT_MAP = Object.fromEntries(
  ACCENT_PALETTE.map(({ hex, light, dark }) => [hex, { light, dark }])
);

export const DEFAULT_ACCENT = '#0D1E35';
