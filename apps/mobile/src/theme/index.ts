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
  green: '#146E46',       // the brand, and every primary action
  greenBright: '#2FA76B', // the same action colour where the field is dark
  greenDeep: '#0B2A1E',   // dark mode field, matching the icon
  gold: '#E2BA5A',        // winning
  goldDeep: '#8A6816',    // the same gold where it has to be legible on white
  flag: '#C2410C',        // attention: unsettled money, conflicts, requests
  paper: '#FAFAF7',
  ink: '#10160F',
  slate: '#6B7280',
  loss: '#C0392B',
};

/**
 * Green acts, gold wins, red owes.
 *
 * Splitting the two brand colours by job rather than by decoration is what
 * makes them mean something: every button is green, so green reads as "do
 * this", and gold is reserved for being up — which in an app whose whole
 * subject is who owes who is the thing worth colouring.
 *
 * Gold cannot carry text on white; #E2BA5A on paper is about 1.9:1. The light
 * theme uses a deep gold for anything that has to be read and keeps the bright
 * one for fills.
 */
export const lightTheme = {
  mode: 'light' as const,
  bg: palette.paper,
  card: '#FFFFFF',
  border: '#E5E3DC',
  text: palette.ink,
  muted: palette.slate,
  accent: palette.green,
  accentText: '#FFFFFF',
  flag: palette.flag,
  win: palette.goldDeep,
  loss: palette.loss,
};

export const darkTheme = {
  mode: 'dark' as const,
  bg: palette.greenDeep,
  card: '#123528',
  border: '#1E4A37',
  text: '#F3F6F2',
  muted: '#8FA79A',
  accent: palette.greenBright,
  accentText: '#06170F',
  flag: '#E4733C',
  win: palette.gold,
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
