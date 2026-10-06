import * as THREE from 'three';

import type { DailyMean } from '../../api';
import { bandFor, WHO_GUIDELINE_24H } from '../../bands';
import { dayKey, formatDay, formatMonth, formatNumber, formatValue, formatWeekday, startOfDay, temperatureLines } from '../../format';
import { tr } from '../../i18n';
import { callout, clearGroup, floorPlane, guidelineSheet, label, Stage } from '../stage';
import type { CreateView } from '../types';

// Weeks run along x (this week on the right), weekdays along z (Monday at the back).
const WEEKS = 26;
const S = 1.08;
const K = 0.085;
const MAX_UG = 110;
const MINUTES_PER_DAY = 1440;
const STUB = 0.03;

const xAt = (week: number) => (week - (WEEKS - 1) / 2) * S;
const zAt = (weekday: number) => (weekday - 3) * S;
const heightOf = (value: number) => Math.max(0.05, Math.min(value, MAX_UG) * K);

interface Cell {
  date: Date;
  week: number;
  weekday: number;
  entry: DailyMean | null;
}

function buildCells(daily: readonly DailyMean[]): Cell[] {
  const today = startOfDay(new Date());
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = new Date(monday);
  start.setDate(start.getDate() - (WEEKS - 1) * 7);
  const byDay = new Map(daily.map((entry) => [entry.day, entry]));

  const cells: Cell[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    if (date > today) break;
    cells.push({ date, week: Math.floor(i / 7), weekday: i % 7, entry: byDay.get(dayKey(date)) ?? null });
  }
  return cells;
}

function towers(cells: Cell[], material: THREE.Material, height: (cell: Cell) => number, colour: (cell: Cell) => THREE.Color): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(0.86, 1, 0.86);
  geometry.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(cells.length, 1));
  mesh.count = cells.length;
  const matrix = new THREE.Matrix4();
  cells.forEach((cell, i) => {
    matrix.makeScale(1, height(cell), 1).setPosition(xAt(cell.week), 0, zAt(cell.weekday));
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, colour(cell));
  });
  return mesh;
}

export const createCalendar: CreateView = (container, onHover) => {
  const stage = new Stage(container, { direction: new THREE.Vector3(0.4, 0.78, 1), fog: true, sway: 0.25, fov: 30 });
  const content = new THREE.Group();
  stage.root.add(content);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  outline.visible = false;
  stage.root.add(outline);

  // Which cell each instance of each pickable mesh stands for.
  let pickable = new Map<THREE.Object3D, Cell[]>();

  function build(daily: readonly DailyMean[]): void {
    clearGroup(content);
    const cells = buildCells(daily);
    const colour = new THREE.Color();
    const bandColour = (cell: Cell) => colour.set(bandFor(cell.entry?.pm25 ?? 0).color);

    // A day with under half its minutes recorded is drawn faded: its mean rests on too little.
    const full = cells.filter((cell) => cell.entry && cell.entry.n >= MINUTES_PER_DAY / 2);
    const partial = cells.filter((cell) => cell.entry && cell.entry.n < MINUTES_PER_DAY / 2);
    const empty = cells.filter((cell) => !cell.entry);
    const height = (cell: Cell) => heightOf(cell.entry?.pm25 ?? 0);

    const meshes: [THREE.InstancedMesh, Cell[]][] = [
      [towers(full, new THREE.MeshLambertMaterial(), height, bandColour), full],
      [towers(partial, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.4, depthWrite: false }), height, bandColour), partial],
      [towers(empty, new THREE.MeshBasicMaterial(), () => STUB, () => colour.set('#141c27')), empty],
    ];
    pickable = new Map();
    for (const [mesh, list] of meshes) {
      content.add(mesh);
      pickable.set(mesh, list);
    }

    content.add(floorPlane(WEEKS * S + 1.2, 7 * S + 1.2));
    const sheetY = WHO_GUIDELINE_24H * K;
    content.add(guidelineSheet(WEEKS * S + 1.2, 7 * S + 1.2, sheetY));
    const whoTag = label(tr().scene.who(formatValue(WHO_GUIDELINE_24H)), 'scene-label scene-label--who');
    whoTag.position.set(xAt(WEEKS - 1) + 1.6, sheetY, 0);
    content.add(whoTag);

    const today = cells.at(-1);
    if (today) {
      const h = today.entry ? heightOf(today.entry.pm25) : STUB;
      const ring = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, h, 0.98).translate(0, h / 2, 0)),
        new THREE.LineBasicMaterial({ color: 0xffffff }),
      );
      ring.position.set(xAt(today.week), 0, zAt(today.weekday));
      content.add(ring);
      const tag = label(tr().scene.today, 'scene-label scene-label--strong');
      tag.position.set(xAt(today.week), h + 0.6, zAt(today.weekday));
      content.add(tag);
    }

    for (const cell of cells) {
      if (cell.weekday !== 0 || cell.date.getDate() > 7) continue;
      const month = label(formatMonth(cell.date));
      month.position.set(xAt(cell.week), 0, zAt(6) + 1.1);
      content.add(month);
    }
    // Weekday names come from the first column, which starts on a Monday.
    for (const weekday of [0, 2, 4, 6]) {
      const tick = label(formatWeekday(cells[weekday].date));
      tick.position.set(xAt(0) - 1.4, 0, zAt(weekday));
      content.add(tick);
    }

    let top = sheetY + 0.6;
    const recorded = cells.filter((cell) => cell.entry);
    if (recorded.length > 0) {
      const worst = recorded.reduce((a, b) => ((b.entry?.pm25 ?? 0) > (a.entry?.pm25 ?? 0) ? b : a));
      const h = heightOf(worst.entry?.pm25 ?? 0);
      content.add(callout(tr().scene.worstDay(formatNumber(worst.entry?.pm25 ?? 0)), xAt(worst.week), h, zAt(worst.weekday), 1.3));
      top = Math.max(top, h + 1.9);
    }

    const left = xAt(0) - 2.2;
    const right = xAt(WEEKS - 1) + 2.6;
    stage.setFrame(new THREE.Vector3(0, Math.min(top, 4) * 0.3, 0), [
      new THREE.Vector3(left, 0, zAt(6) + 1.6),
      new THREE.Vector3(right, 0, zAt(6) + 1.6),
      new THREE.Vector3(left, 0, zAt(0) - 0.8),
      new THREE.Vector3(right, 0, zAt(0) - 0.8),
      new THREE.Vector3(left, top, zAt(0)),
      new THREE.Vector3(right, top, zAt(0)),
    ]);
  }

  const leave = () => {
    outline.visible = false;
    onHover(null);
  };

  stage.onPointer((raycaster, event) => {
    const hit = raycaster.intersectObjects([...pickable.keys()], false)[0];
    const cell = hit?.instanceId !== undefined ? pickable.get(hit.object)?.[hit.instanceId] : undefined;
    if (!cell) {
      leave();
      return;
    }
    const h = cell.entry ? heightOf(cell.entry.pm25) : STUB;
    outline.position.set(xAt(cell.week), 0, zAt(cell.weekday));
    outline.scale.set(0.98, h, 0.98);
    outline.visible = true;

    const isToday = dayKey(cell.date) === dayKey(new Date());
    const entry = cell.entry;
    onHover({
      x: event.clientX,
      y: event.clientY,
      heading: `${formatDay(cell.date)}${isToday ? tr().scene.soFar : ''}`,
      pm25: entry ? entry.pm25 : null,
      caption: tr().scene.dailyMean,
      details: entry
        ? [
            tr().scene.minutesRecorded(formatNumber(entry.n), formatNumber(MINUTES_PER_DAY)),
            `PM1.0 ${formatNumber(entry.pm1, 1)} · PM10 ${formatNumber(entry.pm10, 1)}`,
            ...temperatureLines(entry.temp),
          ]
        : [tr().scene.noDay],
    });
  }, leave);

  build([]);
  let lastDaily: readonly DailyMean[] | null = null;
  return {
    setData({ daily }) {
      if (!daily || daily === lastDaily) return;
      lastDaily = daily;
      build(daily);
    },
    dispose: () => stage.dispose(),
  };
};
