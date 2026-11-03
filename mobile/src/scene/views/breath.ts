import * as THREE from 'three';

import { bandFor } from '../../bands';
import {
  breathCounts, DEPOSITION, depositedPerBreath, depositedPerDay, lungDamage, MAX_DOTS, meanPm25, particlesPerDot,
  particlesPerSpeck,
} from '../../breath';
import { formatCount } from '../../format';
import { tr } from '../../i18n';
import { buildFigure, HIP_Y, NECK_SPAN, NOSTRILS, PHARYNX } from '../figure';
import { Label } from '../labels';
import { APEX_Y, buildLungs, CARINA, TRACHEA_TOP_Y } from '../lungs';
import { label, Stage } from '../stage';
import type { CreateView } from '../types';

// A resting breath every 5 s: in for 2, out for 3. Damaged lungs hold less air, so breathing
// grows quicker and shallower.
const BREATH_S = 5;
const QUICKEST_BREATH_S = 3.2;
const INHALE = 0.4;
// How far the lungs swell on a breath in; the diaphragm draws them mostly downwards.
const SWELL = new THREE.Vector3(0.035, 0.06, 0.035);
const SHALLOWEST = 0.5;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

// The breath's worth of air the spores hang in, in front of the face.
const AIR_CENTRE = new THREE.Vector3(0, 10.2, 7);
const AIR_RADII = new THREE.Vector3(4.4, 3.3, 2.9);

function sampleAir(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    do p.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    while (p.lengthSq() > 1);
    p.multiply(AIR_RADII).add(AIR_CENTRE).toArray(out, i * 3);
  }
  return out;
}

// The lungs are drawn as if every day were like the last 24 hours, so their state follows the
// 24-hour mean and eases over a few seconds rather than flickering with each minute's reading.
// 0 is healthy, 1 the worst; see lungDamage for the scale. Exposure shows only in colour and
// opacity; nothing changes shape.
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

  // Soot: carbon swallowed by the lungs' scavenger cells collects in dark flecks, then blotches.
  float sootAt(vec3 p) {
    float grime = 0.6 * noise(p * 2.5) + 0.4 * noise(p * 11.0);
    // Front-loaded, so the first flecks show at the first band above the guideline.
    float threshold = 1.0 - 0.5 * pow(uDamage, 0.6);
    return smoothstep(threshold, threshold + 0.08, grime);
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

// Size classes shared by the spores and the settled specks, so both follow the sensor's counts.
const sizeClasses = /* glsl */ `
  // Fractions of all particles ≥0.3 µm that are also ≥0.5, ≥1, ≥2.5 and ≥5 µm, then ≥10 µm.
  uniform vec4 uShares;
  uniform float uShare10;
  float sizeClass(float pick) {
    float size = 1.0;
    if (pick < uShares.x) size = 1.35;
    if (pick < uShares.y) size = 1.8;
    if (pick < uShares.z) size = 2.4;
    if (pick < uShares.w) size = 3.3;
    if (pick < uShare10) size = 4.4;
    return size;
  }
`;

// Spores hang in a cloud of air in front of the face. Each breath in draws them in a stream
// through the nose, down the windpipe and into the lungs; each breath out carries most of them
// back. Those that settle fade out at the end of the breath into the specks already there, and
// new ones fade in to the air.
const sporeVertex = /* glsl */ `
  uniform float uCount;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uTime;
  // The lungs' frame, as they swell.
  uniform mat4 uLungFrame;
  // Waypoints in from the air, in world space.
  uniform vec3 uEntry;
  uniform vec3 uPharynx;
  uniform vec3 uLarynx;
  uniform vec3 uCarina;
  uniform float uCarinaY;
  uniform float uInhaling;
  // How far through the current breath in or out, 0 to 1.
  uniform float uProgress;
  // Shares that settle, fine then coarse.
  uniform vec2 uDeposition;
  attribute vec3 aAir;
  attribute vec3 aAirway;
  attribute vec4 aSeed;
  attribute float aIndex;
  varying float vAlpha;
  varying float vGlint;
  varying float vSpin;
  ${sizeClasses}

  // How much of the breath a single spore's trip takes up is 1 / (1 + SPREAD), so they arrive as a stream.
  const float SPREAD = 1.6;

  void main() {
    // Enlarged a long way; only the count is to scale.
    float size = 0.09 * sizeClass(aSeed.w);

    // Particles of 2.5 µm and up mostly lodge in the airways; finer ones reach deep into the lungs.
    float coarse = step(aSeed.w, uShares.z);
    float stays = step(aSeed.y, mix(uDeposition.x, uDeposition.y, coarse));
    vec3 home = mix(position, aAirway, coarse);
    vec3 target = (uLungFrame * vec4(home, 1.0)).xyz;

    float t = uTime;
    vec3 drift = vec3(sin(t * 0.21 + aSeed.x * 6.283), sin(t * 0.17 + aSeed.y * 6.283), cos(t * 0.19 + aSeed.z * 6.283));
    vec3 air = aAir + 0.4 * drift;

    // The first in are the last out.
    float lead = aSeed.x * SPREAD;
    float s = uInhaling > 0.5
      ? clamp(uProgress * (1.0 + SPREAD) - lead, 0.0, 1.0)
      : 1.0 - (1.0 - stays) * clamp(uProgress * (1.0 + SPREAD) - (SPREAD - lead), 0.0, 1.0);

    // Spores bound for the airways above the carina turn off before it.
    vec3 fork = home.y > uCarinaY ? target : uCarina;
    vec3 Q[6];
    Q[0] = air; Q[1] = uEntry; Q[2] = uPharynx; Q[3] = uLarynx; Q[4] = fork; Q[5] = target;
    float u = s * 5.0;
    int i = int(min(floor(u), 4.0));
    float f = u - float(i);
    vec3 p0 = Q[max(i - 1, 0)];
    vec3 p1 = Q[i];
    vec3 p2 = Q[i + 1];
    vec3 p3 = Q[min(i + 2, 5)];
    // Catmull-Rom, so the stream curves smoothly through each waypoint.
    vec3 p = 0.5 * (2.0 * p1 + (p2 - p0) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f * f + (3.0 * p1 - p0 - 3.0 * p2 + p3) * f * f * f);
    // Spread across the airway rather than in single file, and wandering once deep in the lungs.
    p += drift * mix(0.06, 0.12, step(0.999, s)) * (1.0 - coarse) * step(0.001, s);

    float fade = uInhaling > 0.5 ? smoothstep(0.0, 0.12, uProgress) : 1.0 - smoothstep(0.55, 1.0, uProgress);
    vAlpha = clamp(uCount - aIndex, 0.0, 1.0) * mix(1.0, fade, stays);
    // Lit in the reading's colour while in transit.
    vGlint = sin(3.14159 * s);
    vSpin = aSeed.z * 6.283 + t * (aSeed.y - 0.5);

    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * (1.0 + 0.4 * vGlint) * uPixelRatio * uScale / -mv.z;
  }
`;

const sporeFragment = /* glsl */ `
  uniform vec3 uDust;
  uniform vec3 uGlint;
  varying float vAlpha;
  varying float vGlint;
  varying float vSpin;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    // A spiky outline, like a pollen grain or a clump of soot.
    float edge = 0.62 + 0.3 * cos(atan(c.y, c.x) * 7.0 + vSpin);
    float body = smoothstep(edge, edge * 0.55, r);
    float core = smoothstep(0.32, 0.0, r);
    float a = max(body * 0.75, core) * vAlpha;
    if (a < 0.01) discard;
    // HDR glint (>1) so only spores on the move reach the bloom threshold.
    vec3 colour = mix(uDust, uGlint, 0.45) * (0.45 + 0.4 * core) + uGlint * vGlint * 2.2;
    gl_FragColor = vec4(colour, a);
  }
`;

// What a day of breathing leaves behind: specks lodged in the airways and through the lungs,
// one for many thousands of particles. They build up when the view opens, so the count is seen
// accumulating.
const speckVertex = /* glsl */ `
  uniform float uCount;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uTime;
  // The share of settled particles that are coarse, and so lodge in the airways.
  uniform float uCoarse;
  attribute vec3 aAirway;
  attribute vec4 aSeed;
  attribute float aIndex;
  varying float vAlpha;
  ${sizeClasses}

  void main() {
    float coarse = step(aSeed.y, uCoarse);
    vec3 p = mix(position, aAirway, coarse);
    vAlpha = clamp(uCount - aIndex, 0.0, 1.0) * (0.75 + 0.25 * sin(uTime * 0.8 + aSeed.z * 40.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 0.05 * mix(1.0, 2.4, coarse) * uPixelRatio * uScale / -mv.z;
  }
`;

const speckFragment = /* glsl */ `
  uniform vec3 uSpeck;
  varying float vAlpha;

  void main() {
    float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uSpeck, a);
  }
`;

// The body is clear glass, brightest where the surface turns edge-on so the lungs show through.
// Exposure clouds it: a haze across the whole surface, tinted towards the day's band.
const figureVertex = /* glsl */ `
  uniform float uChest;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vY;

  void main() {
    vY = position.y;
    vec3 p = position;
    p.xz *= 1.0 + uChest * exp(-pow((p.y - 1.0) / 3.5, 2.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalMatrix * normal;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const figureFragment = /* glsl */ `
  uniform vec3 uTint;
  uniform float uHaze;
  // Heights the part fades out beyond, so the neck's open ends don't show as hard rims.
  uniform vec2 uSpan;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vY;

  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
    float fade = smoothstep(uSpan.x, uSpan.x + 0.8, vY) * (1.0 - smoothstep(uSpan.y - 0.8, uSpan.y, vY));
    gl_FragColor = vec4(uTint * (uHaze + 0.4 * rim) * fade, 1.0);
  }
`;

const shellVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPosition;

  void main() {
    vPosition = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
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

    float fissures = seam(uFissureA);
    if (dot(uFissureA.xyz, vPosition) > uFissureA.w) fissures = max(fissures, seam(uFissureB));

    // Brightest where the surface turns edge-on, like an X-ray of a hollow shell, so the
    // outline reads from any side without hiding the particles inside.
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    // The cartilage rings that hold the windpipe open, about one every centimetre.
    float ring = uRings * smoothstep(0.55, 0.95, sin(vY * 22.0));

    // Inflamed airways redden.
    float inflamed = uRings * smoothstep(0.15, 0.7, uDamage) * 0.8;
    vec3 tint = mix(uTint, vec3(1.0, 0.32, 0.26), inflamed);
    // Healthy tissue glows; it dims as exposure rises.
    vec3 colour = tint * (0.04 + 0.55 * rim + 0.2 * ring + 0.3 * fissures) * (1.0 - 0.35 * uDamage);

    float soot = tissue * sootAt(vPosition);
    colour *= 1.0 - 0.7 * soot;

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
    float soot = sootAt(vPosition);
    if (soot < 0.01) discard;
    gl_FragColor = vec4(0.05, 0.04, 0.035, soot * 0.6);
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
    // are the first to narrow and close, so damage fades the tree from its tips inwards.
    float lost = smoothstep(0.25, 1.0, uDamage) * smoothstep(9.0 - 5.0 * uDamage, 10.0 - 5.0 * uDamage, aGeneration);
    vFade = pow(0.8, aGeneration - 2.0) * (1.0 - 0.8 * lost);
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

/**
 * A count pinned in the scene: a big number over a short caption. A label's text is fixed once
 * React Native has it, so a new count swaps in a new label.
 */
function countLabel(parent: THREE.Object3D, position: THREE.Vector3): { set: (count: string, caption: string) => void } {
  let current: Label | null = null;
  return {
    set(count, caption) {
      if (current?.text === count && current.detail === caption) return;
      if (current) parent.remove(current);
      current = count === '' ? null : new Label(count, 'count', caption);
      if (current) {
        current.position.copy(position);
        parent.add(current);
      }
    },
  };
}

export const createBreath: CreateView = (host) => {
  const stage = new Stage(host, {
    direction: new THREE.Vector3(0.85, 0.12, 1),
    bloom: { strength: 0.8, radius: 0.45, threshold: 0.8 },
    sway: 0.35,
  });
  const max = MAX_DOTS;
  const lungs = buildLungs();
  const figure = buildFigure();

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
  // The day's band, which the glass and the settled specks take on as exposure rises.
  const dayColour = new THREE.Color(bandFor(0).color);
  const glass = new THREE.Color('#a9c2e0');
  const figureTint = { value: glass.clone() };
  const haze = { value: 0.012 };

  // The breathing group's origin is at the top of the lungs, so a breath in swells them downwards.
  const breathing = new THREE.Group();
  breathing.position.y = APEX_Y;
  const body = new THREE.Group();
  body.position.y = -APEX_Y;
  breathing.add(body);
  stage.root.add(breathing);

  const chest = { uChest: { value: 0 } };
  const outline = (motion: { uChest: { value: number } }, span = [-100, 100]) => new THREE.ShaderMaterial({
    uniforms: { ...motion, uTint: figureTint, uHaze: haze, uSpan: { value: new THREE.Vector2(...span) } },
    vertexShader: figureVertex,
    fragmentShader: figureFragment,
    side: THREE.DoubleSide,
    ...additive,
  });
  const still = { uChest: { value: 0 } };
  stage.root.add(new THREE.Mesh(figure.torso, outline(chest)));
  const limbs = outline(still);
  for (const arm of figure.arms) stage.root.add(new THREE.Mesh(arm, limbs));
  stage.root.add(new THREE.Mesh(figure.head, limbs));
  stage.root.add(new THREE.Mesh(figure.neck, outline(still, [...NECK_SPAN])));

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

  const seeds = () => {
    const seed = new Float32Array(max * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    return new THREE.BufferAttribute(seed, 4);
  };
  const index = new THREE.BufferAttribute(Float32Array.from({ length: max }, (_, i) => i), 1);
  const shares = { uShares: { value: new THREE.Vector4() }, uShare10: { value: 0 } };
  const sizing = { uScale: { value: 1 }, uPixelRatio: { value: 1 } };

  const sporeGeometry = new THREE.BufferGeometry();
  sporeGeometry.setAttribute('position', new THREE.BufferAttribute(lungs.sampleDeep(max), 3));
  sporeGeometry.setAttribute('aAirway', new THREE.BufferAttribute(lungs.sampleAirways(max), 3));
  sporeGeometry.setAttribute('aAir', new THREE.BufferAttribute(sampleAir(max), 3));
  sporeGeometry.setAttribute('aSeed', seeds());
  sporeGeometry.setAttribute('aIndex', index);
  const spores = {
    ...shares,
    ...sizing,
    uGlint: wave.uGlint,
    uTime: damage.uTime,
    uCount: { value: 0 },
    uDust: { value: new THREE.Color('#9db2cc') },
    uLungFrame: { value: new THREE.Matrix4() },
    uEntry: { value: NOSTRILS.clone() },
    uPharynx: { value: PHARYNX.clone() },
    uLarynx: { value: new THREE.Vector3() },
    uCarina: { value: new THREE.Vector3() },
    uCarinaY: { value: CARINA.y },
    uInhaling: { value: 1 },
    uProgress: { value: 0 },
    uDeposition: { value: new THREE.Vector2(DEPOSITION.fine, DEPOSITION.coarse) },
  };
  const sporePoints = new THREE.Points(sporeGeometry, new THREE.ShaderMaterial({
    uniforms: spores,
    vertexShader: sporeVertex,
    fragmentShader: sporeFragment,
    ...additive,
  }));
  // Real positions only exist in the shader.
  sporePoints.frustumCulled = false;
  stage.root.add(sporePoints);

  // Fresh samples, so the specks don't sit exactly where the spores land.
  const speckGeometry = new THREE.BufferGeometry();
  speckGeometry.setAttribute('position', new THREE.BufferAttribute(lungs.sampleDeep(max), 3));
  speckGeometry.setAttribute('aAirway', new THREE.BufferAttribute(lungs.sampleAirways(max), 3));
  speckGeometry.setAttribute('aSeed', seeds());
  speckGeometry.setAttribute('aIndex', index);
  const specks = {
    ...shares,
    ...sizing,
    uTime: damage.uTime,
    uCount: { value: 0 },
    uCoarse: { value: 0 },
    uSpeck: { value: new THREE.Color() },
  };
  const speckPoints = new THREE.Points(speckGeometry, new THREE.ShaderMaterial({
    uniforms: specks,
    vertexShader: speckVertex,
    fragmentShader: speckFragment,
    ...additive,
  }));
  speckPoints.frustumCulled = false;
  body.add(speckPoints);

  stage.onResize((_, height) => {
    sizing.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
    sizing.uPixelRatio.value = stage.pixelRatio;
  });

  const bounds = new THREE.Box3();
  for (const { geometry } of lungs.surfaces) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(geometry.boundingBox);
  }
  const base = bounds.min.y;

  const caption = label(tr().scene.notToScale);
  caption.position.set(0, HIP_Y - 1, figure.bounds.max.z);
  stage.root.add(caption);
  // The two counts, by what they count: the breath above its cloud of air, the day beneath the lungs.
  const breathLabel = countLabel(stage.root, new THREE.Vector3(AIR_CENTRE.x, AIR_CENTRE.y + AIR_RADII.y + 0.9, AIR_CENTRE.z));
  const dayLabel = countLabel(stage.root, new THREE.Vector3(0, base - 1.8, figure.bounds.max.z));

  // Fitted to the bust and its cloud of air.
  const corners: THREE.Vector3[] = [];
  const air = new THREE.Box3(AIR_CENTRE.clone().sub(AIR_RADII), AIR_CENTRE.clone().add(AIR_RADII));
  air.max.y += 1.5;
  for (const box of [figure.bounds, air]) {
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  stage.setFrame(new THREE.Vector3(0, (HIP_Y + air.max.y) / 2, 2), corners);

  // The wave starts above the trachea and ends below the lungs, so it fades in and out unseen.
  const waveTop = TRACHEA_TOP_Y + 1;
  const waveBottom = base - 1;
  const larynx = new THREE.Vector3(0, TRACHEA_TOP_Y, CARINA.z);
  let sporeTarget = 0;
  let speckTarget = 0;
  let damageTarget = 0;
  // Accumulated rather than taken from the clock, so a change of breathing rate doesn't jump the phase.
  let phase = 0;
  stage.onFrame((dt, t) => {
    const clock = stage.reducedMotion ? t * 0.2 : t;
    const step = stage.reducedMotion ? dt * 0.2 : dt;
    damage.uTime.value = clock;
    spores.uCount.value += (sporeTarget - spores.uCount.value) * (1 - Math.exp(-dt * 2.5));
    // Slow, so the specks are seen settling.
    specks.uCount.value += (speckTarget - specks.uCount.value) * (1 - Math.exp(-dt * 0.3));
    const d = (damage.uDamage.value += (damageTarget - damage.uDamage.value) * (1 - Math.exp(-dt * 0.8)));
    tint.value.lerpColors(healthy, dulled, d);
    figureTint.value.lerpColors(glass, dayColour, 0.25 * d);
    haze.value = 0.012 + 0.05 * d;

    phase = (phase + step / THREE.MathUtils.lerp(BREATH_S, QUICKEST_BREATH_S, d)) % 1;
    const breathingIn = phase < INHALE;
    const progress = easeInOut(breathingIn ? phase / INHALE : (phase - INHALE) / (1 - INHALE));
    const fill = breathingIn ? progress : 1 - progress;
    const swell = fill * (1 - (1 - SHALLOWEST) * d);
    breathing.scale.set(1 + SWELL.x * swell, 1 + SWELL.y * swell, 1 + SWELL.z * swell);
    chest.uChest.value = 0.03 * swell;

    spores.uInhaling.value = breathingIn ? 1 : 0;
    spores.uProgress.value = progress;
    breathing.updateMatrixWorld(true);
    spores.uLungFrame.value.copy(body.matrixWorld);
    body.localToWorld(spores.uLarynx.value.copy(larynx));
    body.localToWorld(spores.uCarina.value.copy(CARINA));

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
      const text = tr().scene;

      const mean = meanPm25(readings);
      damageTarget = mean === null ? 0 : lungDamage(mean);
      dayColour.set(bandFor(mean ?? 0).color);
      specks.uSpeck.value.copy(dayColour).lerp(new THREE.Color('#8a8f99'), 0.5).multiplyScalar(0.8);

      const counts = breathCounts(latest);
      if (counts) {
        sporeTarget = counts.total / particlesPerDot(counts.total);
        const [s05, s1, s25, s5, s10] = counts.shares;
        shares.uShares.value.set(s05, s1, s25, s5);
        shares.uShare10.value = s10;
        specks.uCoarse.value = (s25 * DEPOSITION.coarse * counts.total) / Math.max(depositedPerBreath(counts), 1);
        breathLabel.set(formatCount(counts.total), text.inThisBreath);
      } else {
        sporeTarget = 0;
        breathLabel.set('', '');
      }

      const day = depositedPerDay(readings);
      speckTarget = day === null ? 0 : day / particlesPerSpeck(day);
      dayLabel.set(day === null ? '' : formatCount(day), text.settleInADay);

      // Every material holds this same colour, so setting it once recolours them all.
      glint.set(bandFor(latest?.pm2_5 ?? 0).color);
    },
    input: stage,
    dispose: () => stage.dispose(),
  };
};
