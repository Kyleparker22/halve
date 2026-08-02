import { useColorScheme } from 'react-native';

/** Dark mode from day one — people score at dusk. */
const palette = {
  fairway: '#0B3D2E',
  fairwayLight: '#14624A',
  flag: '#E4572E',
  bone: '#F6F4EF',
  ink: '#11150F',
  slate: '#6B7268',
  win: '#2E7D4F',
  loss: '#C0392B',
};

export const lightTheme = {
  mode: 'light' as const,
  bg: palette.bone,
  card: '#FFFFFF',
  border: '#E2DFD6',
  text: palette.ink,
  muted: palette.slate,
  accent: palette.fairway,
  accentText: '#FFFFFF',
  flag: palette.flag,
  win: palette.win,
  loss: palette.loss,
};

export const darkTheme = {
  mode: 'dark' as const,
  bg: '#0D110C',
  card: '#161B15',
  border: '#2A322A',
  text: '#F2F4F0',
  muted: '#9AA394',
  accent: palette.fairwayLight,
  accentText: '#FFFFFF',
  flag: '#F0754C',
  win: '#4FBF7F',
  loss: '#E5675A',
};

export type Theme = Omit<typeof lightTheme, 'mode'> & { mode: 'light' | 'dark' };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

/** 44pt minimum, and the scorecard's primary targets sit in the bottom third. */
export const HIT_SIZE = 44;

export const type = {
  display: { fontSize: 30, fontWeight: '700' as const },
  title: { fontSize: 22, fontWeight: '700' as const },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  mono: { fontSize: 28, fontWeight: '700' as const },
};
