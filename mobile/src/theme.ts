import { createContext } from 'react';

import { BANDS } from './bands';

// The web dashboard's design tokens (frontend/src/index.css) as React Native values.
// One committed dark look: the chamber is a lit volume in a dark room, so there is no light theme.

export const colours = {
  bg: '#05070b',
  surface: 'rgba(12, 17, 26, 0.94)',
  line: 'rgba(150, 180, 215, 0.14)',
  fg: '#e6edf5',
  muted: '#93a3b8',
  faint: '#5d6c81',
  dust: '#9db2cc',
  quiet: '#facc15',
  alarm: '#f43f5e',
  guide: '#9bd8ff',
} as const;

// Android has no font weights for fonts loaded at run time, so each weight is its own family.
export const fonts = {
  display: 'BigShouldersDisplay-ExtraBold',
  displayBold: 'BigShouldersDisplay-Bold',
  sans: 'IBMPlexSans-Regular',
  sansMedium: 'IBMPlexSans-Medium',
  mono: 'IBMPlexMono-Regular',
  monoMedium: 'IBMPlexMono-Medium',
} as const;

export const fontFiles = {
  [fonts.display]: require('../assets/fonts/BigShouldersDisplay_800ExtraBold.ttf'),
  [fonts.displayBold]: require('../assets/fonts/BigShouldersDisplay_700Bold.ttf'),
  [fonts.sans]: require('../assets/fonts/IBMPlexSans_400Regular.ttf'),
  [fonts.sansMedium]: require('../assets/fonts/IBMPlexSans_500Medium.ttf'),
  [fonts.mono]: require('../assets/fonts/IBMPlexMono_400Regular.ttf'),
  [fonts.monoMedium]: require('../assets/fonts/IBMPlexMono_500Medium.ttf'),
};

export const GUTTER = 16;

/** A colour at partial strength, as the web's `color-mix(in srgb, colour N%, transparent)`. */
export function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** The current WHO band's colour, which the web sets on the page as `--band`. */
export const BandColour = createContext<string>(BANDS[0].color);
