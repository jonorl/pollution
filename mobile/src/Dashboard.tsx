import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { About } from './About';
import { fetchBins, fetchDaily, type Reading } from './api';
import { BANDS, bandFor, WHO_GUIDELINE_24H } from './bands';
import { formatNumber, formatTemperature, formatTime, formatValue } from './format';
import { LANGS, setLang, tr, type Lang } from './i18n';
import { panel } from './panelStyles';
import type { ViewData } from './scene/types';
import { ViewScene } from './scene/ViewScene';
import { BandColour, colours, fonts, GUTTER, withAlpha } from './theme';
import { useAppActive } from './useAppActive';
import { usePolled } from './usePolled';
import { useReadings, type FeedStatus } from './useReadings';
import { ViewIcon } from './ViewIcon';
import { ViewNotes } from './ViewNotes';
import { findView, saveView, VIEWS, type ViewId } from './views';

const MINUTES_PER_DAY = 1440;
const LIVE_WINDOW_MS = 3 * 60_000;

/** 0–15, 15–25 … 75+, in the current language's number format. */
function bandRange(index: number): string {
  const low = index === 0 ? 0 : BANDS[index - 1].max;
  const high = BANDS[index].max;
  return Number.isFinite(high) ? `${formatValue(low)}–${formatValue(high)}` : `${formatValue(low)}+`;
}

interface DayStats {
  mean: number;
  peak: Reading;
  low: Reading;
  minutes: number;
  /** Lowest and highest °C; null when no reading had a temperature. */
  temperature: { min: number; max: number } | null;
}

function summarise(readings: readonly Reading[]): DayStats | null {
  if (readings.length === 0) return null;
  let sum = 0;
  let peak = readings[0];
  let low = readings[0];
  let temperature: DayStats['temperature'] = null;
  for (const reading of readings) {
    sum += reading.pm2_5;
    if (reading.pm2_5 > peak.pm2_5) peak = reading;
    if (reading.pm2_5 < low.pm2_5) low = reading;
    const celsius = reading.temperature_c;
    if (celsius != null) {
      temperature = temperature
        ? { min: Math.min(temperature.min, celsius), max: Math.max(temperature.max, celsius) }
        : { min: celsius, max: celsius };
    }
  }
  return { mean: sum / readings.length, peak, low, minutes: readings.length, temperature };
}

export function Dashboard({ initialLang, initialView }: { initialLang: Lang; initialView: ViewId }) {
  const active = useAppActive();
  const { readings, status, checkedAt, refresh } = useReadings(active);
  const [viewId, setViewId] = useState<ViewId>(initialView);
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [refreshing, setRefreshing] = useState(false);
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const view = findView(viewId) ?? VIEWS[0];

  // The module-level language must change before the re-render that reads it.
  const changeLang = (next: Lang) => {
    setLang(next);
    setLangState(next);
  };

  const changeView = (next: ViewId) => {
    setViewId(next);
    saveView(next);
  };

  // Only the view on screen pays for its extra data, and nothing polls while the app is hidden.
  const bins = usePolled(Boolean(view.needsBins) && active, 5 * 60_000, fetchBins);
  const daily = usePolled(Boolean(view.needsDaily) && active, 30 * 60_000, fetchDaily);
  const data = useMemo<ViewData>(() => ({ readings, bins: bins.data, daily: daily.data }), [readings, bins.data, daily.data]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), bins.refresh(), daily.refresh()]);
    setRefreshing(false);
  };

  const latest = readings.at(-1) ?? null;
  const band = latest ? bandFor(latest.pm2_5) : null;
  const bandColour = band?.color ?? BANDS[0].color;
  const stats = useMemo(() => summarise(readings), [readings]);
  const live = latest !== null && checkedAt - Date.parse(latest.createdAt) < LIVE_WINDOW_MS;
  const text = tr();
  const sceneLabel = text.views.sceneLabel(text.views[viewId].name, latest ? formatValue(latest.pm2_5) : null);
  // Close to square, as on the web's phone layout, while leaving room for the panels below.
  const sceneHeight = Math.round(Math.min(screen.width * 0.92, Math.max(240, screen.height * 0.4)));

  return (
    <BandColour.Provider value={bandColour}>
      <View style={[styles.app, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <Masthead lang={lang} onLang={changeLang} status={status} live={live} latest={latest} />
          <ViewTabs current={viewId} onSelect={changeView} />
        </View>
        <ViewScene
          view={view}
          lang={lang}
          data={data}
          label={sceneLabel}
          hint={text.views[viewId].hint}
          reducedMotion={reducedMotion}
          height={sceneHeight}
          style={styles.scene}
        />
        <ScrollView
          style={styles.panels}
          contentContainerStyle={[styles.panelsContent, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[bandColour]}
              tintColor={bandColour}
              progressBackgroundColor={colours.surface}
            />
          }
        >
          <NowPanel latest={latest} status={status} />
          <ViewNotes
            view={viewId}
            latest={latest}
            dayMean={stats?.mean ?? null}
            failed={(view.needsBins && bins.failed) || (view.needsDaily && daily.failed) || false}
          />
          <DayPanel stats={stats} currentBand={band?.key ?? null} />
        </ScrollView>
      </View>
    </BandColour.Provider>
  );
}

interface MastheadProps {
  lang: Lang;
  onLang: (lang: Lang) => void;
  status: FeedStatus;
  live: boolean;
  latest: Reading | null;
}

function Masthead({ lang, onLang, status, live, latest }: MastheadProps) {
  const text = tr();
  return (
    <View>
      <View style={styles.mastheadTop}>
        <Text style={panel.label}>{text.place}</Text>
        <View style={styles.actions}>
          <About />
          <LanguageToggle current={lang} onSelect={onLang} />
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {text.title}
      </Text>
      <StatusLine status={status} live={live} latest={latest} />
    </View>
  );
}

function ViewTabs({ current, onSelect }: { current: ViewId; onSelect: (id: ViewId) => void }) {
  const band = useContext(BandColour);
  return (
    <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel={tr().views.tabs}>
      {VIEWS.map((view) => {
        const selected = view.id === current;
        const colour = selected ? colours.bg : colours.muted;
        return (
          <Pressable
            key={view.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(view.id)}
            style={({ pressed }) => [styles.tab, selected ? { backgroundColor: band } : pressed && styles.tabPressed]}
          >
            <ViewIcon view={view.id} color={colour} />
            <Text numberOfLines={1} style={[styles.tabLabel, { color: colour }]}>
              {tr().views[view.id].name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LanguageToggle({ current, onSelect }: { current: Lang; onSelect: (lang: Lang) => void }) {
  return (
    <View style={styles.langs} accessibilityLabel={tr().language}>
      {LANGS.map((lang) => {
        const selected = lang.id === current;
        return (
          <Pressable
            key={lang.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(lang.id)}
            hitSlop={6}
            style={[styles.lang, selected && styles.langSelected]}
          >
            <Text style={[styles.langText, selected && styles.langTextSelected]}>{lang.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type Tone = 'idle' | 'live' | 'quiet' | 'error';

function StatusLine({ status, live, latest }: { status: FeedStatus; live: boolean; latest: Reading | null }) {
  const strings = tr().status;
  let tone: Tone = 'idle';
  let text = strings.connecting;
  if (latest) {
    tone = live ? 'live' : 'quiet';
    text = live ? strings.live(formatTime(latest.createdAt)) : strings.quiet(formatTime(latest.createdAt));
    if (status === 'error') text += strings.apiRetrying;
  } else if (status === 'error') {
    tone = 'error';
    text = strings.apiDown;
  } else if (status === 'ok') {
    tone = 'quiet';
    text = strings.noReadings;
  }

  return (
    <View style={styles.status}>
      <StatusDot tone={tone} />
      <Text style={styles.statusText}>{text}</Text>
    </View>
  );
}

function StatusDot({ tone }: { tone: Tone }) {
  const band = useContext(BandColour);
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const pulsing = tone === 'live' && !reducedMotion;

  useEffect(() => {
    if (!pulsing) return;
    pulse.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }), -1, false);
    return () => {
      cancelAnimation(pulse);
      pulse.value = 0;
    };
  }, [pulsing, pulse]);

  // A ring that swells and fades from the dot, as the web's box-shadow pulse does.
  const ring = useAnimatedStyle(() => ({
    opacity: pulse.value === 0 ? 0 : 0.7 * (1 - pulse.value),
    transform: [{ scale: 1 + 2.5 * pulse.value }],
  }));

  const colour = { live: band, quiet: colours.quiet, error: colours.alarm, idle: colours.faint }[tone];
  return (
    <View style={styles.statusDot}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.round, { backgroundColor: colour }, ring]} />
      <View style={[StyleSheet.absoluteFill, styles.round, { backgroundColor: colour }]} />
    </View>
  );
}

function NowPanel({ latest, status }: { latest: Reading | null; status: FeedStatus }) {
  const band = latest ? bandFor(latest.pm2_5) : null;
  const text = tr();

  return (
    <View style={panel.panel}>
      <Text style={panel.label} accessibilityRole="header">
        {text.now.heading}
      </Text>
      {latest && band ? (
        <>
          {/* Keyed so the settle animation replays on every new reading. */}
          <Settle key={latest.id}>
            <Text style={[styles.readingValue, { color: band.color, textShadowColor: withAlpha(band.color, 0.35) }]}>
              {latest.pm2_5}
            </Text>
            <Text style={styles.readingUnit}>µg/m³</Text>
          </Settle>
          <View style={[styles.chip, { borderColor: withAlpha(band.color, 0.35), backgroundColor: withAlpha(band.color, 0.12) }]}>
            <View style={[styles.chipDot, { backgroundColor: band.color }]} />
            <Text style={[styles.chipText, { color: band.color }]}>{text.bands[band.key].label}</Text>
          </View>
          <View style={styles.minor}>
            <Minor term="PM1.0">{latest.pm1_0}</Minor>
            <Minor term="PM10">{latest.pm10}</Minor>
            {latest.temperature_c != null && (
              <Minor term={text.now.temperature}>
                {formatNumber(latest.temperature_c, 1)}
                <Text style={styles.minorUnit}>{' '}°C</Text>
              </Minor>
            )}
            <View>
              <Text style={styles.minorTerm}>{text.now.whoBand}</Text>
              <Text style={styles.minorText}>{text.bands[band.key].name}</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={panel.empty}>{status === 'loading' ? text.now.loading : text.now.empty}</Text>
      )}
    </View>
  );
}

/**
 * Eases a new reading in from just below, as the web's "settle" animation does. It only moves and
 * fades, so the reading keeps its place in the layout throughout.
 */
function Settle({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (!reducedMotion) progress.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) });
  }, [progress, reducedMotion]);

  const settling = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * progress.value,
    transform: [{ translateY: 6 * (1 - progress.value) }],
  }));

  return <Animated.View style={[styles.reading, settling]}>{children}</Animated.View>;
}

function Minor({ term, children }: { term: string; children: ReactNode }) {
  return (
    <View>
      <Text style={styles.minorTerm}>{term}</Text>
      <Text style={styles.minorValue}>{children}</Text>
    </View>
  );
}

function DayPanel({ stats, currentBand }: { stats: DayStats | null; currentBand: string | null }) {
  const text = tr();
  const day = text.day;

  return (
    <View style={panel.panel}>
      <Text style={panel.label} accessibilityRole="header">
        {day.heading}
      </Text>
      {stats ? (
        <>
          <Meter mean={stats.mean} />
          <View>
            <Fact term={day.peak} value={`${stats.peak.pm2_5} µg/m³`} detail={day.at(formatTime(stats.peak.createdAt))} />
            <Fact term={day.lowest} value={`${stats.low.pm2_5} µg/m³`} detail={day.at(formatTime(stats.low.createdAt))} />
            <Fact
              term={day.recorded}
              value={formatNumber(Math.min(stats.minutes, MINUTES_PER_DAY))}
              detail={day.ofMinutes(formatNumber(MINUTES_PER_DAY))}
            />
            {stats.temperature && (
              <Fact
                term={day.temperature}
                value={`${formatNumber(stats.temperature.min, 1)}–${formatTemperature(stats.temperature.max)}`}
              />
            )}
          </View>
        </>
      ) : (
        <Text style={panel.empty}>{day.empty}</Text>
      )}

      <Text style={[panel.label, styles.subheading]} accessibilityRole="header">
        {day.bandsHeading} <Text style={panel.unit}>µg/m³</Text>
      </Text>
      <View style={styles.legend}>
        {BANDS.map((band, index) => {
          const current = band.key === currentBand;
          return (
            <View key={band.key} style={[styles.legendRow, current && { backgroundColor: withAlpha(band.color, 0.13) }]}>
              <View style={[panel.swatch, { backgroundColor: band.color }]} />
              <Text style={[styles.legendRange, current && styles.legendCurrent]}>{bandRange(index)}</Text>
              <Text style={[styles.legendName, current && styles.legendCurrent]}>{text.bands[band.key].name}</Text>
            </View>
          );
        })}
      </View>
      <Text style={panel.foot}>{day.bandsNote}</Text>
    </View>
  );
}

function Fact({ term, value, detail }: { term: string; value: string; detail?: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factTerm}>{term}</Text>
      <Text style={styles.factValue}>
        {value}
        {detail && <Text style={styles.factDetail}> {detail}</Text>}
      </Text>
    </View>
  );
}

function Meter({ mean }: { mean: number }) {
  const scaleMax = Math.max(30, mean * 1.25);
  const over = mean - WHO_GUIDELINE_24H;
  const day = tr().day;
  const guideline = formatValue(WHO_GUIDELINE_24H);
  const colour = bandFor(mean).color;

  return (
    <View style={styles.meter}>
      <View style={styles.meterFigure}>
        <Text style={[styles.meterValue, { color: colour }]}>{formatNumber(mean, 1)}</Text>
        <Text style={styles.meterUnit}>{day.meanUnit}</Text>
      </View>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            {
              width: `${Math.min(mean / scaleMax, 1) * 100}%`,
              backgroundColor: colour,
              boxShadow: `0 0 12px ${withAlpha(colour, 0.5)}`,
            },
          ]}
        />
        <View style={[styles.meterMark, { left: `${(WHO_GUIDELINE_24H / scaleMax) * 100}%` }]} />
      </View>
      <Text style={styles.meterVerdict}>
        {over <= 0 ? day.within(guideline) : day.above(formatNumber(over, 1), guideline)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colours.bg,
  },
  header: {
    gap: 14,
    paddingHorizontal: GUTTER,
  },
  scene: {
    marginTop: 14,
  },
  panels: {
    flex: 1,
  },
  panelsContent: {
    gap: 18,
    paddingTop: 14,
    paddingHorizontal: GUTTER,
  },

  // ── Masthead ──
  mastheadTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    marginTop: 6,
    marginBottom: 8,
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 40,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colours.fg,
    includeFontPadding: false,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  statusDot: {
    width: 8,
    height: 8,
  },
  round: {
    borderRadius: 4,
  },
  statusText: {
    flexShrink: 1,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 17,
    color: colours.muted,
  },
  langs: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: 999,
  },
  lang: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  langSelected: {
    backgroundColor: colours.line,
  },
  langText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.88,
    color: colours.muted,
  },
  langTextSelected: {
    color: colours.fg,
  },

  // ── View tabs ──
  tabs: {
    flexDirection: 'row',
    gap: 2,
    padding: 4,
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: 16,
    backgroundColor: 'rgba(8, 12, 19, 0.82)',
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 5,
    paddingTop: 8,
    paddingBottom: 7,
    paddingHorizontal: 2,
    borderRadius: 12,
  },
  tabPressed: {
    backgroundColor: colours.line,
  },
  tabLabel: {
    maxWidth: '100%',
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    lineHeight: 12,
  },

  // ── Now ──
  reading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  readingValue: {
    fontFamily: fonts.display,
    fontSize: 88,
    lineHeight: 84,
    letterSpacing: -0.9,
    fontVariant: ['tabular-nums'],
    textShadowRadius: 30,
    textShadowOffset: { width: 0, height: 0 },
    includeFontPadding: false,
  },
  readingUnit: {
    fontFamily: fonts.monoMedium,
    fontSize: 14,
    color: colours.muted,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 999,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  minor: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 24,
    rowGap: 10,
  },
  minorTerm: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    lineHeight: 18,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colours.faint,
  },
  minorValue: {
    fontFamily: fonts.displayBold,
    fontSize: 30,
    lineHeight: 32,
    fontVariant: ['tabular-nums'],
    color: colours.fg,
  },
  minorUnit: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colours.muted,
  },
  minorText: {
    paddingTop: 6,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    lineHeight: 18,
    color: colours.fg,
  },

  // ── Last 24 hours ──
  subheading: {
    marginTop: 8,
  },
  meter: {
    gap: 8,
  },
  meterFigure: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  meterValue: {
    fontFamily: fonts.displayBold,
    fontSize: 42,
    lineHeight: 44,
    fontVariant: ['tabular-nums'],
  },
  meterUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colours.muted,
  },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(150, 180, 215, 0.12)',
  },
  meterFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  meterMark: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 2,
    marginLeft: -1,
    backgroundColor: colours.fg,
  },
  meterVerdict: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colours.muted,
  },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colours.line,
  },
  factTerm: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colours.muted,
  },
  factValue: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    color: colours.fg,
  },
  factDetail: {
    fontSize: 13,
    color: colours.faint,
  },
  legend: {
    gap: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  legendRange: {
    width: 64,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: colours.muted,
  },
  legendName: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colours.muted,
  },
  legendCurrent: {
    color: colours.fg,
  },
});
