import type { ExpoWebGLRenderingContext } from 'expo-gl';

import type { Bin, DailyMean, Reading } from '../api';
import type { LabelFrame, LabelSpec } from './labels';

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
  /** Where the tap landed, in dp from the scene's top left. */
  x: number;
  y: number;
  heading: string;
  /** Drives the big number and the band colour; null when there is no reading. */
  pm25: number | null;
  caption: string;
  details: string[];
}

/** What a view gets from the screen it draws on. */
export interface SceneHost {
  gl: ExpoWebGLRenderingContext;
  /** The GL view's size in dp. */
  width: number;
  height: number;
  reducedMotion: boolean;
  onHover: (hover: HoverInfo | null) => void;
  /** The set of labels changed; React Native draws them over the GL view. */
  onLabels: (labels: LabelSpec[]) => void;
  /** Where every label is this frame. */
  onLabelFrame: (frame: LabelFrame) => void;
}

/** Touch input, forwarded from the gesture handlers wrapped round the GL view. */
export interface SceneInput {
  dragStart(): void;
  /** Finger movement in dp since the last call. */
  drag(dx: number, dy: number): void;
  /** Change in pinch scale since the last call. */
  pinch(scaleChange: number): void;
  dragEnd(): void;
  /** A tap at a point in dp from the scene's top left. */
  tap(x: number, y: number): void;
}

export interface SceneView {
  setData(data: ViewData): void;
  input: SceneInput;
  dispose(): void;
}

export type CreateView = (host: SceneHost) => SceneView;
