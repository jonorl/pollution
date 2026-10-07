import * as THREE from 'three';

import type { Bin } from '../../api';
import { bandFor, WHO_GUIDELINE_24H } from '../../bands';
import { dayKey, formatNumber, formatShortDay, formatTime, formatValue, minuteOfDay, startOfDay, temperatureLines } from '../../format';
import { tr } from '../../i18n';
import { callout, clearGroup, floorPlane, guidelineSheet, label, lineSegments, marker, Stage } from '../stage';
import type { CreateView } from '../types';

// Time of day runs along x (one unit per hour), days along z (today at the front, z = 0).
const W = 24;
const DZ = 1.2;
const K = 0.07;
const MAX_UG = 110;
const BIN_MINUTES = 5;
const COLS = 1440 / BIN_MINUTES;
const MAX_DAYS = 14;

const xAt = (col: number) => (col / (COLS - 1) - 0.5) * W;
const yAt = (value: number) => Math.min(value, MAX_UG) * K;

interface Grid {
  /** Oldest first, today last. */
  days: Date[];
  /** rows × COLS, NaN where nothing was recorded. */
  pm25: Float32Array;
  pm1: Float32Array;
  pm10: Float32Array;
  temp: Float32Array;
}

function buildGrid(bins: readonly Bin[]): Grid {
  const today = startOfDay(new Date());
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - (MAX_DAYS - 1));
  // Always include yesterday, so the terrain has two rows to span even on the first day.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  let first = yesterday.getTime();
  for (const bin of bins) first = Math.min(first, startOfDay(new Date(bin.t)).getTime());

  const days: Date[] = [];
  for (const day = new Date(Math.max(first, earliest.getTime())); day <= today; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day));
  }
  const rowOf = new Map(days.map((day, row) => [dayKey(day), row]));
  const size = days.length * COLS;
  const grid: Grid = {
    days,
    pm25: new Float32Array(size).fill(NaN),
    pm1: new Float32Array(size).fill(NaN),
    pm10: new Float32Array(size).fill(NaN),
    temp: new Float32Array(size).fill(NaN),
  };
  for (const bin of bins) {
    const time = new Date(bin.t);
    const row = rowOf.get(dayKey(time));
    if (row === undefined) continue;
    const i = row * COLS + Math.floor(minuteOfDay(time) / BIN_MINUTES);
    grid.pm25[i] = bin.pm25;
    grid.pm1[i] = bin.pm1;
    grid.pm10[i] = bin.pm10;
    grid.temp[i] = bin.temp ?? NaN;
  }
  return grid;
}

export const createLandscape: CreateView = (host) => {
  const { onHover } = host;
  const stage = new Stage(host, { direction: new THREE.Vector3(0.45, 0.95, 1), fog: true, sway: 0.22 });
  const content = new THREE.Group();
  const pointer = marker();
  stage.root.add(content, pointer);

  // Today's row is at z = 0, so the "now" line only ever moves along x.
  const nowGroup = new THREE.Group();
  nowGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.05), new THREE.Vector3(0, 3.4, 0.05)]),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  ));
  const nowTag = label(tr().scene.now, 'strong');
  nowTag.position.set(0, 3.8, 0.05);
  nowGroup.add(nowTag);
  stage.root.add(nowGroup);

  let minuteStamp = -1;
  stage.onFrame(() => {
    const stamp = Math.floor(Date.now() / 60_000);
    if (stamp === minuteStamp) return;
    minuteStamp = stamp;
    nowGroup.position.x = xAt(minuteOfDay(new Date()) / BIN_MINUTES);
  });

  let grid: Grid | null = null;
  let terrain: THREE.Mesh | null = null;

  function build(bins: readonly Bin[]): void {
    clearGroup(content);
    const g = buildGrid(bins);
    grid = g;
    const rows = g.days.length;
    const depth = (rows - 1) * DZ;
    const zAt = (row: number) => (row - (rows - 1)) * DZ;

    const positions: number[] = [];
    const colors: number[] = [];
    const index: number[] = [];
    const color = new THREE.Color();
    const missing = new THREE.Color('#121b28');
    let peak = -Infinity;
    let peakAt = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const value = g.pm25[r * COLS + c];
        const known = !Number.isNaN(value);
        positions.push(xAt(c), known ? yAt(value) : 0, zAt(r));
        if (known) color.set(bandFor(value).color);
        else color.copy(missing);
        colors.push(color.r, color.g, color.b);
        if (known && value > peak) {
          peak = value;
          peakAt = r * COLS + c;
        }
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const a = r * COLS + c;
        index.push(a, a + COLS, a + 1, a + 1, a + COLS, a + COLS + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    terrain = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    content.add(terrain);

    // One line per day traces the actual readings, so rows stay legible across the surface between them.
    const dayLine = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    const todayLine = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    for (let r = 0; r < rows; r++) {
      let run: THREE.Vector3[] = [];
      const flush = () => {
        if (run.length > 1) content.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(run), r === rows - 1 ? todayLine : dayLine));
        run = [];
      };
      for (let c = 0; c < COLS; c++) {
        const value = g.pm25[r * COLS + c];
        if (Number.isNaN(value)) flush();
        else run.push(new THREE.Vector3(xAt(c), yAt(value) + 0.025, zAt(r)));
      }
      flush();
    }

    content.add(floorPlane(W + 1.4, depth + 1.4, -depth / 2));
    const grid3h: number[] = [];
    const labelEvery = stage.compact ? 6 : 3;
    for (let hour = 0; hour <= 24; hour += 3) {
      const x = (hour / 24 - 0.5) * W;
      grid3h.push(x, 0, 0.7, x, 0, -depth - 0.7);
      if (hour % labelEvery !== 0) continue;
      const tick = label(`${String(hour).padStart(2, '0')}:00`);
      tick.position.set(x, 0, 1.3);
      content.add(tick);
    }
    content.add(lineSegments(grid3h, 0.6));

    g.days.forEach((day, r) => {
      const ago = rows - 1 - r;
      let text = '';
      if (ago === 0) text = tr().scene.today;
      // On narrow screens adjacent rows sit too close to label both Today and Yesterday.
      else if (ago === 1) text = stage.compact ? '' : tr().scene.yesterday;
      else if (stage.compact ? ago % 4 === 0 : rows <= 7 || ago % 2 === 0) text = formatShortDay(day);
      if (!text) return;
      const tag = label(text, ago === 0 ? 'strong' : 'plain');
      tag.position.set(-W / 2 - 1.9, 0, zAt(r));
      content.add(tag);
    });

    const sheetY = yAt(WHO_GUIDELINE_24H);
    content.add(guidelineSheet(W + 1.4, depth + 1.4, sheetY, -depth / 2));
    const whoTag = label(tr().scene.who(formatValue(WHO_GUIDELINE_24H)), 'who');
    whoTag.position.set(W / 2 + 1.5, sheetY, -depth / 2);
    content.add(whoTag);

    let top = sheetY + 0.5;
    if (peakAt >= 0) {
      const row = Math.floor(peakAt / COLS);
      const col = peakAt % COLS;
      content.add(callout(tr().scene.highest(formatNumber(peak)), xAt(col), yAt(peak), zAt(row)));
      top = Math.max(top, yAt(peak) + 1.6);
    }

    stage.setFrame(new THREE.Vector3(0, Math.min(top, 4) * 0.35, -depth / 2), [
      new THREE.Vector3(-W / 2 - 3.2, 0, 1.6),
      new THREE.Vector3(W / 2 + 2.4, 0, 1.6),
      new THREE.Vector3(-W / 2 - 3.2, 0, -depth - 0.7),
      new THREE.Vector3(W / 2 + 2.4, 0, -depth - 0.7),
      new THREE.Vector3(-W / 2, top, 0),
      new THREE.Vector3(W / 2, top, 0),
      new THREE.Vector3(-W / 2, top, -depth),
      new THREE.Vector3(W / 2, top, -depth),
    ]);
  }

  const leave = () => {
    pointer.visible = false;
    onHover(null);
  };

  stage.onTap((raycaster, x, y) => {
    const hit = terrain ? raycaster.intersectObject(terrain, false)[0] : undefined;
    if (!hit || !grid) {
      leave();
      return;
    }
    const rows = grid.days.length;
    const col = THREE.MathUtils.clamp(Math.round((hit.point.x / W + 0.5) * (COLS - 1)), 0, COLS - 1);
    const row = THREE.MathUtils.clamp(Math.round(hit.point.z / DZ + rows - 1), 0, rows - 1);
    const i = row * COLS + col;
    const pm25 = grid.pm25[i];
    const known = !Number.isNaN(pm25);

    pointer.position.set(xAt(col), 0, (row - (rows - 1)) * DZ);
    pointer.scale.y = (known ? yAt(pm25) : 0) + 0.8;
    pointer.visible = true;

    const start = new Date(grid.days[row]);
    start.setMinutes(col * BIN_MINUTES);
    const end = new Date(start.getTime() + BIN_MINUTES * 60_000);
    onHover({
      x,
      y,
      heading: `${formatShortDay(start)} · ${formatTime(start)}–${formatTime(end)}`,
      pm25: known ? pm25 : null,
      caption: tr().scene.fiveMinuteMean,
      details: known
        ? [`PM1.0 ${formatNumber(grid.pm1[i], 1)} · PM10 ${formatNumber(grid.pm10[i], 1)}`, ...temperatureLines(grid.temp[i])]
        : [tr().scene.noFiveMinutes],
    });
  }, leave);

  // Draw the empty grid straight away, so the view has its shape before the data arrives.
  build([]);
  let lastBins: readonly Bin[] | null = null;
  return {
    setData({ bins }) {
      if (!bins || bins === lastBins) return;
      lastBins = bins;
      build(bins);
    },
    input: stage,
    dispose: () => stage.dispose(),
  };
};
