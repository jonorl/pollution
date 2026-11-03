import { useMemo, type CSSProperties } from 'react';

import type { Reading } from './api';
import { bandFor, WHO_GUIDELINE_24H } from './bands';
import { breathCounts, depositedPerDay, particlesPerDot, particlesPerSpeck, SIZE_THRESHOLDS } from './breath';
import { formatCount, formatNumber, formatValue } from './format';
import { tr } from './i18n';
import { SIZE_CLASSES } from './sizes';
import type { ViewId } from './views';

interface ViewNotesProps {
  view: ViewId;
  /** The last 24 hours, oldest first. */
  readings: readonly Reading[];
  latest: Reading | null;
  /** Mean PM2.5 over the last 24 hours, which sets how the breath view draws the lungs. */
  dayMean: number | null;
  coarsePointer: boolean;
  /** The view's own data failed to load (landscape and calendar fetch extra data). */
  failed: boolean;
}

const swatch = (color: string) => ({ '--band': color }) as CSSProperties;

function Guideline() {
  return (
    <p className="key-line">
      <span className="sheet-swatch" aria-hidden="true" />
      {tr().notes.guideline(formatValue(WHO_GUIDELINE_24H))}
    </p>
  );
}

export function ViewNotes({ view, readings, latest, dayMean, coarsePointer, failed }: ViewNotesProps) {
  const notes = tr().notes;

  switch (view) {
    case 'breath':
      return <BreathNotes readings={readings} latest={latest} dayMean={dayMean} coarsePointer={coarsePointer} />;

    case 'landscape':
      return (
        <section className="panel panel--notes" aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="label">{notes.landscape.heading}</h2>
          <p>{notes.landscape.body}</p>
          <Guideline />
          {failed && <p className="notice">{notes.failed(notes.landscape.what, notes.landscape.every)}</p>}
        </section>
      );

    case 'calendar':
      return (
        <section className="panel panel--notes" aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="label">{notes.calendar.heading}</h2>
          <p>{notes.calendar.body}</p>
          <Guideline />
          {failed && <p className="notice">{notes.failed(notes.calendar.what, notes.calendar.every)}</p>}
        </section>
      );

    case 'size-mix':
      return (
        <section className="panel panel--notes" aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="label">{notes.sizeMix.heading}</h2>
          <p>{notes.sizeMix.body}</p>
          <ul className="key">
            {SIZE_CLASSES.map((size) => (
              <li key={size.key} style={swatch(size.color)}>
                <span className="swatch" aria-hidden="true" />
                <span className="key-name">{size.name}</span>
                <span className="key-detail">{tr().sizes[size.key]}</span>
              </li>
            ))}
          </ul>
        </section>
      );

    case 'clock':
      return (
        <section className="panel panel--notes" aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="label">{notes.clock.heading}</h2>
          <p>{notes.clock.body}</p>
          <ul className="sizes">
            <li><span className="size-dot size-dot--fine" aria-hidden="true" />{notes.clock.fine}</li>
            <li><span className="size-dot size-dot--mid" aria-hidden="true" />{notes.clock.mid}</li>
            <li><span className="size-dot size-dot--coarse" aria-hidden="true" />{notes.clock.coarse}</li>
          </ul>
          <p className="foot">{notes.clock.foot}</p>
        </section>
      );
  }
}

interface BreathNotesProps {
  readings: readonly Reading[];
  latest: Reading | null;
  dayMean: number | null;
  coarsePointer: boolean;
}

function BreathNotes({ readings, latest, dayMean, coarsePointer }: BreathNotesProps) {
  const text = tr().notes.breath;
  const counts = breathCounts(latest);
  const perDot = counts ? particlesPerDot(counts.total, coarsePointer) : 1;
  const day = useMemo(() => depositedPerDay(readings), [readings]);

  return (
    <section className="panel panel--notes" aria-labelledby="notes-heading">
      <h2 id="notes-heading" className="label">{text.heading}</h2>
      {counts ? (
        <>
          <p className="breath-count">{formatNumber(counts.total)}</p>
          <p className="breath-caption">{text.caption}</p>
          <dl className="size-table">
            {SIZE_THRESHOLDS.map((size, i) => (
              <div key={size}>
                <dt>≥{formatValue(Number(size))} µm</dt>
                <dd>{formatNumber(counts.total * counts.shares[i])}</dd>
              </div>
            ))}
          </dl>
          {day !== null && (
            <>
              <p className="breath-count breath-count--day">{formatCount(day)}</p>
              <p className="breath-caption">{text.settled}</p>
            </>
          )}
          <p>{text.lodge}</p>
          {dayMean !== null && <p>{text.lungs(formatValue(dayMean))} {text.stages[bandFor(dayMean).key]}</p>}
          <p className="foot">
            {counts.measured ? text.measured : text.estimated}{' '}
            {text.perDot(formatNumber(perDot))}
            {day !== null && <> {text.perSpeck(formatNumber(particlesPerSpeck(day, coarsePointer)))} {text.clearance}</>}
            {dayMean !== null && <> {text.lungsFoot}</>}
          </p>
        </>
      ) : (
        <p className="empty">{text.none}</p>
      )}
    </section>
  );
}
