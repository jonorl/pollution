import type { Bin, DailyMean, Reading } from '../api';

/** Everything a view might draw; each view reads only what it needs. */
export interface ViewData {
  /** Minute readings for the last 24 hours, oldest first. */
  readings: readonly Reading[];
  /** 5-minute means for the last 14 days; null until loaded, and only loaded for views that use it. */
  bins: readonly Bin[] | null;
  /** Daily means for the last 26 weeks; null until loaded, and only loaded for views that use it. */
  daily: readonly DailyMean[] | null;
}

export interface HoverInfo {
  /** Pointer position in client pixels. */
  x: number;
  y: number;
  heading: string;
  /** Drives the big number and the band colour; null when there is no reading. */
  pm25: number | null;
  caption: string;
  details: string[];
}

export interface SceneView {
  setData(data: ViewData): void;
  dispose(): void;
}

export type CreateView = (container: HTMLElement, onHover: (hover: HoverInfo | null) => void) => SceneView;
