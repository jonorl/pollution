import * as THREE from 'three';

/** The web's label classes (scene-label--now and so on); SceneLabels styles each. */
export type LabelVariant = 'plain' | 'now' | 'guide' | 'strong' | 'who' | 'callout';

/**
 * A text tag pinned to a point in the scene. There is no DOM here for three's CSS2DRenderer, so
 * the stage projects each label to the screen every frame and React Native draws the text over
 * the GL view.
 */
export class Label extends THREE.Object3D {
  readonly text: string;
  readonly variant: LabelVariant;
  /** For views that fade labels on the far side of the scene. */
  opacity = 1;

  constructor(text: string, variant: LabelVariant = 'plain') {
    super();
    this.text = text;
    this.variant = variant;
  }
}

export interface LabelSpec {
  /** The label's Object3D id, stable for as long as the label is in the scene. */
  id: number;
  text: string;
  variant: LabelVariant;
}

/** Each label on screen this frame, by id: its centre in dp from the view's top left, and opacity. */
export type LabelFrame = Record<number, readonly [x: number, y: number, opacity: number]>;
