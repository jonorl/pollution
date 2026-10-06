import type { CreateView } from './scene/types';

export type ViewId = 'breath' | 'landscape' | 'calendar' | 'size-mix' | 'clock';

// Names and hints for each view are in strings.ts, keyed by id.
export interface ViewDef {
  id: ViewId;
  /** The landscape needs 5-minute means for a fortnight. */
  needsBins?: boolean;
  /** The calendar needs daily means for half a year. */
  needsDaily?: boolean;
  /** Each view is its own chunk, so only the one on screen is downloaded. */
  load: () => Promise<CreateView>;
}

export const VIEWS: readonly ViewDef[] = [
  { id: 'clock', load: () => import('./scene/ChamberScene').then((m) => m.createClock) },
  { id: 'breath', load: () => import('./scene/views/breath').then((m) => m.createBreath) },
  { id: 'landscape', needsBins: true, load: () => import('./scene/views/landscape').then((m) => m.createLandscape) },
  { id: 'size-mix', load: () => import('./scene/views/sizeMix').then((m) => m.createSizeMix) },
  { id: 'calendar', needsDaily: true, load: () => import('./scene/views/calendar').then((m) => m.createCalendar) },
];

export const DEFAULT_VIEW: ViewId = 'breath';

export const findView = (id: string | null | undefined): ViewDef | undefined => VIEWS.find((view) => view.id === id);
