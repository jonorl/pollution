import { useEffect, useRef, useState } from 'react';

import { tr, type Lang } from '../i18n';
import type { ViewDef } from '../views';
import type { HoverInfo, SceneView, ViewData } from './types';

interface ViewSceneProps {
  view: ViewDef;
  /** The 3D labels are drawn once per scene, so a new language means a new scene. */
  lang: Lang;
  data: ViewData;
  /** Text alternative for the 3D view. */
  label: string;
  onHover: (hover: HoverInfo | null) => void;
}

// three.js has needed WebGL 2 since r163; WebGL 1 alone isn't enough.
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    // Release the probe context straight away; browsers cap how many can be live.
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  } catch {
    return false;
  }
}

export function ViewScene({ view, lang, data, label, onHover }: ViewSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneView | null>(null);
  const dataRef = useRef(data);
  const hoverRef = useRef(onHover);
  const [supported] = useState(supportsWebGL);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    hoverRef.current = onHover;
  }, [onHover]);

  // One scene per view: switching disposes the old one, freeing its GPU memory, before loading the next.
  useEffect(() => {
    const container = containerRef.current;
    if (!supported || !container) return;
    let scene: SceneView | null = null;
    let cancelled = false;

    view
      .load()
      .then((create) => {
        if (cancelled) return;
        // Creating the renderer can still fail where WebGL 2 is reported, e.g. on a blocklisted GPU.
        scene = create(container, (hover) => hoverRef.current(hover));
        scene.setData(dataRef.current);
        sceneRef.current = scene;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
      hoverRef.current(null);
    };
  }, [supported, view, lang]);

  useEffect(() => {
    dataRef.current = data;
    sceneRef.current?.setData(data);
  }, [data]);

  if (!supported || failed) {
    return (
      <div id="view-panel" className="scene scene--fallback" role="tabpanel" aria-labelledby={`tab-${view.id}`}>
        <p>{tr().views.noWebgl}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} id="view-panel" className="scene" role="tabpanel" aria-labelledby={`tab-${view.id}`}>
      <p className="sr-only">{label}</p>
    </div>
  );
}
