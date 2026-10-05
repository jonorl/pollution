import { useEffect, useRef, useState } from 'react';

import type { Reading } from '../api';
import type { ChamberScene, HoverInfo } from './ChamberScene';

interface AirSceneProps {
  readings: readonly Reading[];
  /** Text alternative for the 3D view. */
  label: string;
  onHover: (hover: HoverInfo | null) => void;
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    // Release the probe context straight away; browsers cap how many can be live.
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  } catch {
    return false;
  }
}

export function AirScene({ readings, label, onHover }: AirSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ChamberScene | null>(null);
  const readingsRef = useRef(readings);
  const hoverRef = useRef(onHover);
  const [supported] = useState(supportsWebGL);

  useEffect(() => {
    hoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    const container = containerRef.current;
    if (!supported || !container) return;
    let scene: ChamberScene | null = null;
    let cancelled = false;

    // three.js is most of the bundle; loading it separately lets the readings render first.
    void import('./ChamberScene').then(({ ChamberScene }) => {
      if (cancelled) return;
      scene = new ChamberScene(container, (hover) => hoverRef.current(hover));
      scene.setReadings(readingsRef.current);
      sceneRef.current = scene;
    });

    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [supported]);

  useEffect(() => {
    readingsRef.current = readings;
    sceneRef.current?.setReadings(readings);
  }, [readings]);

  if (!supported) {
    return (
      <div className="scene scene--fallback">
        <p>
          This browser can't draw the 3D chamber because WebGL is switched off or unsupported. The
          readings alongside still update live.
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className="scene" role="img" aria-label={label} />;
}
