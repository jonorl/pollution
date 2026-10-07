import * as THREE from 'three';

import type { Reading } from '../api';
import { BANDS, bandFor, WHO_GUIDELINE_24H } from '../bands';
import { formatTime, formatValue, minuteOfDay, temperatureLines } from '../format';
import { tr } from '../i18n';
import type { Label } from './labels';
import { particleFragment, particleVertex, sheetFragment, sheetVertex } from './shaders';
import { BG, label, Stage } from './stage';
import type { CreateView, SceneHost } from './types';

const MINUTES = 1440;
const DAY_MS = 86_400_000;
const TAU = Math.PI * 2;

const SMOG = '#18181b';

// The ring is a 24-hour clock: one bar per minute, midnight at the back, running clockwise.
const RING_RADIUS = 9;
const BAR_WIDTH = 0.034;
const BAR_DEPTH = 0.55;
const STUB = 0.04;
const UNITS_PER_UG = 0.09;
const MAX_BAR_UG = 95;
const LABEL_RADIUS = RING_RADIUS + 1.9;

const CHAMBER_RADIUS = 6;
const CHAMBER_HEIGHT = 7;
const CHAMBER_FLOOR = 1.1;
const SHEET_TOP = CHAMBER_FLOOR + CHAMBER_HEIGHT;

const TARGET = new THREE.Vector3(0, 2.8, 0);
const START_DIRECTION = new THREE.Vector3(0.35, 0.42, 1);
const INTRO_MS = 2400;
// The web draws this share of its particles on phones.
const DENSITY = 0.45;

interface ParticleClass {
  mass: (reading: Reading) => number;
  perUg: number;
  max: number;
  /** World-space diameter. */
  size: number;
  fall: number;
  jitter: number;
}

// Dots per µg/m³ shrink with particle size: the same mass of fine dust is far more particles than of coarse.
const PARTICLE_CLASSES: ParticleClass[] = [
  { mass: (r) => r.pm1_0, perUg: 400, max: 24000, size: 0.06, fall: 0, jitter: 0.045 },
  { mass: (r) => Math.max(0, r.pm2_5 - r.pm1_0), perUg: 160, max: 10000, size: 0.09, fall: -0.025, jitter: 0.02 },
  // Coarse particles settle visibly, as they do in still air.
  { mass: (r) => Math.max(0, r.pm10 - r.pm2_5), perUg: 90, max: 4000, size: 0.14, fall: -0.11, jitter: 0 },
];

interface ParticleLayer {
  cls: ParticleClass;
  material: THREE.ShaderMaterial;
  max: number;
  count: number;
  target: number;
}

function circlePoints(radius: number, segments: number, y = 0): THREE.Vector3[] {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * TAU;
    return new THREE.Vector3(Math.sin(angle) * radius, y, -Math.cos(angle) * radius);
  });
}

/** The most recent occurrence of a minute-of-day slot within the last 24 hours. */
function slotTime(slot: number): { time: Date; day: string } {
  const now = new Date();
  const time = new Date(now);
  time.setHours(0, slot, 0, 0);
  if (slot <= minuteOfDay(now)) return { time, day: tr().scene.today };
  time.setDate(time.getDate() - 1);
  return { time, day: tr().scene.yesterday };
}

/**
 * The original view: a particle chamber inside a 24-hour clock of minute readings. On the web it
 * predates the shared Stage and runs its own renderer; here it sits on Stage like the other views.
 */
export class ChamberScene {
  readonly stage: Stage;
  private readonly onHover: SceneHost['onHover'];
  private readonly root: THREE.Group;

  private readonly haze = new THREE.Color(BG);
  private readonly hazeTarget = new THREE.Color(BG);
  private readonly fog = new THREE.FogExp2(BG, 0.012);
  private fogTarget = 0.012;

  private readonly beamColor = new THREE.Color(BANDS[0].color);
  private readonly beamTarget = new THREE.Color(BANDS[0].color);
  private readonly beam = new THREE.Group();
  private readonly glowMaterials: THREE.MeshBasicMaterial[] = [];

  // Uniform objects shared by every particle layer, so one write updates them all.
  private readonly shared = {
    uTime: { value: 0 },
    uScale: { value: 1 },
    uPixelRatio: { value: 1 },
    uFogDensity: { value: 0.012 },
    uNowDir: { value: new THREE.Vector2(0, -1) },
    uGlintColor: { value: this.beamColor },
  };
  private readonly layers: ParticleLayer[] = [];

  private readonly bars: THREE.InstancedMesh;
  private readonly slots: (Reading | null)[] = new Array<Reading | null>(MINUTES).fill(null);
  private readonly heights = new Float32Array(MINUTES).fill(STUB);
  private readonly targets = new Float32Array(MINUTES).fill(STUB);
  private readonly hitTargets: THREE.Mesh[] = [];
  private readonly hitBand: THREE.Mesh;
  private readonly hourLabels: { label: Label; direction: THREE.Vector3 }[] = [];

  private readonly dummy = new THREE.Object3D();
  private readonly offset = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly stubColor = new THREE.Color('#131b26');
  private readonly bandColors = new Map<string, THREE.Color>();

  private latestSlot = -1;
  private hoverSlot = -1;
  private minuteStamp = -1;
  private time = 0;
  private introStart = -1;

  constructor(host: SceneHost) {
    this.stage = new Stage(host, {
      direction: START_DIRECTION,
      fov: 32,
      bloom: { strength: 0.85, radius: 0.5, threshold: 0.8 },
      autoRotate: 0.35,
      polar: [0.2, 1.45],
      zoom: [0.45, 1.8],
      intro: { extra: 0.55, ms: 3200 },
    });
    this.onHover = host.onHover;
    this.root = this.stage.root;
    this.stage.scene.background = this.haze;
    this.stage.scene.fog = this.fog;

    this.buildFloor();
    this.bars = this.buildBars();
    this.hitBand = this.buildHitTargets();
    this.buildGuideline();
    this.buildHourLabels();
    this.buildBeam();
    this.buildParticles();

    const chamberTop = circlePoints(CHAMBER_RADIUS, 24, SHEET_TOP + 0.8);
    this.stage.onResize((width, height) => {
      // Portrait screens are too narrow for the hour labels; let those crop rather than shrink everything.
      const points = width / height < 1
        ? [...chamberTop, ...circlePoints(RING_RADIUS + 0.4, 48)]
        : [...circlePoints(LABEL_RADIUS + 0.6, 48), ...chamberTop];
      this.stage.setFrame(TARGET, points);

      const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.stage.camera.fov / 2));
      this.shared.uScale.value = height / (2 * tanHalf);
      this.shared.uPixelRatio.value = this.stage.pixelRatio;
    });
    this.stage.onFrame(this.frame);
    this.stage.onTap(this.handleTap, this.clearHover);
    this.tickMinute();
  }

  setReadings(readings: readonly Reading[]): void {
    this.slots.fill(null);
    const cutoff = Date.now() - DAY_MS;
    let latest: Reading | null = null;
    let latestTime = -Infinity;

    for (const reading of readings) {
      const time = Date.parse(reading.createdAt);
      if (time <= cutoff) continue;
      const slot = minuteOfDay(new Date(time));
      const existing = this.slots[slot];
      if (!existing || Date.parse(existing.createdAt) < time) this.slots[slot] = reading;
      if (time > latestTime) {
        latest = reading;
        latestTime = time;
      }
    }

    for (let i = 0; i < MINUTES; i++) {
      const reading = this.slots[i];
      this.targets[i] = reading ? Math.max(STUB, Math.min(reading.pm2_5, MAX_BAR_UG) * UNITS_PER_UG) : STUB;
    }
    this.latestSlot = latest ? minuteOfDay(new Date(latestTime)) : -1;
    if (latest && this.introStart < 0) this.introStart = performance.now();

    this.setAtmosphere(latest);
    this.paintBars();
    this.updateHitBand();
  }

  // ── Construction ────────────────────────────────────────────────────────

  private buildFloor(): void {
    const grid = new THREE.PolarGridHelper(RING_RADIUS + 2.6, 24, 5, 120, 0x22324a, 0x101823);
    const gridMaterial = grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.6;
    gridMaterial.depthWrite = false;
    this.root.add(grid);

    // Top and bottom rims of the sampling chamber.
    for (const y of [CHAMBER_FLOOR, SHEET_TOP]) {
      const rim = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(circlePoints(CHAMBER_RADIUS, 160)),
        new THREE.LineBasicMaterial({ color: 0x2a3b55, transparent: true, opacity: 0.45 }),
      );
      rim.position.y = y;
      this.root.add(rim);
    }
  }

  private buildBars(): THREE.InstancedMesh {
    const geometry = new THREE.BoxGeometry(BAR_WIDTH, 1, BAR_DEPTH);
    geometry.translate(0, 0.5, 0);
    // Dark at the base and bright at the tip, so the ring reads as light rising off the floor
    // rather than a flat ribbon. Bars scale in y, so every bar gets the full gradient.
    const position = geometry.getAttribute('position');
    const shade = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) shade.fill(0.22 + 0.78 * position.getY(i), i * 3, i * 3 + 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(shade, 3));

    const bars = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }), MINUTES);
    // Instance heights change every frame while growing, so static bounds would cull wrongly.
    bars.frustumCulled = false;
    for (let i = 0; i < MINUTES; i++) {
      this.writeBar(bars, i);
      bars.setColorAt(i, this.stubColor);
    }
    this.root.add(bars);
    return bars;
  }

  // Invisible meshes to raycast against: hitting thin bars directly would need pixel-perfect aim.
  private buildHitTargets(): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

    const floor = new THREE.Mesh(new THREE.RingGeometry(RING_RADIUS - 0.7, RING_RADIUS + 0.7, 180), material);
    floor.rotation.x = -Math.PI / 2;
    floor.visible = false;

    const bandGeometry = new THREE.CylinderGeometry(RING_RADIUS, RING_RADIUS, 1, 180, 1, true);
    bandGeometry.translate(0, 0.5, 0);
    const band = new THREE.Mesh(bandGeometry, material);
    band.visible = false;

    this.root.add(floor, band);
    this.hitTargets.push(floor, band);
    return band;
  }

  private buildGuideline(): void {
    const halo = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(circlePoints(RING_RADIUS, 360)),
      new THREE.LineDashedMaterial({ color: 0xd6e6ff, dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.6 }),
    );
    halo.computeLineDistances();
    halo.position.y = WHO_GUIDELINE_24H * UNITS_PER_UG;
    this.root.add(halo);
  }

  private buildHourLabels(): void {
    for (let hour = 0; hour < 24; hour += 3) {
      const angle = (hour / 24) * TAU;
      const direction = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
      const tag = label(String(hour).padStart(2, '0'));
      tag.position.copy(direction).multiplyScalar(LABEL_RADIUS);
      this.root.add(tag);
      this.hourLabels.push({ label: tag, direction });
    }
  }

  // Labels always draw on top of the GL view, so ones on the far side of the ring fade back instead.
  private fadeHourLabels(): void {
    this.offset.copy(this.stage.camera.position).sub(TARGET).setY(0).normalize();
    for (const entry of this.hourLabels) {
      const facing = (entry.direction.dot(this.offset) + 1) / 2;
      entry.label.opacity = Math.round((0.2 + 0.8 * facing) * 20) / 20;
    }
  }

  // The laser sheet fans out from the chamber's axis to the ring and always points at the current minute.
  private buildBeam(): void {
    const sheetGeometry = new THREE.PlaneGeometry(RING_RADIUS, SHEET_TOP);
    sheetGeometry.translate(RING_RADIUS / 2, SHEET_TOP / 2, 0);
    const sheetMaterial = new THREE.ShaderMaterial({
      vertexShader: sheetVertex,
      fragmentShader: sheetFragment,
      uniforms: { uColor: { value: this.beamColor }, uTime: this.shared.uTime, uOpacity: { value: 0.15 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const emitterMaterial = new THREE.MeshBasicMaterial();
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, SHEET_TOP, 8), emitterMaterial);
    emitter.position.y = SHEET_TOP / 2;

    const needleMaterial = new THREE.MeshBasicMaterial();
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, SHEET_TOP, 0.03), needleMaterial);
    needle.position.set(RING_RADIUS, SHEET_TOP / 2, 0);
    this.glowMaterials.push(emitterMaterial, needleMaterial);

    const nowLabel = label(tr().scene.now, 'now');
    nowLabel.position.set(RING_RADIUS, SHEET_TOP + 0.45, 0);
    const guideLabel = label(tr().scene.whoUnits(formatValue(WHO_GUIDELINE_24H)), 'guide');
    guideLabel.position.set(RING_RADIUS, WHO_GUIDELINE_24H * UNITS_PER_UG, 0);

    this.beam.add(new THREE.Mesh(sheetGeometry, sheetMaterial), emitter, needle, nowLabel, guideLabel);
    this.root.add(this.beam);
  }

  private buildParticles(): void {
    for (const cls of PARTICLE_CLASSES) {
      const max = Math.round(cls.max * DENSITY);
      const position = new Float32Array(max * 3);
      const seed = new Float32Array(max * 4);
      const index = new Float32Array(max);
      for (let i = 0; i < max; i++) {
        position[i * 3] = CHAMBER_RADIUS * Math.sqrt(Math.random());
        position[i * 3 + 1] = Math.random() * TAU;
        position[i * 3 + 2] = Math.random() * CHAMBER_HEIGHT;
        for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
        index[i] = i;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      geometry.setAttribute('aIndex', new THREE.BufferAttribute(index, 1));

      const material = new THREE.ShaderMaterial({
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        uniforms: {
          ...this.shared,
          uCount: { value: 0 },
          uSize: { value: cls.size },
          uHeight: { value: CHAMBER_HEIGHT },
          uRadius: { value: CHAMBER_RADIUS },
          uFall: { value: cls.fall },
          uJitter: { value: cls.jitter },
          uSheetWidth: { value: 0.18 },
          uDust: { value: new THREE.Color('#9db2cc') },
          uDustAlpha: { value: 0.85 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geometry, material);
      points.position.y = CHAMBER_FLOOR;
      // Real positions only exist in the shader.
      points.frustumCulled = false;
      this.root.add(points);
      this.layers.push({ cls, material, max, count: 0, target: 0 });
    }
  }

  // ── Per-frame ──────────────────────────────────────────────────────────

  private readonly frame = (dt: number) => {
    this.time += dt * (this.stage.reducedMotion ? 0.3 : 1);
    this.shared.uTime.value = this.time;

    this.tickMinute();
    this.updateBars(dt, performance.now());
    this.updateAtmosphere(dt);
    this.fadeHourLabels();
  };

  private tickMinute(): void {
    const stamp = Math.floor(Date.now() / 60_000);
    if (stamp === this.minuteStamp) return;
    this.minuteStamp = stamp;

    const angle = ((minuteOfDay(new Date()) + 0.5) / MINUTES) * TAU;
    this.beam.rotation.y = Math.PI / 2 - angle;
    this.shared.uNowDir.value.set(Math.sin(angle), -Math.cos(angle));

    // Minutes that slide out of the 24-hour window leave the ring.
    const cutoff = Date.now() - DAY_MS;
    for (let i = 0; i < MINUTES; i++) {
      const reading = this.slots[i];
      if (reading && Date.parse(reading.createdAt) <= cutoff) {
        this.slots[i] = null;
        this.targets[i] = STUB;
      }
    }
    this.paintBars();
    this.updateHitBand();
  }

  private updateBars(dt: number, now: number): void {
    const { reducedMotion } = this.stage;
    // Before data arrives every bar stays a stub; once it does, bars rise oldest-first around the clock.
    const reveal = this.introStart < 0 ? 0 : reducedMotion ? 1 : Math.min((now - this.introStart) / INTRO_MS, 1);
    const nowMinute = minuteOfDay(new Date());
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
    let changed = false;

    for (let i = 0; i < MINUTES; i++) {
      let target = this.targets[i];
      if (reveal < 1) {
        const recency = 1 - ((nowMinute - i + MINUTES) % MINUTES) / MINUTES;
        const mask = THREE.MathUtils.clamp((reveal * 1.25 - recency) / 0.25, 0, 1);
        target = STUB + (target - STUB) * mask;
      }
      const height = this.heights[i];
      if (height === target) continue;
      this.heights[i] = Math.abs(target - height) < 0.002 ? target : height + (target - height) * k;
      this.writeBar(this.bars, i);
      changed = true;
    }
    if (changed) this.bars.instanceMatrix.needsUpdate = true;
  }

  private updateAtmosphere(dt: number): void {
    const k = 1 - Math.exp(-dt * 1.4);
    for (const layer of this.layers) {
      layer.count += (layer.target - layer.count) * k;
      layer.material.uniforms.uCount.value = layer.count;
    }
    this.beamColor.lerp(this.beamTarget, k);
    for (const material of this.glowMaterials) material.color.copy(this.beamColor).multiplyScalar(1.6);

    this.fog.density += (this.fogTarget - this.fog.density) * k;
    this.shared.uFogDensity.value = this.fog.density;
    this.haze.lerp(this.hazeTarget, k);
    this.fog.color.copy(this.haze);
  }

  // ── State ──────────────────────────────────────────────────────────────

  private setAtmosphere(latest: Reading | null): void {
    for (const layer of this.layers) {
      const wanted = latest ? layer.cls.mass(latest) * layer.cls.perUg * DENSITY : 0;
      layer.target = Math.min(layer.max, wanted);
    }
    const pm25 = latest?.pm2_5 ?? 0;
    this.beamTarget.copy(this.bandColor(bandFor(pm25).color));

    // Dirtier air thickens the haze between the camera and the ring.
    const smog = Math.min(pm25, 150) / 150;
    this.fogTarget = 0.011 + smog * 0.035;
    this.hazeTarget.set(BG).lerp(new THREE.Color(SMOG), smog);
  }

  private writeBar(bars: THREE.InstancedMesh, i: number): void {
    const angle = ((i + 0.5) / MINUTES) * TAU;
    this.dummy.position.set(Math.sin(angle) * RING_RADIUS, 0, -Math.cos(angle) * RING_RADIUS);
    this.dummy.rotation.set(0, -angle, 0);
    this.dummy.scale.set(1, this.heights[i], 1);
    this.dummy.updateMatrix();
    bars.setMatrixAt(i, this.dummy.matrix);
  }

  private paintBars(): void {
    for (let i = 0; i < MINUTES; i++) this.paintBar(i);
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
  }

  private paintBar(i: number): void {
    const reading = this.slots[i];
    if (i === this.hoverSlot) {
      this.color.setRGB(1.5, 1.5, 1.5);
    } else if (!reading) {
      this.color.copy(this.stubColor);
    } else {
      this.color.copy(this.bandColor(bandFor(reading.pm2_5).color));
      // Older minutes dim, so the seam between "now" and 24 hours ago reads at a glance.
      const ageMinutes = (Date.now() - Date.parse(reading.createdAt)) / 60_000;
      const fade = 0.3 + 0.7 * (1 - THREE.MathUtils.clamp(ageMinutes / MINUTES, 0, 1));
      this.color.multiplyScalar(i === this.latestSlot ? 2.6 : fade);
    }
    this.bars.setColorAt(i, this.color);
  }

  private bandColor(hex: string): THREE.Color {
    let color = this.bandColors.get(hex);
    if (!color) {
      color = new THREE.Color(hex);
      this.bandColors.set(hex, color);
    }
    return color;
  }

  private updateHitBand(): void {
    let tallest = STUB;
    for (let i = 0; i < MINUTES; i++) tallest = Math.max(tallest, this.targets[i]);
    this.hitBand.scale.y = tallest + 0.6;
  }

  // ── Interaction ────────────────────────────────────────────────────────

  private readonly handleTap = (raycaster: THREE.Raycaster, x: number, y: number) => {
    // The hit cylinder is as tall as the tallest bar all the way round; only count a hit on it
    // where that minute's bar actually reaches, so a tap can land past the near side.
    let slot = -1;
    for (const hit of raycaster.intersectObjects(this.hitTargets, false)) {
      let angle = Math.atan2(hit.point.x, -hit.point.z);
      if (angle < 0) angle += TAU;
      const candidate = Math.min(MINUTES - 1, Math.floor((angle / TAU) * MINUTES));
      if (hit.object === this.hitBand && hit.point.y > this.heights[candidate] + 0.35) continue;
      slot = candidate;
      break;
    }
    if (slot < 0) {
      this.clearHover();
      return;
    }

    this.setHoverSlot(slot);
    const { time, day } = slotTime(slot);
    const reading = this.slots[slot];
    this.onHover({
      x,
      y,
      heading: `${day} · ${formatTime(time)}`,
      pm25: reading?.pm2_5 ?? null,
      caption: tr().scene.minuteAverage,
      details: reading
        ? [`PM1.0 ${reading.pm1_0} · PM10 ${reading.pm10}`, ...temperatureLines(reading.temperature_c)]
        : [tr().scene.noMinute],
    });
  };

  private readonly clearHover = () => {
    this.setHoverSlot(-1);
    this.onHover(null);
  };

  private setHoverSlot(slot: number): void {
    if (slot === this.hoverSlot) return;
    const previous = this.hoverSlot;
    this.hoverSlot = slot;
    if (previous >= 0) this.paintBar(previous);
    if (slot >= 0) this.paintBar(slot);
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
  }
}

export const createClock: CreateView = (host) => {
  const scene = new ChamberScene(host);
  return {
    setData: (data) => scene.setReadings(data.readings),
    input: scene.stage,
    dispose: () => scene.stage.dispose(),
  };
};
