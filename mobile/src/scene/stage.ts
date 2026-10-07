import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { Label, type LabelFrame, type LabelVariant } from './labels';
import { Orbit } from './orbit';
import type { SceneHost, SceneInput } from './types';

export const BG = '#05070b';
const UP = new THREE.Vector3(0, 1, 0);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
// Past about two pixels per dp a phone's GPU pays for detail nobody can see.
const MAX_RENDER_RATIO = 2;

export interface Bloom {
  strength: number;
  radius: number;
  threshold: number;
}

export interface StageOptions {
  /** Initial direction from the target to the camera. */
  direction: THREE.Vector3;
  fov?: number;
  bloom?: Bloom;
  /** Auto-rotate speed in turns per minute; 0 for none. */
  autoRotate?: number;
  /** Radians of slow side-to-side sway until the viewer takes the controls. */
  sway?: number;
  /** Depth fog, scaled to the camera distance. */
  fog?: boolean;
  /** Lowest and highest polar angles the camera can orbit to. */
  polar?: readonly [number, number];
  /** Closest and furthest zoom, as fractions of the fitted distance. */
  zoom?: readonly [number, number];
  /** How much further out than the fitted distance the camera starts, and how long it takes to ease in. */
  intro?: { extra: number; ms: number };
}

type TapHandler = (raycaster: THREE.Raycaster, x: number, y: number) => void;

/**
 * Renderer, camera, controls, labels and the per-frame loop shared by the views. The camera
 * frames whatever points a view registers and eases in from further out on first load, as on
 * the web; what differs is underneath: an expo-gl context instead of a canvas, gesture-handler
 * input instead of pointer events, and labels that React Native draws.
 */
export class Stage implements SceneInput {
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly reducedMotion: boolean;
  /** Render-target pixels per dp, for shaders that size points in pixels. */
  readonly pixelRatio: number;
  /** The view's size in dp. */
  readonly width: number;
  readonly height: number;

  private readonly host: SceneHost;
  private readonly orbit: Orbit;
  private readonly composer: EffectComposer;
  private readonly frameFns: ((dt: number, t: number) => void)[] = [];
  private readonly target = new THREE.Vector3();
  private readonly direction: THREE.Vector3;
  private readonly sway: number;
  private readonly zoom: readonly [number, number];
  private readonly intro: { extra: number; ms: number };
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly offset = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private fitPoints: THREE.Vector3[] = [];
  private fitDistance = 30;
  private labels: Label[] = [];
  private readonly startedAt = performance.now();
  private lastFrame = performance.now();
  private frameRequest = 0;
  private disposed = false;
  private userMoved = false;
  private touches = 0;
  private onTapHandler: TapHandler | null = null;
  private onLeave: (() => void) | null = null;

  constructor(host: SceneHost, options: StageOptions) {
    const { gl } = host;
    this.host = host;
    this.width = host.width;
    this.height = host.height;
    this.reducedMotion = host.reducedMotion;
    this.direction = options.direction.clone().normalize();
    this.sway = options.sway ?? 0;
    this.zoom = options.zoom ?? [0.4, 2];
    this.intro = options.intro ?? { extra: 0.4, ms: 3000 };

    quietPixelStore(gl);
    this.renderer = createRenderer(gl);
    // expo-gl's drawing buffer is fixed at the view's size in device pixels, so draw to all of it.
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(BG);
    const deviceRatio = gl.drawingBufferWidth / host.width;
    this.pixelRatio = Math.min(deviceRatio, MAX_RENDER_RATIO);

    this.scene.background = new THREE.Color(BG);
    if (options.fog) this.scene.fog = new THREE.Fog(BG, 30, 90);
    this.scene.add(new THREE.HemisphereLight(0xc8dcff, 0x0a0e15, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-10, 18, 12);
    this.scene.add(sun, this.root);

    this.camera = new THREE.PerspectiveCamera(options.fov ?? 34, host.width / host.height, 0.1, 600);
    this.camera.position.copy(this.direction).multiplyScalar(this.fitDistance);
    this.orbit = new Orbit(this.camera, () => this.height);
    [this.orbit.minPolarAngle, this.orbit.maxPolarAngle] = options.polar ?? [0.15, 1.48];
    this.orbit.autoRotate = (options.autoRotate ?? 0) > 0 && !this.reducedMotion;
    this.orbit.autoRotateSpeed = options.autoRotate ?? 0;

    // Android's GL views have no antialiasing and expo-gl can't make multisampled targets, so every
    // view draws through a composer that finishes with FXAA. Half-float targets keep the dark fog
    // free of banding and carry bloom's HDR glints; a GPU without them gets neither.
    const halfFloat = halfFloatRenderable(gl);
    const target = new THREE.WebGLRenderTarget(1, 1, { type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(this.pixelRatio / deviceRatio);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (options.bloom && halfFloat) {
      const { strength, radius, threshold } = options.bloom;
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), strength, radius, threshold));
    }
    // FXAA works on the final colours, so it comes after tone mapping.
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new FXAAPass());
    this.composer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);

    this.frameRequest = requestAnimationFrame(this.frame);
  }

  /** Narrow screens, where views drop every other label to avoid pile-ups. */
  get compact(): boolean {
    return this.width < 640;
  }

  /** Sets what the camera orbits and the points that must stay on screen. */
  setFrame(target: THREE.Vector3, points: THREE.Vector3[]): void {
    // Move the camera with the target so a viewer's chosen angle survives content changes.
    this.camera.position.add(this.offset.copy(target).sub(this.target));
    this.target.copy(target);
    this.orbit.target.copy(target);
    this.fitPoints = points;
    this.refit();
  }

  onFrame(fn: (dt: number, t: number) => void): void {
    this.frameFns.push(fn);
  }

  /** Calls `fn` with the view's size in dp. The size never changes: a resized view gets a new stage. */
  onResize(fn: (width: number, height: number) => void): void {
    fn(this.width, this.height);
  }

  /** Called with a raycaster aimed at each tap; `leave` when a drag starts and the tooltip should go. */
  onTap(tap: TapHandler, leave: () => void): void {
    this.onTapHandler = tap;
    this.onLeave = leave;
  }

  dragStart(): void {
    this.touches++;
    this.userMoved = true;
    this.orbit.hold(true);
    this.onLeave?.();
  }

  drag(dx: number, dy: number): void {
    this.orbit.rotate(dx, dy);
  }

  pinch(scaleChange: number): void {
    this.orbit.zoom(scaleChange);
  }

  dragEnd(): void {
    // A pan and a pinch can overlap; only let go once both have.
    this.touches = Math.max(0, this.touches - 1);
    if (this.touches === 0) this.orbit.hold(false);
  }

  tap(x: number, y: number): void {
    if (!this.onTapHandler) return;
    this.pointer.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.onTapHandler(this.raycaster, x, y);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameRequest);
    disposeTree(this.scene);
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    // No forceContextLoss as on the web: expo-gl has no WEBGL_lose_context, and the context goes
    // with its view.
    this.renderer.dispose();
  }

  private readonly frame = () => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    const t = now / 1000;

    for (const fn of this.frameFns) fn(dt, t);
    this.placeCamera(now, t);
    this.orbit.update(dt);
    this.composer.render(dt);
    this.host.gl.endFrameEXP();
    this.publishLabels();
    this.frameRequest = requestAnimationFrame(this.frame);
  };

  // Until the viewer takes over: ease in from further out, sway gently, and hold the fitted distance.
  private placeCamera(now: number, t: number): void {
    if (this.userMoved) return;
    const progress = this.reducedMotion ? 1 : Math.min((now - this.startedAt) / this.intro.ms, 1);
    const distance = this.fitDistance * (1 + this.intro.extra * (1 - easeOutCubic(progress)));
    if (this.sway > 0 && !this.reducedMotion) {
      this.offset.copy(this.direction).applyAxisAngle(UP, Math.sin(t * 0.2) * this.sway);
    } else {
      // Keeps whatever heading auto-rotate has reached.
      this.offset.copy(this.camera.position).sub(this.target).normalize();
    }
    this.camera.position.copy(this.target).addScaledVector(this.offset, distance);
  }

  /** Tells React Native which labels exist when that changes, and where each one is every frame. */
  private publishLabels(): void {
    const labels: Label[] = [];
    collectLabels(this.scene, labels);
    if (labels.length !== this.labels.length || labels.some((label, i) => label !== this.labels[i])) {
      this.labels = labels;
      this.host.onLabels(labels.map((label) => ({ id: label.id, text: label.text, variant: label.variant })));
    }

    const frame: Record<number, [number, number, number]> = {};
    for (const label of labels) {
      // Rendering has just brought every matrixWorld up to date.
      this.projected.setFromMatrixPosition(label.matrixWorld).project(this.camera);
      // Behind the camera or beyond the far plane, where CSS2DRenderer hides them too.
      if (this.projected.z < -1 || this.projected.z > 1) continue;
      frame[label.id] = [
        ((this.projected.x + 1) / 2) * this.width,
        ((1 - this.projected.y) / 2) * this.height,
        label.opacity,
      ];
    }
    this.host.onLabelFrame(frame satisfies LabelFrame);
  }

  private refit(): void {
    if (this.fitPoints.length === 0) return;
    this.fitDistance = this.computeFitDistance();
    this.orbit.minDistance = this.fitDistance * this.zoom[0];
    this.orbit.maxDistance = this.fitDistance * this.zoom[1];
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = this.fitDistance * 0.9;
      this.scene.fog.far = this.fitDistance * 2.6;
    }
  }

  /** Binary-searches the closest distance that keeps every fit point on screen. */
  private computeFitDistance(): number {
    const probe = this.camera.clone();
    const direction = this.userMoved
      ? this.camera.position.clone().sub(this.target).normalize()
      : this.direction;
    const projected = new THREE.Vector3();
    let near = 1;
    let far = 400;
    for (let step = 0; step < 24; step++) {
      const distance = (near + far) / 2;
      probe.position.copy(this.target).addScaledVector(direction, distance);
      probe.lookAt(this.target);
      probe.updateMatrixWorld();
      const fits = this.fitPoints.every((point) => {
        projected.copy(point).project(probe);
        return projected.x >= -0.96 && projected.x <= 0.96 && projected.y >= -0.9 && projected.y <= 0.9;
      });
      if (fits) far = distance;
      else near = distance;
    }
    return far;
  }
}

/**
 * expo-gl makes its WebGL 2 context an instance of WebGLRenderingContext, which browsers don't,
 * and three's constructor takes that for WebGL 1 and throws. Its only such check is there, so the
 * WebGL 1 class is hidden for just that call.
 */
function createRenderer(gl: ExpoWebGLRenderingContext): THREE.WebGLRenderer {
  const global = globalThis as { WebGLRenderingContext?: unknown };
  const webgl1 = global.WebGLRenderingContext;
  global.WebGLRenderingContext = undefined;
  try {
    return new THREE.WebGLRenderer({ canvas: canvasFor(gl), context: gl });
  } finally {
    global.WebGLRenderingContext = webgl1;
  }
}

/** three needs a canvas only for its size and context-loss events; an expo-gl context has neither. */
function canvasFor(gl: ExpoWebGLRenderingContext): HTMLCanvasElement {
  return {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLCanvasElement;
}

/** expo-gl logs a warning for each pixelStorei parameter it lacks, and three resets a dozen per scene. */
function quietPixelStore(gl: ExpoWebGLRenderingContext): void {
  const pixelStorei = gl.pixelStorei.bind(gl);
  gl.pixelStorei = (pname, param) => {
    if (pname === gl.UNPACK_FLIP_Y_WEBGL || pname === gl.UNPACK_ALIGNMENT) pixelStorei(pname, param);
  };
}

/** Whether the GPU can draw into half-float targets. */
function halfFloatRenderable(gl: ExpoWebGLRenderingContext): boolean {
  if (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')) return true;
  // OpenGL ES 3.2 made them core, and some drivers have stopped listing the extensions since.
  return /OpenGL ES 3\.[2-9]/.test(String(gl.getParameter(gl.VERSION)));
}

function collectLabels(object: THREE.Object3D, out: Label[]): void {
  if (!object.visible) return;
  if (object instanceof Label) out.push(object);
  for (const child of object.children) collectLabels(child, out);
}

// ── Building blocks shared by the views ──────────────────────────────────

export function label(text: string, variant: LabelVariant = 'plain'): Label {
  return new Label(text, variant);
}

/** A tag floating above a data point, joined to it by a short leader line. */
export function callout(text: string, x: number, top: number, z: number, lift = 1.1): THREE.Group {
  const group = new THREE.Group();
  const leader = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, top + 0.1, z),
    new THREE.Vector3(x, top + lift - 0.3, z),
  ]);
  group.add(new THREE.Line(leader, new THREE.LineBasicMaterial({ color: 0xe6edf5, transparent: true, opacity: 0.6 })));
  const tag = label(text, 'callout');
  tag.position.set(x, top + lift, z);
  group.add(tag);
  return group;
}

/** The translucent sheet at the WHO guideline height, with its outline. */
export function guidelineSheet(width: number, depth: number, y: number, centreZ = 0): THREE.Group {
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, centreZ);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: 0x9bd8ff, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide,
  })));
  group.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x9bd8ff, transparent: true, opacity: 0.5 }),
  ));
  return group;
}

export function floorPlane(width: number, depth: number, centreZ = 0): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.02, centreZ);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x080d15 }));
}

export function lineSegments(coords: number[], opacity: number, color = 0x2a3b55): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/** A thin vertical line for marking the tapped point. */
export function marker(): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff }));
  line.visible = false;
  return line;
}

export function disposeTree(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
    // Instance matrices and colours are GPU buffers of their own.
    if (child instanceof THREE.InstancedMesh) child.dispose();
  });
}

/** Removes and frees everything in a group, so a view can rebuild from fresh data. */
export function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    disposeTree(child);
    group.remove(child);
  }
}
