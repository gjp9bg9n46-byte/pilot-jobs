import { useColorScheme } from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';

export const PALETTE = {
  bg:        '#0A1628',
  card:      '#1B2B4B',
  card2:     '#0F2040',
  accent:    '#00B4D8',
  amber:     '#F5A524',
  danger:    '#FF4757',
  text:      '#FFFFFF',
  textSub:   '#C0CDE0',
  textMuted: '#7A8CA0',
  border:    '#243050',
  input:     '#0A1628',
};

export const LIGHT_PALETTE = {
  bg:        '#F0F4F8',
  card:      '#FFFFFF',
  card2:     '#EAF2F9',
  accent:    '#0090B8',
  amber:     '#D48A00',
  danger:    '#CC2233',
  text:      '#0A1628',
  textSub:   '#2C4060',
  textMuted: '#5A7090',
  border:    '#C8D8E8',
  input:     '#FFFFFF',
};

export function useTheme() {
  const setting = useSelector((s: RootState) => (s as any).ui?.theme ?? 'system');
  const system  = useColorScheme();
  const isDark  = setting === 'system' ? system !== 'light' : setting === 'dark';
  return isDark ? PALETTE : LIGHT_PALETTE;
}
