import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { fetchBins, fetchDaily, type Reading } from './api';
import { BANDS, bandFor, WHO_GUIDELINE_24H } from './bands';
import { formatNumber, formatTemperature, formatTime, formatValue } from './format';
import { getLang, LANGS, setLang, tr, type Lang } from './i18n';
import type { HoverInfo, ViewData } from './scene/types';
import { ViewScene } from './scene/ViewScene';
import { usePolled } from './usePolled';
import { useReadings, type FeedStatus } from './useReadings';
import { ViewNotes } from './ViewNotes';
import { DEFAULT_VIEW, findView, VIEWS, type ViewId } from './views';
import { About } from './About';
import { ViewIcon } from './ViewIcon';
import './App.css';

const MINUTES_PER_DAY = 1440;
const LIVE_WINDOW_MS = 3 * 60_000;
const VIEW_KEY = 'pollution:view';

const bandStyle = (color: string) => ({ '--band': color }) as CSSProperties;

/** 0–15, 15–25 … 75+, in the current language's number format. */
function bandRange(index: number): string {
  const low = index === 0 ? 0 : BANDS[index - 1].max;
  const high = BANDS[index].max;
  return Number.isFinite(high) ? `${formatValue(low)}–${formatValue(high)}` : `${formatValue(low)}+`;
}

/** The URL's #view wins, so links can point at a view; otherwise the last one chosen here. */
function initialView(): ViewId {
  const fromHash = findView(window.location.hash.slice(1));
  if (fromHash) return fromHash.id;
  try {
    const saved = findView(window.localStorage.getItem(VIEW_KEY));
    if (saved) return saved.id;
  } catch {
    // Storage can be blocked; the default view is fine.
  }
  return DEFAULT_VIEW;
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

export default function App() {
  const { readings, status, checkedAt } = useReadings();
  const [viewId, setViewId] = useState<ViewId>(initialView);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lang, setLangState] = useState<Lang>(getLang);
  const [coarsePointer] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const view = findView(viewId) ?? VIEWS[0];

  // The module-level language must change before the re-render that reads it.
  const changeLang = (next: Lang) => {
    setLang(next);
    setLangState(next);
  };

  // Only the view on screen pays for its extra data.
  const bins = usePolled(Boolean(view.needsBins), 5 * 60_000, fetchBins);
  const daily = usePolled(Boolean(view.needsDaily), 30 * 60_000, fetchDaily);
  const data = useMemo<ViewData>(() => ({ readings, bins: bins.data, daily: daily.data }), [readings, bins.data, daily.data]);

  useEffect(() => {
    if (window.location.hash !== `#${viewId}`) window.history.replaceState(null, '', `#${viewId}`);
    try {
      window.localStorage.setItem(VIEW_KEY, viewId);
    } catch {
      // Storage can be blocked; the view just won't be remembered.
    }
  }, [viewId]);

  useEffect(() => {
    const onHashChange = () => {
      const next = findView(window.location.hash.slice(1));
      if (next) setViewId(next.id);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const latest = readings.at(-1) ?? null;
  const band = latest ? bandFor(latest.pm2_5) : null;
  const stats = useMemo(() => summarise(readings), [readings]);
  const live = latest !== null && checkedAt - Date.parse(latest.createdAt) < LIVE_WINDOW_MS;
  const text = tr();
  const sceneLabel = text.views.sceneLabel(text.views[viewId].name, latest ? formatValue(latest.pm2_5) : null);

  return (
    <div className="app" style={bandStyle(band?.color ?? BANDS[0].color)}>
      <ViewTabs current={viewId} onSelect={setViewId} />
      <ViewScene view={view} lang={lang} data={data} label={sceneLabel} onHover={setHover} />

      <div className="rail">
        <header className="masthead">
          <div className="masthead-top">
            <p className="eyebrow">{text.place}</p>
            <div className="masthead-actions">
              <About />
              <LanguageToggle current={lang} onSelect={changeLang} />
            </div>
          </div>
          <h1>{text.title}</h1>
          <StatusLine status={status} live={live} latest={latest} />
        </header>
        <NowPanel latest={latest} status={status} />
        <ViewNotes
          view={viewId}
          latest={latest}
          dayMean={stats?.mean ?? null}
          coarsePointer={coarsePointer}
          failed={(view.needsBins && bins.failed) || (view.needsDaily && daily.failed) || false}
        />
        <DayPanel stats={stats} currentBand={band?.key ?? null} />
      </div>

      <p className="hint" aria-hidden="true">
        {coarsePointer ? text.views[viewId].touch : text.views[viewId].mouse}
      </p>

      {hover && <Tooltip hover={hover} />}
    </div>
  );
}

function ViewTabs({ current, onSelect }: { current: ViewId; onSelect: (id: ViewId) => void }) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move between tabs, as in any tab list; Home and End jump to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = VIEWS.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : -1;
    if (next < 0) return;
    event.preventDefault();
    onSelect(VIEWS[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={tr().views.tabs}>
      {VIEWS.map((view, index) => (
        <button
          key={view.id}
          ref={(element) => {
            tabs.current[index] = element;
          }}
          type="button"
          role="tab"
          id={`tab-${view.id}`}
          className="tab"
          aria-selected={view.id === current}
          aria-controls="view-panel"
          tabIndex={view.id === current ? 0 : -1}
          onClick={() => onSelect(view.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <ViewIcon view={view.id} />
          <span className="tab-label">{tr().views[view.id].name}</span>
        </button>
      ))}
    </div>
  );
}

function LanguageToggle({ current, onSelect }: { current: Lang; onSelect: (lang: Lang) => void }) {
  return (
    <div className="langs" role="group" aria-label={tr().language}>
      {LANGS.map((lang) => (
        <button
          key={lang.id}
          type="button"
          className="lang"
          lang={lang.locale}
          aria-pressed={lang.id === current}
          onClick={() => onSelect(lang.id)}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}

function StatusLine({ status, live, latest }: { status: FeedStatus; live: boolean; latest: Reading | null }) {
  const strings = tr().status;
  let tone = 'idle';
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
    <p className={`status status--${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {text}
    </p>
  );
}

function NowPanel({ latest, status }: { latest: Reading | null; status: FeedStatus }) {
  const band = latest ? bandFor(latest.pm2_5) : null;
  const text = tr();

  return (
    <section className="panel panel--now" aria-labelledby="now-heading">
      <h2 id="now-heading" className="label">{text.now.heading}</h2>
      {latest && band ? (
        <>
          {/* Keyed so the settle animation replays on every new reading. */}
          <p className="reading" key={latest.id}>
            <span className="reading-value">{latest.pm2_5}</span>
            <span className="reading-unit">µg/m³</span>
          </p>
          <p className="chip">
            <span className="chip-dot" aria-hidden="true" />
            {text.bands[band.key].label}
          </p>
          <dl className="minor">
            <div>
              <dt>PM1.0</dt>
              <dd>{latest.pm1_0}</dd>
            </div>
            <div>
              <dt>PM10</dt>
              <dd>{latest.pm10}</dd>
            </div>
            {latest.temperature_c != null && (
              <div>
                <dt>{text.now.temperature}</dt>
                <dd>
                  {formatNumber(latest.temperature_c, 1)}
                  <span className="minor-unit">°C</span>
                </dd>
              </div>
            )}
            <div>
              <dt>{text.now.whoBand}</dt>
              <dd className="minor-text">{text.bands[band.key].name}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="empty">
          {status === 'loading' ? text.now.loading : text.now.empty}
        </p>
      )}
    </section>
  );
}

function DayPanel({ stats, currentBand }: { stats: DayStats | null; currentBand: string | null }) {
  const text = tr();
  const day = text.day;

  return (
    <section className="panel panel--day" aria-labelledby="day-heading">
      <h2 id="day-heading" className="label">{day.heading}</h2>
      {stats ? (
        <>
          <Meter mean={stats.mean} />
          <dl className="facts">
            <div>
              <dt>{day.peak}</dt>
              <dd>
                {stats.peak.pm2_5} µg/m³ <span>{day.at(formatTime(stats.peak.createdAt))}</span>
              </dd>
            </div>
            <div>
              <dt>{day.lowest}</dt>
              <dd>
                {stats.low.pm2_5} µg/m³ <span>{day.at(formatTime(stats.low.createdAt))}</span>
              </dd>
            </div>
            <div>
              <dt>{day.recorded}</dt>
              <dd>
                {formatNumber(Math.min(stats.minutes, MINUTES_PER_DAY))}{' '}
                <span>{day.ofMinutes(formatNumber(MINUTES_PER_DAY))}</span>
              </dd>
            </div>
            {stats.temperature && (
              <div>
                <dt>{day.temperature}</dt>
                <dd>
                  {formatNumber(stats.temperature.min, 1)}–{formatTemperature(stats.temperature.max)}
                </dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <p className="empty">{day.empty}</p>
      )}

      <h3 className="label">
        {day.bandsHeading} <span className="unit">µg/m³</span>
      </h3>
      <ul className="legend">
        {BANDS.map((band, index) => (
          <li key={band.key} className={band.key === currentBand ? 'is-current' : undefined} style={bandStyle(band.color)}>
            <span className="swatch" aria-hidden="true" />
            <span className="legend-range">{bandRange(index)}</span>
            <span className="legend-name">{text.bands[band.key].name}</span>
          </li>
        ))}
      </ul>
      <p className="foot">{day.bandsNote}</p>
    </section>
  );
}

function Meter({ mean }: { mean: number }) {
  const scaleMax = Math.max(30, mean * 1.25);
  const over = mean - WHO_GUIDELINE_24H;
  const day = tr().day;
  const guideline = formatValue(WHO_GUIDELINE_24H);

  return (
    <div className="meter" style={bandStyle(bandFor(mean).color)}>
      <p className="meter-figure">
        <span className="meter-value">{formatNumber(mean, 1)}</span>
        <span className="meter-unit">{day.meanUnit}</span>
      </p>
      <div className="meter-track" aria-hidden="true">
        <span className="meter-fill" style={{ width: `${Math.min(mean / scaleMax, 1) * 100}%` }} />
        <span className="meter-mark" style={{ left: `${(WHO_GUIDELINE_24H / scaleMax) * 100}%` }} />
      </div>
      <p className="meter-verdict">
        {over <= 0 ? day.within(guideline) : day.above(formatNumber(over, 1), guideline)}
      </p>
    </div>
  );
}

function Tooltip({ hover }: { hover: HoverInfo }) {
  const { pm25, x, y } = hover;
  const band = pm25 === null ? null : bandFor(pm25);
  // Flip to the other side of the cursor near the window's right and bottom edges.
  const flipX = x > window.innerWidth - 260;
  const flipY = y > window.innerHeight - 170;
  const style: CSSProperties = {
    ...bandStyle(band?.color ?? '#5b6a7f'),
    left: x,
    top: y,
    transform: `translate(${flipX ? 'calc(-100% - 16px)' : '16px'}, ${flipY ? 'calc(-100% - 16px)' : '16px'})`,
  };

  return (
    <div className="tooltip" style={style}>
      <p className="tooltip-time">{hover.heading}</p>
      {pm25 !== null && band ? (
        <>
          <p className="tooltip-value">
            {Number.isInteger(pm25) ? pm25 : formatNumber(pm25, 1)}
            <span> {hover.caption}</span>
          </p>
          {hover.details.map((line) => (
            <p key={line} className="tooltip-minor">{line}</p>
          ))}
          <p className="tooltip-band">
            <span className="chip-dot" aria-hidden="true" />
            {tr().bands[band.key].name}
          </p>
        </>
      ) : (
        hover.details.map((line) => (
          <p key={line} className="tooltip-minor">{line}</p>
        ))
      )}
    </div>
  );
}
