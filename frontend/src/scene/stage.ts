import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export const BG = '#05070b';
const UP = new THREE.Vector3(0, 1, 0);
const DOLLY_MS = 3000;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export interface StageOptions {
  /** Initial direction from the target to the camera. */
  direction: THREE.Vector3;
  fov?: number;
  bloom?: boolean;
  /** OrbitControls auto-rotate speed; 0 for none. */
  autoRotate?: number;
  /** Radians of slow side-to-side sway until the viewer takes the controls. */
  sway?: number;
  /** Depth fog, scaled to the camera distance. */
  fog?: boolean;
}

type PointerHandler = (raycaster: THREE.Raycaster, event: PointerEvent) => void;

/**
 * Renderer, camera, controls, labels and the per-frame loop shared by the views. The camera
 * frames whatever points a view registers, centred in the part of the window the side rail
 * leaves free, and eases in from further out on first load.
 */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly reducedMotion: boolean;
  readonly coarsePointer: boolean;

  private readonly container: HTMLElement;
  private readonly labels = new CSS2DRenderer();
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer | null;
  private readonly resizeObserver: ResizeObserver;
  private readonly frameFns: ((dt: number, t: number) => void)[] = [];
  private readonly resizeFns: ((width: number, height: number) => void)[] = [];
  private readonly target = new THREE.Vector3();
  private readonly direction: THREE.Vector3;
  private readonly sway: number;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly offset = new THREE.Vector3();
  private fitPoints: THREE.Vector3[] = [];
  private fitDistance = 30;
  private readonly startedAt = performance.now();
  private lastFrame = performance.now();
  private userMoved = false;
  private dragging = false;
  private onPointerMove: PointerHandler | null = null;
  private onPointerLeave: (() => void) | null = null;

  constructor(container: HTMLElement, options: StageOptions) {
    this.container = container;
    this.direction = options.direction.clone().normalize();
    this.sway = options.sway ?? 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    this.renderer = new THREE.WebGLRenderer({ antialias: !options.bloom, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.coarsePointer ? 1.5 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(BG);
    this.renderer.domElement.className = 'scene-canvas';
    container.appendChild(this.renderer.domElement);

    this.labels.domElement.className = 'scene-labels';
    this.labels.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.labels.domElement);

    this.scene.background = new THREE.Color(BG);
    if (options.fog) this.scene.fog = new THREE.Fog(BG, 30, 90);
    this.scene.add(new THREE.HemisphereLight(0xc8dcff, 0x0a0e15, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-10, 18, 12);
    this.scene.add(sun, this.root);

    this.camera = new THREE.PerspectiveCamera(options.fov ?? 34, 1, 0.1, 600);
    this.camera.position.copy(this.direction).multiplyScalar(this.fitDistance);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = 1.48;
    this.controls.autoRotate = (options.autoRotate ?? 0) > 0 && !this.reducedMotion;
    this.controls.autoRotateSpeed = options.autoRotate ?? 0;
    this.controls.addEventListener('start', this.handleControlStart);
    this.controls.addEventListener('end', this.handleControlEnd);

    if (options.bloom) {
      // MSAA on the composer's target, since the default framebuffer's antialiasing is lost.
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.45, 0.8));
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
    }

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.handlePointer);
    canvas.addEventListener('pointerdown', this.handlePointer);
    canvas.addEventListener('pointerleave', this.handleLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.frame);
  }

  /** Narrow screens, where views drop every other label to avoid pile-ups. */
  get compact(): boolean {
    return this.container.clientWidth < 640;
  }

  /** Sets what the camera orbits and the points that must stay on screen. */
  setFrame(target: THREE.Vector3, points: THREE.Vector3[]): void {
    // Move the camera with the target so a viewer's chosen angle survives content changes.
    this.camera.position.add(this.offset.copy(target).sub(this.target));
    this.target.copy(target);
    this.controls.target.copy(target);
    this.fitPoints = points;
    this.refit();
  }

  onFrame(fn: (dt: number, t: number) => void): void {
    this.frameFns.push(fn);
  }

  onResize(fn: (width: number, height: number) => void): void {
    this.resizeFns.push(fn);
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth && clientHeight) fn(clientWidth, clientHeight);
  }

  /** Called with a raycaster aimed at the pointer; `leave` when the pointer goes or a drag starts. */
  onPointer(move: PointerHandler, leave: () => void): void {
    this.onPointerMove = move;
    this.onPointerLeave = leave;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.handlePointer);
    canvas.removeEventListener('pointerdown', this.handlePointer);
    canvas.removeEventListener('pointerleave', this.handleLeave);
    this.controls.removeEventListener('start', this.handleControlStart);
    this.controls.removeEventListener('end', this.handleControlEnd);
    this.controls.dispose();

    disposeTree(this.scene);
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose();
      this.composer.dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
    this.labels.domElement.remove();
  }

  private readonly frame = () => {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    const t = now / 1000;

    for (const fn of this.frameFns) fn(dt, t);
    this.placeCamera(now, t);
    this.controls.update(dt);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  // Until the viewer takes over: ease in from further out, sway gently, and hold the fitted distance.
  private placeCamera(now: number, t: number): void {
    if (this.userMoved) return;
    const intro = this.reducedMotion ? 1 : Math.min((now - this.startedAt) / DOLLY_MS, 1);
    const distance = this.fitDistance * (1 + 0.4 * (1 - easeOutCubic(intro)));
    if (this.sway > 0 && !this.reducedMotion) {
      this.offset.copy(this.direction).applyAxisAngle(UP, Math.sin(t * 0.2) * this.sway);
    } else {
      // Keeps whatever heading auto-rotate has reached.
      this.offset.copy(this.camera.position).sub(this.target).normalize();
    }
    this.camera.position.copy(this.target).addScaledVector(this.offset, distance);
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;

    this.renderer.setSize(width, height, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(width, height);
    }
    this.labels.setSize(width, height);

    // On wide layouts the rail covers the left of the canvas; shift the projection so the
    // content centres in the uncovered part while the canvas still fills the window.
    const inset = parseFloat(getComputedStyle(this.container).getPropertyValue('--scene-inset-left')) || 0;
    this.camera.aspect = width / height;
    if (inset > 0) this.camera.setViewOffset(width, height, -inset / 2, 0, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();

    for (const fn of this.resizeFns) fn(width, height);
    this.refit();
  }

  private refit(): void {
    const width = this.container.clientWidth;
    if (!width || this.fitPoints.length === 0) return;
    const inset = parseFloat(getComputedStyle(this.container).getPropertyValue('--scene-inset-left')) || 0;
    this.fitDistance = this.computeFitDistance(-1 + (2 * inset) / width);
    this.controls.minDistance = this.fitDistance * 0.4;
    this.controls.maxDistance = this.fitDistance * 2;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = this.fitDistance * 0.9;
      this.scene.fog.far = this.fitDistance * 2.6;
    }
  }

  /** Binary-searches the closest distance that keeps every fit point on screen. */
  private computeFitDistance(leftEdge: number): number {
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
      // The top margin leaves room for the view tabs, the bottom one for the hint.
      const fits = this.fitPoints.every((point) => {
        projected.copy(point).project(probe);
        return projected.x >= leftEdge + 0.04 && projected.x <= 0.96 && projected.y >= -0.84 && projected.y <= 0.8;
      });
      if (fits) far = distance;
      else near = distance;
    }
    return far;
  }

  private readonly handleControlStart = () => {
    this.userMoved = true;
    this.dragging = true;
    this.onPointerLeave?.();
  };

  private readonly handleControlEnd = () => {
    this.dragging = false;
  };

  private readonly handlePointer = (event: PointerEvent) => {
    if (this.dragging || !this.onPointerMove) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.onPointerMove(this.raycaster, event);
  };

  private readonly handleLeave = () => {
    this.onPointerLeave?.();
  };
}

// ── Building blocks shared by the views ──────────────────────────────────

export function label(text: string, className = 'scene-label'): CSS2DObject {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

/** A tag floating above a data point, joined to it by a short leader line. */
export function callout(text: string, x: number, top: number, z: number, lift = 1.1): THREE.Group {
  const group = new THREE.Group();
  const leader = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, top + 0.1, z),
    new THREE.Vector3(x, top + lift - 0.3, z),
  ]);
  group.add(new THREE.Line(leader, new THREE.LineBasicMaterial({ color: 0xe6edf5, transparent: true, opacity: 0.6 })));
  const tag = label(text, 'scene-callout');
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

/** A thin vertical line for marking the hovered point. */
export function marker(): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff }));
  line.visible = false;
  return line;
}

export function disposeTree(object: THREE.Object3D): void {
  object.traverse((child) => {
    // A label only removes its element when it is removed itself, not when a parent group is.
    if (child instanceof CSS2DObject) child.element.remove();
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}

/** Removes and frees everything in a group, so a view can rebuild from fresh data. */
export function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    disposeTree(child);
    group.remove(child);
  }
}
