import * as THREE from 'three';

import type { Reading } from '../../api';
import { formatNumber, formatTime, temperatureLines } from '../../format';
import { tr } from '../../i18n';
import { SIZE_CLASSES } from '../../sizes';
import { callout, clearGroup, floorPlane, label, lineSegments, marker, Stage } from '../stage';
import type { CreateView } from '../types';

// The last 24 hours run along x (one unit per hour, now on the right), stacked by particle size.
const W = 24;
// Bands are scaled so the day's peak stands about this tall; a fixed scale left quiet days flat.
const PEAK_HEIGHT = 6;
const MAX_UG = 110;
const BINS = 288;
const BIN_MS = 5 * 60_000;
const DAY_MS = 86_400_000;
// Each band is a slab; narrower slabs on top leave a visible step at every boundary.
const DEPTHS = [2, 1.5, 1];

const xAt = (bin: number) => (bin / (BINS - 1) - 0.5) * W;

interface Series {
  start: number;
  known: boolean[];
  /** Mass in each size class per bin: PM1, PM1–2.5 and PM2.5–10. */
  layers: number[][];
  pm1: number[];
  pm25: number[];
  pm10: number[];
  /** Mean °C, NaN where no reading in the bin had one. */
  temp: number[];
}

function binReadings(readings: readonly Reading[], end: number): Series {
  const start = end - DAY_MS;
  const sums = [new Float64Array(BINS), new Float64Array(BINS), new Float64Array(BINS)];
  const counts = new Uint16Array(BINS);
  const tempSums = new Float64Array(BINS);
  const tempCounts = new Uint16Array(BINS);
  for (const reading of readings) {
    const i = Math.floor((Date.parse(reading.createdAt) - start) / BIN_MS);
    if (i < 0 || i >= BINS) continue;
    sums[0][i] += reading.pm1_0;
    sums[1][i] += reading.pm2_5;
    sums[2][i] += reading.pm10;
    counts[i]++;
    if (reading.temperature_c != null) {
      tempSums[i] += reading.temperature_c;
      tempCounts[i]++;
    }
  }

  const series: Series = { start, known: [], layers: [[], [], []], pm1: [], pm25: [], pm10: [], temp: [] };
  for (let i = 0; i < BINS; i++) {
    const n = counts[i];
    const pm1 = n ? sums[0][i] / n : 0;
    const pm25 = n ? sums[1][i] / n : 0;
    const pm10 = n ? sums[2][i] / n : 0;
    series.known.push(n > 0);
    series.pm1.push(pm1);
    series.pm25.push(pm25);
    series.pm10.push(pm10);
    series.temp.push(tempCounts[i] ? tempSums[i] / tempCounts[i] : NaN);
    series.layers[0].push(Math.max(0, pm1));
    series.layers[1].push(Math.max(0, pm25 - pm1));
    series.layers[2].push(Math.max(0, pm10 - pm25));
  }
  return series;
}

function niceTicks(max: number): number[] {
  const step = [5, 10, 20, 25, 50, 100].find((s) => max / s <= 5) ?? 100;
  const ticks: number[] = [];
  for (let value = step; value <= max + step * 0.25; value += step) ticks.push(value);
  return ticks;
}

function slab(values: number[], floor: Float64Array, depth: number, color: string, K: number): THREE.Mesh {
  const triangles: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => triangles.push(...a, ...b, ...c, ...a, ...c, ...d);
  const zf = depth / 2;
  const zb = -depth / 2;
  const lo = (i: number) => Math.min(floor[i], MAX_UG) * K;
  const hi = (i: number) => Math.min(floor[i] + values[i], MAX_UG) * K;

  for (let i = 0; i < BINS - 1; i++) {
    const x0 = xAt(i);
    const x1 = xAt(i + 1);
    quad([x0, lo(i), zf], [x1, lo(i + 1), zf], [x1, hi(i + 1), zf], [x0, hi(i), zf]);
    quad([x1, lo(i + 1), zb], [x0, lo(i), zb], [x0, hi(i), zb], [x1, hi(i + 1), zb]);
    quad([x0, hi(i), zf], [x1, hi(i + 1), zf], [x1, hi(i + 1), zb], [x0, hi(i), zb]);
  }
  for (const i of [0, BINS - 1]) {
    const x = xAt(i);
    quad([x, lo(i), zb], [x, lo(i), zf], [x, hi(i), zf], [x, hi(i), zb]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

export const createSizeMix: CreateView = (container, onHover) => {
  const stage = new Stage(container, { direction: new THREE.Vector3(-0.2, 0.36, 1), sway: 0.22, fov: 32 });
  const content = new THREE.Group();
  const pointer = marker();
  stage.root.add(content, pointer);

  let series: Series | null = null;
  let hitTarget: THREE.Mesh | null = null;
  let K = 0.1;

  function build(readings: readonly Reading[]): void {
    clearGroup(content);
    const s = binReadings(readings, Date.now());
    series = s;

    let peakAt = -1;
    for (let i = 0; i < BINS; i++) {
      if (s.known[i] && (peakAt < 0 || s.pm10[i] > s.pm10[peakAt])) peakAt = i;
    }
    const peak = peakAt >= 0 ? s.pm10[peakAt] : 0;
    const scaleTo = Math.min(Math.max(peak, 20), MAX_UG);
    K = PEAK_HEIGHT / scaleTo;
    const maxY = scaleTo * K;

    const floor = new Float64Array(BINS);
    s.layers.forEach((values, layer) => {
      content.add(slab(values, floor, DEPTHS[layer], SIZE_CLASSES[layer].color, K));
      for (let i = 0; i < BINS; i++) floor[i] += values[i];
    });

    content.add(floorPlane(W + 1.6, 3.4));
    const wall: number[] = [];
    for (const value of niceTicks(scaleTo)) {
      wall.push(-W / 2, value * K, -1.25, W / 2, value * K, -1.25);
      const tick = label(String(value));
      tick.position.set(-W / 2 - 0.8, value * K, -1.25);
      content.add(tick);
    }
    content.add(lineSegments(wall, 0.45));
    const unit = label('µg/m³');
    unit.position.set(-W / 2 - 0.8, maxY + 0.9, -1.25);
    content.add(unit);

    // Hour ticks every three hours, skipping any that would crowd the "now" tag.
    const end = s.start + DAY_MS;
    const tick = new Date(s.start);
    tick.setMinutes(0, 0, 0);
    for (tick.setHours(tick.getHours() + 1); tick.getTime() <= end - 45 * 60_000; tick.setHours(tick.getHours() + 1)) {
      if (tick.getHours() % (stage.compact ? 6 : 3) !== 0) continue;
      const tag = label(formatTime(tick));
      tag.position.set(((tick.getTime() - s.start) / DAY_MS - 0.5) * W, 0, 1.7);
      content.add(tag);
    }
    const nowTag = label(tr().scene.now, 'scene-label scene-label--strong');
    nowTag.position.set(W / 2, 0, 1.7);
    content.add(nowTag);

    if (peakAt >= 0) {
      const when = formatTime(s.start + peakAt * BIN_MS);
      content.add(callout(tr().scene.peakPm10(formatNumber(peak), when), xAt(peakAt), Math.min(peak, MAX_UG) * K, 0, 1.2));
    }

    // Invisible wall across the bands to aim the pointer at; the slabs themselves are thin targets.
    const hitGeometry = new THREE.PlaneGeometry(W, maxY + 1.5);
    hitGeometry.translate(0, (maxY + 1.5) / 2, 0);
    hitTarget = new THREE.Mesh(hitGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    hitTarget.visible = false;
    content.add(hitTarget);

    const top = maxY + 2.3;
    stage.setFrame(new THREE.Vector3(0, top * 0.38, 0), [
      new THREE.Vector3(-W / 2 - 1.8, 0, 2.2),
      new THREE.Vector3(W / 2 + 1, 0, 2.2),
      new THREE.Vector3(-W / 2 - 1.8, 0, -1.8),
      new THREE.Vector3(W / 2 + 1, 0, -1.8),
      new THREE.Vector3(-W / 2 - 1.8, top, -1.25),
      new THREE.Vector3(W / 2 + 1, top, -1.25),
    ]);
  }

  const leave = () => {
    pointer.visible = false;
    onHover(null);
  };

  stage.onPointer((raycaster, event) => {
    const hit = hitTarget ? raycaster.intersectObject(hitTarget, false)[0] : undefined;
    if (!hit || !series) {
      leave();
      return;
    }
    const i = THREE.MathUtils.clamp(Math.round((hit.point.x / W + 0.5) * (BINS - 1)), 0, BINS - 1);
    const s = series;
    pointer.position.set(xAt(i), 0, 1.05);
    pointer.scale.y = Math.min(s.pm10[i], MAX_UG) * K + 0.6;
    pointer.visible = true;

    const start = s.start + i * BIN_MS;
    const [fine, mid, coarse] = s.layers.map((values) => values[i]);
    const finePart = s.pm10[i] > 0 ? Math.round((s.pm25[i] / s.pm10[i]) * 100) : 0;
    onHover({
      x: event.clientX,
      y: event.clientY,
      heading: `${formatTime(start)}–${formatTime(start + BIN_MS)}`,
      pm25: s.known[i] ? s.pm25[i] : null,
      caption: tr().scene.fiveMinuteMean,
      details: s.known[i]
        ? [
            `PM1 ${formatNumber(fine, 1)} · PM1–2.5 ${formatNumber(mid, 1)} · PM2.5–10 ${formatNumber(coarse, 1)}`,
            tr().scene.finePart(formatNumber(finePart)),
            ...temperatureLines(s.temp[i]),
          ]
        : [tr().scene.noFiveMinutes],
    });
  }, leave);

  let lastReadings: readonly Reading[] | null = null;
  let builtAt = 0;
  // New data rebuilds the bands; without any, still slide the 24-hour window every 5 minutes.
  stage.onFrame(() => {
    if (lastReadings && Date.now() - builtAt > BIN_MS) {
      builtAt = Date.now();
      build(lastReadings);
    }
  });

  return {
    setData({ readings }) {
      if (readings === lastReadings) return;
      lastReadings = readings;
      builtAt = Date.now();
      build(readings);
    },
    dispose: () => stage.dispose(),
  };
};
