import * as THREE from 'three';

import { bandFor } from '../../bands';
import { breathCounts, MAX_DOTS, particlesPerDot } from '../../breath';
import { tr } from '../../i18n';
import { label, Stage } from '../stage';
import type { CreateView } from '../types';

// An 8 cm cube holds 0.512 L, about one relaxed breath.
const HALF = 4;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uCount;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uHalf;
  uniform float uSheet;
  // Fractions of all particles ≥0.3 µm that are also ≥0.5, ≥1, ≥2.5 and ≥5 µm, then ≥10 µm.
  uniform vec4 uShares;
  uniform float uShare10;
  attribute vec4 aSeed;
  attribute float aIndex;
  varying float vAlpha;
  varying float vGlint;

  void main() {
    // Each particle draws one size class, so the dot sizes follow the sensor's size counts.
    // Sizes are enlarged a long way; only the count is to scale.
    float size = 0.036;
    if (aSeed.w < uShares.x) size = 0.048;
    if (aSeed.w < uShares.y) size = 0.065;
    if (aSeed.w < uShares.z) size = 0.09;
    if (aSeed.w < uShares.w) size = 0.12;
    if (aSeed.w < uShare10) size = 0.16;

    float t = uTime;
    // Gentle convection, settling that grows with size, and Brownian jitter strongest for the smallest.
    vec3 drift = vec3(0.5 * sin(t * 0.13 + aSeed.x * 6.283), -t * size * 0.6, 0.5 * cos(t * 0.11 + aSeed.y * 6.283));
    vec3 jitter = vec3(sin(t * 5.3 + aSeed.x * 83.0), sin(t * 4.7 + aSeed.y * 71.0), sin(t * 6.1 + aSeed.z * 67.0)) * (0.0025 / size);
    vec3 p = mod(position + drift + jitter + uHalf, 2.0 * uHalf) - uHalf;

    // The laser sheet is the plane x = 0, as drawn.
    vGlint = exp(-(p.x * p.x) / (uSheet * uSheet));
    vAlpha = clamp(uCount - aIndex, 0.0, 1.0);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * (1.0 + vGlint) * uPixelRatio * uScale / -mv.z;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uDust;
  uniform vec3 uGlint;
  varying float vAlpha;
  varying float vGlint;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, d) * vAlpha;
    if (a < 0.01) discard;
    // HDR glint (>1) so only particles in the sheet reach the bloom threshold.
    gl_FragColor = vec4(uDust * 0.6 + uGlint * vGlint * 3.0, a);
  }
`;

export const createBreath: CreateView = (container) => {
  const stage = new Stage(container, { direction: new THREE.Vector3(0.62, 0.42, 0.75), bloom: true, autoRotate: 0.35 });
  const max = stage.coarsePointer ? MAX_DOTS.coarse : MAX_DOTS.fine;

  const position = new Float32Array(max * 3);
  const seed = new Float32Array(max * 4);
  const index = new Float32Array(max);
  for (let i = 0; i < max; i++) {
    for (let k = 0; k < 3; k++) position[i * 3 + k] = (Math.random() * 2 - 1) * HALF;
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
    index[i] = i;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geometry.setAttribute('aIndex', new THREE.BufferAttribute(index, 1));

  const glint = new THREE.Color(bandFor(0).color);
  const uniforms = {
    uTime: { value: 0 },
    uCount: { value: 0 },
    uScale: { value: 1 },
    uPixelRatio: { value: 1 },
    uHalf: { value: HALF },
    uSheet: { value: 0.12 },
    uShares: { value: new THREE.Vector4() },
    uShare10: { value: 0 },
    uDust: { value: new THREE.Color('#9db2cc') },
    uGlint: { value: glint },
  };
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  // Real positions only exist in the shader.
  points.frustumCulled = false;
  stage.root.add(points);

  stage.onResize((_, height) => {
    uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
    uniforms.uPixelRatio.value = stage.renderer.getPixelRatio();
  });

  stage.root.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(HALF * 2, HALF * 2, HALF * 2)),
    new THREE.LineBasicMaterial({ color: 0x3a5070 }),
  ));
  const sheetMaterial = new THREE.MeshBasicMaterial({
    color: glint, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), sheetMaterial);
  sheet.rotation.y = Math.PI / 2;
  stage.root.add(sheet);
  const dims = label(tr().scene.cube);
  dims.position.set(0, -HALF - 0.7, HALF);
  stage.root.add(dims);

  const corners: THREE.Vector3[] = [];
  for (const x of [-HALF, HALF]) for (const y of [-HALF, HALF]) for (const z of [-HALF, HALF]) corners.push(new THREE.Vector3(x, y, z));
  // The cube is fitted from every side it might turn to, so auto-rotate never clips it.
  const radius = Math.hypot(HALF, HALF, HALF);
  for (const [x, z] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) corners.push(new THREE.Vector3(x, 0, z));
  corners.push(new THREE.Vector3(0, -HALF - 0.9, HALF));
  stage.setFrame(new THREE.Vector3(0, -0.3, 0), corners);

  let target = 0;
  stage.onFrame((dt, t) => {
    uniforms.uTime.value = stage.reducedMotion ? t * 0.2 : t;
    uniforms.uCount.value += (target - uniforms.uCount.value) * (1 - Math.exp(-dt * 2.5));
  });

  let lastLatest: unknown = undefined;
  return {
    setData({ readings }) {
      const latest = readings.at(-1) ?? null;
      if (latest === lastLatest) return;
      lastLatest = latest;

      const counts = breathCounts(latest);
      if (counts) {
        target = counts.total / particlesPerDot(counts.total, stage.coarsePointer);
        const [s05, s1, s25, s5, s10] = counts.shares;
        uniforms.uShares.value.set(s05, s1, s25, s5);
        uniforms.uShare10.value = s10;
      } else {
        target = 0;
      }
      glint.set(bandFor(latest?.pm2_5 ?? 0).color);
      // Materials copy a colour on creation, so the sheet needs telling separately.
      sheetMaterial.color.copy(glint);
    },
    dispose: () => stage.dispose(),
  };
};
