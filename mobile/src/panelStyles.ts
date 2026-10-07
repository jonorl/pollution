import { StyleSheet } from 'react-native';

import { colours, fonts } from './theme';

// The web's .panel, .label, .foot and .empty, which every panel shares.
export const panel = StyleSheet.create({
  panel: {
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colours.line,
  },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.54,
    textTransform: 'uppercase',
    color: colours.muted,
  },
  // Uppercasing turns µ into a capital Mu, which reads as "MG" (milligrams).
  unit: {
    letterSpacing: 0.44,
    textTransform: 'none',
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colours.muted,
  },
  foot: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: colours.faint,
  },
  empty: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colours.muted,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
});
