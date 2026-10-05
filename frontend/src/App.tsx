import { useMemo, useState, type CSSProperties } from 'react';

import type { Reading } from './api';
import { BANDS, bandFor, WHO_GUIDELINE_24H } from './bands';
import { AirScene } from './scene/AirScene';
import type { HoverInfo } from './scene/ChamberScene';
import { useReadings, type FeedStatus } from './useReadings';
import './App.css';

const MINUTES_PER_DAY = 1440;
const LIVE_WINDOW_MS = 3 * 60_000;

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const oneDecimal = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat();

const formatTime = (value: string | Date) => clock.format(typeof value === 'string' ? new Date(value) : value);
const bandStyle = (color: string) => ({ '--band': color }) as CSSProperties;

interface DayStats {
  mean: number;
  peak: Reading;
  low: Reading;
  minutes: number;
}

function summarise(readings: readonly Reading[]): DayStats | null {
  if (readings.length === 0) return null;
  let sum = 0;
  let peak = readings[0];
  let low = readings[0];
  for (const reading of readings) {
    sum += reading.pm2_5;
    if (reading.pm2_5 > peak.pm2_5) peak = reading;
    if (reading.pm2_5 < low.pm2_5) low = reading;
  }
  return { mean: sum / readings.length, peak, low, minutes: readings.length };
}

export default function App() {
  const { readings, status, checkedAt } = useReadings();
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [coarsePointer] = useState(() => window.matchMedia('(pointer: coarse)').matches);

  const latest = readings.at(-1) ?? null;
  const band = latest ? bandFor(latest.pm2_5) : null;
  const stats = useMemo(() => summarise(readings), [readings]);
  const live = latest !== null && checkedAt - Date.parse(latest.createdAt) < LIVE_WINDOW_MS;

  const sceneLabel = latest
    ? `Particle chamber showing the latest PM2.5 reading, ${latest.pm2_5} µg/m³, ringed by a 24-hour clock with one bar per minute.`
    : 'Particle chamber, empty until the sensor reports.';

  return (
    <div className="app" style={bandStyle(band?.color ?? BANDS[0].color)}>
      <AirScene readings={readings} label={sceneLabel} onHover={setHover} />

      <div className="rail">
        <header className="masthead">
          <p className="eyebrow">PMS5003 · {latest?.deviceId ?? 'esp32-01'}</p>
          <h1>Air quality</h1>
          <StatusLine status={status} live={live} latest={latest} />
        </header>
        <NowPanel latest={latest} status={status} />
        <DayPanel stats={stats} currentBand={band?.name ?? null} />
      </div>

      <p className="hint" aria-hidden="true">
        {coarsePointer
          ? 'Drag to orbit · pinch to zoom · tap the ring to read any minute'
          : 'Drag to orbit · scroll to zoom · point at the ring to read any minute'}
      </p>

      {hover && <Tooltip hover={hover} />}
    </div>
  );
}

function StatusLine({ status, live, latest }: { status: FeedStatus; live: boolean; latest: Reading | null }) {
  let tone = 'idle';
  let text = 'Connecting…';
  if (latest) {
    tone = live ? 'live' : 'quiet';
    text = live ? `Live · updated ${formatTime(latest.createdAt)}` : `Sensor quiet since ${formatTime(latest.createdAt)}`;
    if (status === 'error') text += ' · API unreachable, retrying';
  } else if (status === 'error') {
    tone = 'error';
    text = 'Can’t reach the API · retrying every 30 s';
  } else if (status === 'ok') {
    tone = 'quiet';
    text = 'No readings in the last 24 hours';
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

  return (
    <section className="panel panel--now" aria-labelledby="now-heading">
      <h2 id="now-heading" className="label">PM2.5 · latest 1-minute average</h2>
      {latest && band ? (
        <>
          {/* Keyed so the settle animation replays on every new reading. */}
          <p className="reading" key={latest.id}>
            <span className="reading-value">{latest.pm2_5}</span>
            <span className="reading-unit">µg/m³</span>
          </p>
          <p className="chip">
            <span className="chip-dot" aria-hidden="true" />
            {band.label}
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
            <div>
              <dt>WHO band</dt>
              <dd className="minor-text">{band.name}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="empty">
          {status === 'loading'
            ? 'Fetching the last 24 hours…'
            : 'No readings yet. Power the sensor and its first 1-minute average appears here within about a minute.'}
        </p>
      )}
    </section>
  );
}

function DayPanel({ stats, currentBand }: { stats: DayStats | null; currentBand: string | null }) {
  return (
    <section className="panel panel--day" aria-labelledby="day-heading">
      <h2 id="day-heading" className="label">Last 24 hours</h2>
      {stats ? (
        <>
          <Meter mean={stats.mean} />
          <dl className="facts">
            <div>
              <dt>Peak</dt>
              <dd>
                {stats.peak.pm2_5} µg/m³ <span>at {formatTime(stats.peak.createdAt)}</span>
              </dd>
            </div>
            <div>
              <dt>Lowest</dt>
              <dd>
                {stats.low.pm2_5} µg/m³ <span>at {formatTime(stats.low.createdAt)}</span>
              </dd>
            </div>
            <div>
              <dt>Recorded</dt>
              <dd>
                {whole.format(Math.min(stats.minutes, MINUTES_PER_DAY))}{' '}
                <span>of {whole.format(MINUTES_PER_DAY)} minutes</span>
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="empty">Nothing recorded in the last 24 hours.</p>
      )}

      <h3 className="label">
        WHO bands · PM2.5 <span className="unit">µg/m³</span>
      </h3>
      <ul className="legend">
        {BANDS.map((band) => (
          <li key={band.name} className={band.name === currentBand ? 'is-current' : undefined} style={bandStyle(band.color)}>
            <span className="swatch" aria-hidden="true" />
            <span className="legend-range">{band.range}</span>
            <span className="legend-name">{band.name}</span>
          </li>
        ))}
      </ul>

      <h3 className="label">In the chamber</h3>
      <ul className="sizes">
        <li>
          <span className="size-dot size-dot--fine" aria-hidden="true" />
          PM1 · finest and most numerous
        </li>
        <li>
          <span className="size-dot size-dot--mid" aria-hidden="true" />
          PM1 to PM2.5
        </li>
        <li>
          <span className="size-dot size-dot--coarse" aria-hidden="true" />
          PM2.5 to PM10 · settles fastest
        </li>
      </ul>
      <p className="foot">
        Dot counts follow the mass in each size class. Particles flash as they cross the laser sheet, which points at
        the current minute on the ring. WHO bands are set for 24-hour means; single minutes are shown against them for
        context.
      </p>
    </section>
  );
}

function Meter({ mean }: { mean: number }) {
  const scaleMax = Math.max(30, mean * 1.25);
  const over = mean - WHO_GUIDELINE_24H;

  return (
    <div className="meter" style={bandStyle(bandFor(mean).color)}>
      <p className="meter-figure">
        <span className="meter-value">{oneDecimal.format(mean)}</span>
        <span className="meter-unit">µg/m³ mean PM2.5</span>
      </p>
      <div className="meter-track" aria-hidden="true">
        <span className="meter-fill" style={{ width: `${Math.min(mean / scaleMax, 1) * 100}%` }} />
        <span className="meter-mark" style={{ left: `${(WHO_GUIDELINE_24H / scaleMax) * 100}%` }} />
      </div>
      <p className="meter-verdict">
        {over <= 0
          ? `Within the WHO 24-hour guideline of ${WHO_GUIDELINE_24H}`
          : `${oneDecimal.format(over)} above the WHO 24-hour guideline of ${WHO_GUIDELINE_24H}`}
      </p>
    </div>
  );
}

function Tooltip({ hover }: { hover: HoverInfo }) {
  const { reading, x, y } = hover;
  const band = reading ? bandFor(reading.pm2_5) : null;
  // Flip to the other side of the cursor near the window's right and bottom edges.
  const flipX = x > window.innerWidth - 240;
  const flipY = y > window.innerHeight - 150;
  const style: CSSProperties = {
    ...bandStyle(band?.color ?? '#5b6a7f'),
    left: x,
    top: y,
    transform: `translate(${flipX ? 'calc(-100% - 16px)' : '16px'}, ${flipY ? 'calc(-100% - 16px)' : '16px'})`,
  };

  return (
    <div className="tooltip" style={style}>
      <p className="tooltip-time">
        {hover.day} · {formatTime(hover.time)}
      </p>
      {reading && band ? (
        <>
          <p className="tooltip-value">
            {reading.pm2_5}
            <span> µg/m³ PM2.5</span>
          </p>
          <p className="tooltip-minor">
            PM1.0 {reading.pm1_0} · PM10 {reading.pm10}
          </p>
          <p className="tooltip-band">
            <span className="chip-dot" aria-hidden="true" />
            {band.name}
          </p>
        </>
      ) : (
        <p className="tooltip-minor">No reading this minute</p>
      )}
    </div>
  );
}
