import type { CSSProperties } from 'react';

import type { Reading } from './api';
import { WHO_GUIDELINE_24H } from './bands';
import { breathCounts, particlesPerDot, SIZE_THRESHOLDS } from './breath';
import { formatNumber, formatValue } from './format';
import { tr } from './i18n';
import { SIZE_CLASSES } from './sizes';
import type { ViewId } from './views';

interface ViewNotesProps {
  view: ViewId;
  latest: Reading | null;
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

export function ViewNotes({ view, latest, coarsePointer, failed }: ViewNotesProps) {
  const notes = tr().notes;

  switch (view) {
    case 'breath':
      return <BreathNotes latest={latest} coarsePointer={coarsePointer} />;

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

function BreathNotes({ latest, coarsePointer }: { latest: Reading | null; coarsePointer: boolean }) {
  const text = tr().notes.breath;
  const counts = breathCounts(latest);
  const perDot = counts ? particlesPerDot(counts.total, coarsePointer) : 1;

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
          <p className="foot">
            {counts.measured ? text.measured : text.estimated}{' '}
            {perDot > 1 ? text.perDot(formatNumber(perDot)) : text.oneDot}
          </p>
        </>
      ) : (
        <p className="empty">{text.none}</p>
      )}
    </section>
  );
}
