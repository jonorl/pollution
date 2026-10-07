import AsyncStorage from '@react-native-async-storage/async-storage';

import { createClock } from './scene/ChamberScene';
import type { CreateView } from './scene/types';
import { createBreath } from './scene/views/breath';
import { createCalendar } from './scene/views/calendar';
import { createLandscape } from './scene/views/landscape';
import { createSizeMix } from './scene/views/sizeMix';

export type ViewId = 'breath' | 'landscape' | 'calendar' | 'size-mix' | 'clock';

// Names and hints for each view are in strings.ts, keyed by id.
export interface ViewDef {
  id: ViewId;
  /** The landscape needs 5-minute means for a fortnight. */
  needsBins?: boolean;
  /** The calendar needs daily means for half a year. */
  needsDaily?: boolean;
  // The web loads each view as its own chunk; an app ships them all in one bundle anyway.
  create: CreateView;
}

export const VIEWS: readonly ViewDef[] = [
  { id: 'clock', create: createClock },
  { id: 'breath', create: createBreath },
  { id: 'landscape', needsBins: true, create: createLandscape },
  { id: 'size-mix', create: createSizeMix },
  { id: 'calendar', needsDaily: true, create: createCalendar },
];

export const DEFAULT_VIEW: ViewId = 'breath';

export const findView = (id: string | null | undefined): ViewDef | undefined => VIEWS.find((view) => view.id === id);

const STORAGE_KEY = 'pollution:view';

/** The view last chosen on this phone, or the default. */
export async function loadView(): Promise<ViewId> {
  try {
    return findView(await AsyncStorage.getItem(STORAGE_KEY))?.id ?? DEFAULT_VIEW;
  } catch {
    // Storage can fail; the default view is fine.
    return DEFAULT_VIEW;
  }
}

export function saveView(id: ViewId): void {
  AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {
    // Storage can fail; the view just won't be remembered.
  });
}
