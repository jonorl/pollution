import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// A head-and-shoulders bust for the breath view, in the same units and frame as lungs.ts, so the
// lungs sit in its chest unchanged. Moulded from code like the lungs, so there is no model to
// download. It is cut off at the waist.

/** The bottom of the bust. */
export const HIP_Y = -8.5;
/** Bottom and top of the neck, which runs from inside the torso up into the head. */
export const NECK_SPAN = [6.4, 9.6] as const;
const NECK_Z = -0.3;
/** The highest point of the head, for framing. */
export const HEAD_TOP_Y = 13.7;

const HEAD_CENTRE = new THREE.Vector3(0, 11, 0.4);
const HEAD_RADII = new THREE.Vector3(1.9, 2.7, 2.35);

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};
const bump = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
  Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));

// The face is left almost blank, like a museum's glass anatomical figure: just a soft brow,
// nose and chin, enough for the profile to read as a person from the side.
function face(x: number, y: number): number {
  const brow = 0.04 * bump(x, y, 0, 0.25, 0.45, 0.1);
  const noseWidth = 0.1 + 0.06 * smoothstep(0.2, -0.2, y);
  const nose = 0.22 * smoothstep(0.24, -0.16, y) * (1 - smoothstep(-0.16, -0.28, y)) * Math.exp(-((x / noseWidth) ** 2));
  const chin = 0.06 * bump(x, y, 0, -0.66, 0.28, 0.14);
  return brow + nose + chin;
}

// From the unit sphere to the head: an egg-shaped skull, fuller at the back and narrowing to
// the jaw, tucked in at the nape, with the face added.
function mouldHead(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const jaw = 1 - 0.3 * smoothstep(0.1, -0.9, y);
  const back = z < 0 ? (1 + 0.12 * smoothstep(-0.6, 0.4, y)) * (1 - 0.25 * smoothstep(-0.3, -0.9, y)) : 1;
  const relief = face(x, y) * smoothstep(0.3, 0.75, z);
  return out.set(
    HEAD_CENTRE.x + x * jaw * HEAD_RADII.x,
    HEAD_CENTRE.y + y * HEAD_RADII.y,
    HEAD_CENTRE.z + (z * back + relief) * HEAD_RADII.z,
  );
}

const onHead = (y: number, forward: number) => mouldHead(0, y, Math.sqrt(1 - y * y), new THREE.Vector3()).add(new THREE.Vector3(0, 0, forward));

/** Where air goes in, just under the nose. */
export const NOSTRILS = onHead(-0.3, 0.1);
/** The back of the throat, where the nose and mouth meet. */
export const PHARYNX = new THREE.Vector3(0, 9.9, -0.3);

function headGeometry(): THREE.BufferGeometry {
  const sphere = new THREE.SphereGeometry(1, 128, 96);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere);
  sphere.dispose();
  const position = geometry.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    mouldHead(position.getX(i), position.getY(i), position.getZ(i), v);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Radius against height, swept round and flattened front to back: waist, ribcage, the shoulders'
// caps and the slope of the trapezius up to the neck.
const TORSO_PROFILE = [
  [4.4, HIP_Y], [4.35, -7], [4.6, -5], [5.0, -2.5], [5.15, 0], [5.15, 2.5], [5.3, 4.2],
  [5.75, 5.3], [5.55, 6.0], [4.5, 6.6], [2.9, 7.0], [1.3, 7.3],
];
const TORSO_DEPTH = 0.6;
const TORSO_Z = -0.2;

function torsoGeometry(): THREE.BufferGeometry {
  const curve = new THREE.SplineCurve(TORSO_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
  const geometry = new THREE.LatheGeometry(curve.getPoints(72), 72);
  geometry.scale(1, 1, TORSO_DEPTH);
  geometry.translate(0, 0, TORSO_Z);
  geometry.computeVertexNormals();
  return geometry;
}

function armGeometry(side: 1 | -1): THREE.BufferGeometry {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 5.0, 5.5, -0.3),
    new THREE.Vector3(side * 6.0, 3.6, -0.3),
    new THREE.Vector3(side * 6.5, -2, -0.4),
    new THREE.Vector3(side * 6.4, HIP_Y + 0.2, 0.6),
  ]);
  return new THREE.TubeGeometry(path, 64, 0.95, 20, false);
}

export interface Figure {
  torso: THREE.BufferGeometry;
  arms: THREE.BufferGeometry[];
  neck: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  /** Corners of a box around the bust, standing upright. */
  bounds: THREE.Box3;
}

export function buildFigure(): Figure {
  const neck = new THREE.CylinderGeometry(1.0, 1.3, NECK_SPAN[1] - NECK_SPAN[0], 32, 8, true);
  neck.translate(0, (NECK_SPAN[0] + NECK_SPAN[1]) / 2, NECK_Z);
  return {
    torso: torsoGeometry(),
    arms: [armGeometry(-1), armGeometry(1)],
    neck,
    head: headGeometry(),
    bounds: new THREE.Box3(new THREE.Vector3(-7.5, HIP_Y, -3.6), new THREE.Vector3(7.5, HEAD_TOP_Y, 3.6)),
  };
}
