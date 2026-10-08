import * as THREE from 'three';

import { bandFor } from '../../bands';
import { breathCounts, lungDamage, MAX_DOTS, meanPm25, particlesPerDot } from '../../breath';
import { tr } from '../../i18n';
import { APEX_Y, buildLungs, TRACHEA_TOP_Y } from '../lungs';
import { label, Stage } from '../stage';
import type { CreateView } from '../types';

// A resting breath every 5 s: in for 2, out for 3. Damaged lungs hold less air, so breathing
// grows quicker and shallower.
const BREATH_S = 5;
const LABOURED_BREATH_S = 2.8;
const INHALE = 0.4;
// How far the lungs swell on a breath in; the diaphragm draws them mostly downwards.
const SWELL = new THREE.Vector3(0.035, 0.06, 0.035);
const LABOURED_SWELL = 0.35;
// At the worst levels a double cough every few seconds.
const COUGH_S = 9;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

// The lungs are drawn as if every day were like the last 24 hours, so their state follows the
// 24-hour mean and eases over a few seconds rather than flickering with each minute's reading.
// 0 is healthy, 1 the worst; see lungDamage for the scale.
const damageUniforms = /* glsl */ `
  uniform float uDamage;
  uniform float uTime;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  // Pitting where the air sacs' walls break down, as in emphysema: how much of the tissue is lost,
  // and the pattern it is cut from.
  float pitting() { return smoothstep(0.6, 1.0, uDamage) * 0.4; }
  float pitAt(vec3 p) { return noise(p * 14.0); }

  // Soot: carbon swallowed by the lungs' scavenger cells collects in dark flecks, then blotches.
  float sootAt(vec3 p) {
    float grime = 0.6 * noise(p * 2.5) + 0.4 * noise(p * 11.0);
    // Front-loaded, so the first flecks show at the first band above the guideline.
    float threshold = 1.0 - 0.6 * pow(uDamage, 0.6);
    return smoothstep(threshold, threshold + 0.06, grime);
  }
`;

// The air coming in is drawn as a band of light, in the reading's colour, running down the
// airways on each breath in and back up, fainter, on each breath out. Every material shares it.
const waveUniforms = /* glsl */ `
  uniform vec3 uGlint;
  uniform float uWave;
  uniform float uWaveWidth;
  uniform float uWaveStrength;
  float waveAt(float y) {
    float d = (y - uWave) / uWaveWidth;
    return exp(-d * d) * uWaveStrength;
  }
`;

const particleVertex = /* glsl */ `
  uniform float uCount;
  uniform float uScale;
  uniform float uPixelRatio;
  // Fractions of all particles ≥0.3 µm that are also ≥0.5, ≥1, ≥2.5 and ≥5 µm, then ≥10 µm.
  uniform vec4 uShares;
  uniform float uShare10;
  attribute vec4 aSeed;
  attribute float aIndex;
  attribute vec3 aAirway;
  varying float vAlpha;
  varying float vGlint;
  ${waveUniforms}
  ${damageUniforms}

  void main() {
    // Each particle draws one size class, so the dot sizes follow the sensor's size counts.
    // Sizes are enlarged a long way; only the count is to scale.
    float size = 0.036;
    if (aSeed.w < uShares.x) size = 0.048;
    if (aSeed.w < uShares.y) size = 0.065;
    if (aSeed.w < uShares.z) size = 0.09;
    if (aSeed.w < uShares.w) size = 0.12;
    if (aSeed.w < uShare10) size = 0.16;

    // Particles of 2.5 µm and up mostly lodge in the airways; finer ones reach deep into the lungs.
    float coarse = step(aSeed.w, uShares.z);
    vec3 home = mix(position, aAirway, coarse);

    float t = uTime;
    // Lodged particles barely move; the rest wander with the air and jitter, the smallest most.
    vec3 drift = mix(0.16, 0.02, coarse) * vec3(sin(t * 0.21 + aSeed.x * 6.283), sin(t * 0.17 + aSeed.y * 6.283), cos(t * 0.19 + aSeed.z * 6.283));
    vec3 jitter = vec3(sin(t * 5.3 + aSeed.x * 83.0), sin(t * 4.7 + aSeed.y * 71.0), sin(t * 6.1 + aSeed.z * 67.0)) * (0.0025 / size);
    vec3 p = home + drift + jitter;

    vGlint = waveAt(p.y);
    vAlpha = clamp(uCount - aIndex, 0.0, 1.0);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * (1.0 + vGlint) * uPixelRatio * uScale / -mv.z;
  }
`;

const particleFragment = /* glsl */ `
  uniform vec3 uDust;
  uniform vec3 uGlint;
  varying float vAlpha;
  varying float vGlint;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, d) * vAlpha;
    if (a < 0.01) discard;
    // HDR glint (>1) so only particles the wave is passing reach the bloom threshold.
    gl_FragColor = vec4(uDust * 0.6 + uGlint * vGlint * 3.0, a);
  }
`;

const shellVertex = /* glsl */ `
  uniform float uRings;
  uniform float uDamage;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPosition;

  void main() {
    vPosition = position;
    // Inflamed airway walls swell and thicken.
    vec3 p = position + normal * uRings * 0.07 * smoothstep(0.2, 0.8, uDamage);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalMatrix * normal;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const shellFragment = /* glsl */ `
  uniform vec3 uTint;
  uniform float uRings;
  // Fissure planes as (normal, distance); a zero normal means none. The second only exists in
  // front of the first, as the right lung's horizontal fissure stops at the oblique one.
  uniform vec4 uFissureA;
  uniform vec4 uFissureB;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPosition;
  ${waveUniforms}
  ${damageUniforms}

  float seam(vec4 plane) {
    if (dot(plane.xyz, plane.xyz) == 0.0) return 0.0;
    float d = dot(plane.xyz, vPosition) - plane.w;
    return 1.0 - smoothstep(0.0, fwidth(d) * 1.5 + 0.02, abs(d));
  }

  void main() {
    float vY = vPosition.y;
    float tissue = 1.0 - uRings;

    // The holes' edges catch the light.
    float lost = tissue * pitting();
    float pit = pitAt(vPosition);
    if (pit < lost) discard;
    float pitEdge = lost > 0.0 ? 1.0 - smoothstep(lost, lost + 0.05, pit) : 0.0;

    float fissures = seam(uFissureA);
    if (dot(uFissureA.xyz, vPosition) > uFissureA.w) fissures = max(fissures, seam(uFissureB));

    // Brightest where the surface turns edge-on, like an X-ray of a hollow shell, so the
    // outline reads from any side without hiding the particles inside.
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    // The cartilage rings that hold the windpipe open, about one every centimetre.
    float ring = uRings * smoothstep(0.55, 0.95, sin(vY * 22.0));

    // Inflamed airways redden and throb.
    float inflamed = uRings * smoothstep(0.15, 0.7, uDamage) * (0.8 + 0.2 * sin(uTime * 2.4));
    vec3 tint = mix(uTint, vec3(1.0, 0.32, 0.26), inflamed);
    vec3 colour = tint * (0.04 + 0.55 * rim + 0.2 * ring + 0.3 * fissures + 0.5 * pitEdge);

    float soot = tissue * sootAt(vPosition);
    colour *= 1.0 - 0.8 * soot;

    gl_FragColor = vec4(colour + uGlint * waveAt(vY) * (0.15 + rim) * (1.0 - 0.7 * soot), 1.0);
  }
`;

// Additive light can't darken anything, so the soot is a second, normally blended skin over the
// lungs' near faces, drawn after the particles so it hides the glow behind it.
const sootVertex = /* glsl */ `
  varying vec3 vPosition;

  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sootFragment = /* glsl */ `
  varying vec3 vPosition;
  ${damageUniforms}

  void main() {
    if (pitAt(vPosition) < pitting()) discard;
    float soot = sootAt(vPosition);
    if (soot < 0.01) discard;
    gl_FragColor = vec4(0.05, 0.04, 0.035, soot * 0.8);
  }
`;

const branchVertex = /* glsl */ `
  uniform float uDamage;
  attribute float aGeneration;
  varying float vY;
  varying float vFade;

  void main() {
    vY = position.y;
    // Finer branches fade, so the tree reads as depth rather than a tangle. The smallest airways
    // are the first to narrow and close, so damage prunes the tree from its tips inwards.
    float lost = smoothstep(0.25, 1.0, uDamage) * smoothstep(9.0 - 5.0 * uDamage, 10.0 - 5.0 * uDamage, aGeneration);
    vFade = pow(0.8, aGeneration - 2.0) * (1.0 - lost);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const branchFragment = /* glsl */ `
  uniform vec3 uTint;
  varying float vY;
  varying float vFade;
  ${waveUniforms}

  void main() {
    gl_FragColor = vec4((uTint * 0.5 + uGlint * waveAt(vY) * 1.2) * vFade, 1.0);
  }
`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

export const createBreath: CreateView = (host) => {
  const stage = new Stage(host, {
    direction: new THREE.Vector3(0.12, 0.14, 1),
    bloom: { strength: 0.8, radius: 0.45, threshold: 0.8 },
    sway: 0.35,
  });
  const max = MAX_DOTS;
  const lungs = buildLungs();

  const glint = new THREE.Color(bandFor(0).color);
  const wave = {
    uGlint: { value: glint },
    uWave: { value: 100 },
    uWaveWidth: { value: 0.24 },
    uWaveStrength: { value: 0 },
  };
  // Healthy tissue is a clean blue; damaged tissue dulls towards a dirty grey-brown.
  const healthy = new THREE.Color('#7fa6d6');
  const dulled = new THREE.Color('#8f8073');
  const tint = { value: healthy.clone() };
  const damage = { uDamage: { value: 0 }, uTime: { value: 0 } };

  // The breathing group's origin is at the top of the lungs, so a breath in swells them downwards.
  const breathing = new THREE.Group();
  breathing.position.y = APEX_Y;
  const body = new THREE.Group();
  body.position.y = -APEX_Y;
  breathing.add(body);
  stage.root.add(breathing);

  const none = new THREE.Vector4();
  const shell = (rings: number, [a, b]: (THREE.Vector4 | null)[] = []) => new THREE.ShaderMaterial({
    uniforms: { ...wave, ...damage, uTint: tint, uRings: { value: rings }, uFissureA: { value: a ?? none }, uFissureB: { value: b ?? none } },
    vertexShader: shellVertex,
    fragmentShader: shellFragment,
    side: THREE.DoubleSide,
    ...additive,
  });
  for (const surface of lungs.surfaces) body.add(new THREE.Mesh(surface.geometry, shell(0, surface.fissures)));
  const sootMaterial = new THREE.ShaderMaterial({
    uniforms: damage,
    vertexShader: sootVertex,
    fragmentShader: sootFragment,
    transparent: true,
    depthWrite: false,
  });
  for (const surface of lungs.surfaces) {
    const soot = new THREE.Mesh(surface.geometry, sootMaterial);
    soot.renderOrder = 1;
    body.add(soot);
  }
  const airwayShell = shell(1);
  for (const geometry of lungs.tubes) body.add(new THREE.Mesh(geometry, airwayShell));

  const branchPositions: number[] = [];
  const generations: number[] = [];
  for (const branch of lungs.branches) {
    branchPositions.push(...branch.start.toArray(), ...branch.end.toArray());
    generations.push(branch.generation, branch.generation);
  }
  const branchGeometry = new THREE.BufferGeometry();
  branchGeometry.setAttribute('position', new THREE.Float32BufferAttribute(branchPositions, 3));
  branchGeometry.setAttribute('aGeneration', new THREE.Float32BufferAttribute(generations, 1));
  body.add(new THREE.LineSegments(branchGeometry, new THREE.ShaderMaterial({
    uniforms: { ...wave, ...damage, uTint: tint },
    vertexShader: branchVertex,
    fragmentShader: branchFragment,
    ...additive,
  })));

  const seed = new Float32Array(max * 4);
  const index = new Float32Array(max);
  for (let i = 0; i < max; i++) {
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
    index[i] = i;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(lungs.sampleDeep(max), 3));
  geometry.setAttribute('aAirway', new THREE.BufferAttribute(lungs.sampleAirways(max), 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geometry.setAttribute('aIndex', new THREE.BufferAttribute(index, 1));

  const uniforms = {
    ...wave,
    ...damage,
    uCount: { value: 0 },
    uScale: { value: 1 },
    uPixelRatio: { value: 1 },
    uShares: { value: new THREE.Vector4() },
    uShare10: { value: 0 },
    uDust: { value: new THREE.Color('#9db2cc') },
  };
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    ...additive,
  }));
  // Real positions only exist in the shader.
  points.frustumCulled = false;
  body.add(points);

  stage.onResize((_, height) => {
    uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
    uniforms.uPixelRatio.value = stage.pixelRatio;
  });

  const bounds = new THREE.Box3();
  for (const { geometry } of lungs.surfaces) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(geometry.boundingBox);
  }
  const base = bounds.min.y;

  const caption = label(tr().scene.notToScale);
  caption.position.set(0, base - 1, bounds.max.z);
  stage.root.add(caption);

  // Fitted to the lungs at full stretch, so a breath in never pushes them off screen.
  const lowest = base - SWELL.y * (APEX_Y - base) - 1.1;
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [lowest, TRACHEA_TOP_Y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
  }
  stage.setFrame(new THREE.Vector3(0, (lowest + TRACHEA_TOP_Y) / 2, 0), corners);

  // The wave starts above the trachea and ends below the lungs, so it fades in and out unseen.
  const waveTop = TRACHEA_TOP_Y + 1;
  const waveBottom = base - 1;
  let target = 0;
  let damageTarget = 0;
  // Accumulated rather than taken from the clock, so a change of breathing rate doesn't jump the phase.
  let phase = 0;
  stage.onFrame((dt, t) => {
    const clock = stage.reducedMotion ? t * 0.2 : t;
    const step = stage.reducedMotion ? dt * 0.2 : dt;
    damage.uTime.value = clock;
    uniforms.uCount.value += (target - uniforms.uCount.value) * (1 - Math.exp(-dt * 2.5));
    const d = (damage.uDamage.value += (damageTarget - damage.uDamage.value) * (1 - Math.exp(-dt * 0.8)));
    tint.value.lerpColors(healthy, dulled, d);

    phase = (phase + step / THREE.MathUtils.lerp(BREATH_S, LABOURED_BREATH_S, d)) % 1;
    const breathingIn = phase < INHALE;
    const progress = easeInOut(breathingIn ? phase / INHALE : (phase - INHALE) / (1 - INHALE));
    const inflation = (breathingIn ? progress : 1 - progress) * (1 - (1 - LABOURED_SWELL) * d);

    // Two sharp contractions, a quarter of a second apart.
    const coughing = stage.reducedMotion ? 0 : THREE.MathUtils.smoothstep(d, 0.8, 0.95);
    const c = clock % COUGH_S;
    const cough = coughing * (Math.exp(-(((c - 0.15) / 0.06) ** 2)) + 0.7 * Math.exp(-(((c - 0.4) / 0.06) ** 2)));
    const squeeze = 1 - 0.035 * cough;
    breathing.scale.set(
      (1 + SWELL.x * inflation) * squeeze,
      (1 + SWELL.y * inflation) * squeeze,
      (1 + SWELL.z * inflation) * squeeze,
    );
    wave.uWave.value = breathingIn
      ? THREE.MathUtils.lerp(waveTop, waveBottom, progress)
      : THREE.MathUtils.lerp(waveBottom, waveTop, progress);
    wave.uWaveStrength.value = breathingIn ? 1 : 0.35;
  });

  let lastLatest: unknown = undefined;
  return {
    setData({ readings }) {
      const latest = readings.at(-1) ?? null;
      if (latest === lastLatest) return;
      lastLatest = latest;

      const mean = meanPm25(readings);
      damageTarget = mean === null ? 0 : lungDamage(mean);

      const counts = breathCounts(latest);
      if (counts) {
        target = counts.total / particlesPerDot(counts.total);
        const [s05, s1, s25, s5, s10] = counts.shares;
        uniforms.uShares.value.set(s05, s1, s25, s5);
        uniforms.uShare10.value = s10;
      } else {
        target = 0;
      }
      // Every material holds this same colour, so setting it once recolours them all.
      glint.set(bandFor(latest?.pm2_5 ?? 0).color);
    },
    input: stage,
    dispose: () => stage.dispose(),
  };
};
