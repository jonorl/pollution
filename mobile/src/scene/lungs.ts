import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// A stylised pair of lungs and airways for the breath view, moulded from code so there is no
// model to download. The front of the body faces +z; the person's right lung is on the viewer's
// left, as in any anatomy diagram. One scene unit is roughly 3.5 cm.

/** Where the lungs stop at the top; the breathing group expands downwards from here. */
export const APEX_Y = 4.2;
export const TRACHEA_TOP_Y = 5.9;

const CARINA = new THREE.Vector3(0, 2.3, -0.35);
const TRACHEA_RADIUS = 0.3;
const BRONCHUS_RADIUS = 0.2;

interface LungShape {
  /** Centre of the unit ball the lung is moulded from. */
  centre: THREE.Vector3;
  /** Which way the inner (medial) face points along x. */
  medial: 1 | -1;
  /** Outer half-width; the inner side is a fraction of it, as the heart and airways take that room. */
  width: number;
  medialWidth: number;
  height: number;
  depth: number;
  /** The left lung's cardiac notch, the hollow the heart sits in. */
  notch: boolean;
  /** Where the main bronchus enters. */
  hilum: THREE.Vector3;
  /** Points the main bronchus passes through from the carina to the hilum. */
  bronchus: THREE.Vector3[];
  /** Height at which the oblique fissure, between the upper and lower lobes, crosses the middle. */
  obliqueY: number;
  /** The right lung's horizontal fissure, which splits off its middle lobe. */
  horizontalY: number | null;
}

// The right lung is shorter (the liver sits under it) and wider; the left one is narrower and notched.
const LUNGS: LungShape[] = [
  {
    centre: new THREE.Vector3(-1.42, 0.2, 0),
    medial: 1,
    width: 1.95,
    medialWidth: 0.55,
    height: 4.0,
    depth: 2.2,
    notch: false,
    hilum: new THREE.Vector3(-0.8, 1.25, -0.3),
    // Steeper and shorter than the left, which is why inhaled objects usually end up on the right.
    bronchus: [new THREE.Vector3(-0.4, 1.8, -0.33)],
    // Set so the horizontal fissure meets the oblique one about halfway back, as it does.
    obliqueY: 0.6,
    horizontalY: 1.2,
  },
  {
    centre: new THREE.Vector3(1.56, 0, 0),
    medial: -1,
    width: 1.85,
    medialWidth: 0.55,
    height: 4.2,
    depth: 2.2,
    notch: true,
    hilum: new THREE.Vector3(1.05, 1.4, -0.3),
    bronchus: [new THREE.Vector3(0.55, 2.0, -0.33)],
    obliqueY: 0.5,
    horizontalY: null,
  },
];

const TAPER_X = 0.3;
const TAPER_Z = 0.12;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

// In the unit ball's coordinates, before moulding. The bases rest on the diaphragm's dome, so
// they are hollow underneath, and lowest at the outer edge.
const domeY = (x: number, z: number) => -0.42 - 0.38 * ((x - 0.2) ** 2 + z * z);

// Deepest at the front, but carved all the way back so it shows in the outline from the front.
const notchDepth = (shape: LungShape, y: number, z: number) =>
  shape.notch ? 0.6 * Math.exp(-(((y + 0.25) / 0.32) ** 2)) * (0.55 + 0.45 * smoothstep(-0.5, 0.6, z)) : 0;

// Every step changes one coordinate using only ones already settled, so `inside` can undo it.
function mould(shape: LungShape, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const yc = Math.max(y, domeY(x, z));
  const across = x >= 0
    ? x * shape.medialWidth * (1 - notchDepth(shape, yc, z))
    : x * (1 - TAPER_X * yc);
  return out.set(
    shape.centre.x + shape.medial * across * shape.width,
    shape.centre.y + yc * shape.height,
    shape.centre.z + z * shape.depth * (1 - TAPER_Z * yc),
  );
}

/** Whether `p` is inside the lung; a `margin` below 1 keeps clear of the surface. */
function inside(shape: LungShape, p: THREE.Vector3, margin = 1): boolean {
  const y = (p.y - shape.centre.y) / shape.height;
  if (y <= -1 || y >= 1) return false;
  const z = (p.z - shape.centre.z) / (shape.depth * (1 - TAPER_Z * y));
  const across = (shape.medial * (p.x - shape.centre.x)) / shape.width;
  const x = across >= 0
    ? across / (shape.medialWidth * (1 - notchDepth(shape, y, z)))
    : across / (1 - TAPER_X * y);
  return x * x + y * y + z * z <= margin * margin && y >= domeY(x, z) + (1 - margin) * 0.5;
}

function lungGeometry(shape: LungShape): THREE.BufferGeometry {
  const sphere = new THREE.SphereGeometry(1, 96, 64);
  // Merging the sphere's seam and pole vertices keeps the rim shading free of a visible seam.
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere);
  sphere.dispose();

  const position = geometry.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    mould(shape, position.getX(i), position.getY(i), position.getZ(i), v);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Deterministic, so the airway tree has the same shape on every visit. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInside(shape: LungShape, random: () => number, margin: number, out: THREE.Vector3): THREE.Vector3 {
  const reach = shape.width * 1.4;
  for (;;) {
    out.set(
      shape.centre.x + (random() * 2 - 1) * reach,
      shape.centre.y + (random() * 2 - 1) * shape.height,
      shape.centre.z + (random() * 2 - 1) * shape.depth * 1.15,
    );
    if (inside(shape, out, margin)) return out;
  }
}

export interface Branch {
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** 0 for the trachea, 1 for the main bronchi, then one more at every fork. */
  generation: number;
}

const TREE_POINTS = 1800;
const TWIG_POINTS = 6;
const REACH = 0.45;

function centroid(points: readonly THREE.Vector3[]): THREE.Vector3 {
  const c = new THREE.Vector3();
  for (const p of points) c.add(p);
  return c.divideScalar(points.length);
}

/** Splits a cloud into two equal halves across its longest spread. */
function halve(points: THREE.Vector3[]): [THREE.Vector3[], THREE.Vector3[]] {
  const c = centroid(points);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of points) {
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  // Power iteration for the covariance's principal axis.
  const axis = new THREE.Vector3(0.3, 1, 0.2).normalize();
  const next = new THREE.Vector3();
  for (let i = 0; i < 16; i++) {
    next.set(
      xx * axis.x + xy * axis.y + xz * axis.z,
      xy * axis.x + yy * axis.y + yz * axis.z,
      xz * axis.x + yz * axis.y + zz * axis.z,
    );
    if (next.lengthSq() === 0) break;
    axis.copy(next).normalize();
  }
  const sorted = points
    .map((p) => ({ p, along: axis.dot(p) }))
    .sort((a, b) => a.along - b.along)
    .map(({ p }) => p);
  const middle = sorted.length >> 1;
  return [sorted.slice(0, middle), sorted.slice(middle)];
}

/**
 * Grows an airway tree that fills a lung, after Kitaoka's method: each branch heads part of the
 * way towards the middle of the region it supplies, then the region is halved between its two
 * children, until the regions are too small to split.
 */
function growTree(start: THREE.Vector3, points: THREE.Vector3[], generation: number, out: Branch[]): void {
  if (points.length < TWIG_POINTS) return;
  for (const half of halve(points)) {
    const end = start.clone().lerp(centroid(half), REACH);
    out.push({ start, end, generation });
    growTree(end, half, generation + 1, out);
  }
}

// The oblique fissure runs from high at the back to low at the front.
const OBLIQUE_NORMAL = new THREE.Vector3(0, 1, 1.3).normalize();

export interface LungSurface {
  geometry: THREE.BufferGeometry;
  /** Fissure planes as (normal, distance from the origin); the second only on the right lung. */
  fissures: [THREE.Vector4, THREE.Vector4 | null];
}

function lungSurface(shape: LungShape): LungSurface {
  const plane = (normal: THREE.Vector3, y: number) =>
    new THREE.Vector4(normal.x, normal.y, normal.z, normal.dot(new THREE.Vector3(shape.centre.x, y, shape.centre.z)));
  return {
    geometry: lungGeometry(shape),
    fissures: [
      plane(OBLIQUE_NORMAL, shape.obliqueY),
      shape.horizontalY === null ? null : plane(new THREE.Vector3(0, 1, 0), shape.horizontalY),
    ],
  };
}

export interface Lungs {
  surfaces: LungSurface[];
  /** The trachea and main bronchi, drawn as hollow tubes. */
  tubes: THREE.BufferGeometry[];
  /** The rest of the airway tree, drawn as lines. */
  branches: Branch[];
  /** `count` points spread evenly through both lungs. */
  sampleDeep(count: number): Float32Array;
  /** `count` points inside the larger airways, where coarse particles lodge. */
  sampleAirways(count: number): Float32Array;
}

export function buildLungs(): Lungs {
  const random = seeded(20261006);
  const tracheaTop = new THREE.Vector3(0, TRACHEA_TOP_Y, CARINA.z);

  const tubes = [
    new THREE.TubeGeometry(new THREE.LineCurve3(tracheaTop, CARINA), 24, TRACHEA_RADIUS, 20, false),
  ];
  // Airways where particles can lodge, with the radius they have room in.
  const airways: { start: THREE.Vector3; end: THREE.Vector3; radius: number }[] = [
    { start: tracheaTop, end: CARINA, radius: TRACHEA_RADIUS * 0.7 },
  ];
  const branches: Branch[] = [];

  for (const shape of LUNGS) {
    const path = [CARINA, ...shape.bronchus, shape.hilum];
    tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 24, BRONCHUS_RADIUS, 16, false));
    for (let i = 1; i < path.length; i++) {
      airways.push({ start: path[i - 1], end: path[i], radius: BRONCHUS_RADIUS * 0.7 });
    }

    const cloud = Array.from({ length: TREE_POINTS }, () => randomInside(shape, random, 0.9, new THREE.Vector3()));
    const tree: Branch[] = [];
    growTree(shape.hilum, cloud, 2, tree);
    branches.push(...tree);
    for (const branch of tree) {
      if (branch.generation <= 4) airways.push({ start: branch.start, end: branch.end, radius: 0.06 });
    }
  }

  const lengths = airways.map((a) => a.start.distanceTo(a.end));
  const total = lengths.reduce((sum, length) => sum + length, 0);

  return {
    surfaces: LUNGS.map(lungSurface),
    tubes,
    branches,

    sampleDeep(count) {
      const out = new Float32Array(count * 3);
      const p = new THREE.Vector3();
      // Each lung gets particles in proportion to its size, roughly its bounding volume.
      const sizes = LUNGS.map((s) => s.width * s.height * s.depth);
      const share = sizes[0] / (sizes[0] + sizes[1]);
      for (let i = 0; i < count; i++) {
        const shape = Math.random() < share ? LUNGS[0] : LUNGS[1];
        randomInside(shape, Math.random, 0.92, p).toArray(out, i * 3);
      }
      return out;
    },

    sampleAirways(count) {
      const out = new Float32Array(count * 3);
      const p = new THREE.Vector3();
      const offset = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        // Spread by length, so every stretch of airway gets its share.
        let pick = Math.random() * total;
        let k = 0;
        while (k < airways.length - 1 && pick > lengths[k]) pick -= lengths[k++];
        const airway = airways[k];
        p.lerpVectors(airway.start, airway.end, Math.random());
        offset.randomDirection().multiplyScalar(airway.radius * Math.sqrt(Math.random()));
        p.add(offset).toArray(out, i * 3);
      }
      return out;
    },
  };
}
