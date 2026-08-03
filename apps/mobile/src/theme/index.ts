import { useColorScheme } from 'react-native';

/**
 * Dark mode from day one — people score at dusk.
 *
 * Charcoal and a bright green, matching the icon. Deep fairway green was the
 * old field colour and it is the one thing every golf app already does, which
 * makes it invisible in the category; as an accent on charcoal it does the
 * opposite. The bright green only works against dark, so the light theme uses
 * a deeper version of it — #3DDC7F as text or as a button under white text
 * fails contrast on a pale background.
 */
const palette = {
  charcoal: '#181B1F',
  green: '#3DDC7F',      // on dark
  greenDeep: '#0E9F5B',  // the same accent where it has to survive on light
  flag: '#E4572E',       // attention only: unsettled money, conflicts, requests
  paper: '#F7F8F7',
  ink: '#10141A',
  slate: '#6B7280',
  loss: '#D64545',
};

export const lightTheme = {
  mode: 'light' as const,
  bg: palette.paper,
  card: '#FFFFFF',
  border: '#E3E6E4',
  text: palette.ink,
  muted: palette.slate,
  accent: palette.greenDeep,
  accentText: '#FFFFFF',
  flag: palette.flag,
  // Money up is the brand green rather than a second, near-identical green.
  win: palette.greenDeep,
  loss: palette.loss,
};

export const darkTheme = {
  mode: 'dark' as const,
  bg: palette.charcoal,
  card: '#20242A',
  border: '#2E343B',
  text: '#F2F4F3',
  muted: '#98A1A9',
  accent: palette.green,
  // Dark text on the bright green — white on #3DDC7F is barely 1.7:1.
  accentText: palette.charcoal,
  flag: '#F0754C',
  win: palette.green,
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
