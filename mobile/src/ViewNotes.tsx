import { useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Reading } from './api';
import { WHO_GUIDELINE_24H } from './bands';
import { breathCounts, particlesPerDot, SIZE_THRESHOLDS } from './breath';
import { formatNumber, formatValue } from './format';
import { tr } from './i18n';
import { panel } from './panelStyles';
import { SIZE_CLASSES } from './sizes';
import { BandColour, colours, fonts, withAlpha } from './theme';
import type { ViewId } from './views';

interface ViewNotesProps {
  view: ViewId;
  latest: Reading | null;
  /** The view's own data failed to load (landscape and calendar fetch extra data). */
  failed: boolean;
}

function Guideline() {
  return (
    <View style={styles.keyLine}>
      <View style={styles.sheetSwatch} />
      <Text style={styles.keyLineText}>{tr().notes.guideline(formatValue(WHO_GUIDELINE_24H))}</Text>
    </View>
  );
}

export function ViewNotes({ view, latest, failed }: ViewNotesProps) {
  const notes = tr().notes;

  switch (view) {
    case 'breath':
      return <BreathNotes latest={latest} />;

    case 'landscape':
      return (
        <View style={panel.panel}>
          <Text style={panel.label} accessibilityRole="header">{notes.landscape.heading}</Text>
          <Text style={panel.body}>{notes.landscape.body}</Text>
          <Guideline />
          {failed && <Text style={styles.notice}>{notes.failed(notes.landscape.what, notes.landscape.every)}</Text>}
        </View>
      );

    case 'calendar':
      return (
        <View style={panel.panel}>
          <Text style={panel.label} accessibilityRole="header">{notes.calendar.heading}</Text>
          <Text style={panel.body}>{notes.calendar.body}</Text>
          <Guideline />
          {failed && <Text style={styles.notice}>{notes.failed(notes.calendar.what, notes.calendar.every)}</Text>}
        </View>
      );

    case 'size-mix':
      return (
        <View style={panel.panel}>
          <Text style={panel.label} accessibilityRole="header">{notes.sizeMix.heading}</Text>
          <Text style={panel.body}>{notes.sizeMix.body}</Text>
          <View style={styles.key}>
            {SIZE_CLASSES.map((size) => (
              <View key={size.key} style={styles.keyRow}>
                <View style={[panel.swatch, { backgroundColor: size.color }]} />
                <Text style={styles.keyName}>{size.name}</Text>
                <Text style={styles.keyDetail}>{tr().sizes[size.key]}</Text>
              </View>
            ))}
          </View>
        </View>
      );

    case 'clock':
      return (
        <View style={panel.panel}>
          <Text style={panel.label} accessibilityRole="header">{notes.clock.heading}</Text>
          <Text style={panel.body}>{notes.clock.body}</Text>
          <View style={styles.sizes}>
            {([['fine', 3], ['mid', 5], ['coarse', 8]] as const).map(([size, dot]) => (
              <View key={size} style={styles.sizeRow}>
                <View style={styles.sizeDot}>
                  <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: colours.dust }} />
                </View>
                <Text style={styles.sizeText}>{notes.clock[size]}</Text>
              </View>
            ))}
          </View>
          <Text style={panel.foot}>{notes.clock.foot}</Text>
        </View>
      );
  }
}

function BreathNotes({ latest }: { latest: Reading | null }) {
  const band = useContext(BandColour);
  const text = tr().notes.breath;
  const counts = breathCounts(latest);
  const perDot = counts ? particlesPerDot(counts.total) : 1;

  return (
    <View style={panel.panel}>
      <Text style={panel.label} accessibilityRole="header">{text.heading}</Text>
      {counts ? (
        <>
          <Text style={[styles.breathCount, { color: band, textShadowColor: withAlpha(band, 0.3) }]}>
            {formatNumber(counts.total)}
          </Text>
          <Text style={styles.breathCaption}>{text.caption}</Text>
          <View style={styles.sizeTable}>
            {SIZE_THRESHOLDS.map((size, i) => (
              <View key={size} style={styles.sizeCell}>
                <Text style={styles.sizeCellLabel}>≥{formatValue(Number(size))} µm</Text>
                <Text style={styles.sizeCellValue}>{formatNumber(counts.total * counts.shares[i])}</Text>
              </View>
            ))}
          </View>
          <Text style={panel.body}>{text.lodge}</Text>
          <Text style={panel.foot}>
            {counts.measured ? text.measured : text.estimated} {perDot > 1 ? text.perDot(formatNumber(perDot)) : text.oneDot}
          </Text>
        </>
      ) : (
        <Text style={panel.empty}>{text.none}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  breathCount: {
    fontFamily: fonts.display,
    fontSize: 54,
    lineHeight: 54,
    fontVariant: ['tabular-nums'],
    textShadowRadius: 24,
    textShadowOffset: { width: 0, height: 0 },
  },
  breathCaption: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 17,
    color: colours.muted,
  },
  sizeTable: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 18,
    rowGap: 8,
  },
  sizeCell: {
    gap: 2,
  },
  sizeCellLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    lineHeight: 14,
    color: colours.faint,
  },
  sizeCellValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 14,
    lineHeight: 17,
    color: colours.fg,
    fontVariant: ['tabular-nums'],
  },
  key: {
    gap: 6,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  keyName: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colours.fg,
  },
  keyDetail: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colours.muted,
  },
  keyLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  keyLineText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colours.muted,
  },
  sheetSwatch: {
    width: 14,
    height: 14,
    marginTop: 2,
    borderWidth: 1,
    borderColor: colours.guide,
    borderRadius: 3,
    backgroundColor: 'rgba(155, 216, 255, 0.25)',
  },
  notice: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colours.quiet,
  },
  sizes: {
    gap: 6,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sizeDot: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeText: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colours.muted,
  },
});
