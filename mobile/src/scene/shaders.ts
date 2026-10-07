// Particles carry cylindrical coordinates (radius, angle, height) in `position`;
// all drift is computed here so the CPU never touches per-particle data after start-up.
export const particleVertex = /* glsl */ `
uniform float uTime;
uniform float uCount;
uniform float uSize;
uniform float uScale;
uniform float uPixelRatio;
uniform float uHeight;
uniform float uRadius;
uniform float uFall;
uniform float uJitter;
uniform float uSheetWidth;
uniform float uFogDensity;
uniform vec2 uNowDir;

attribute vec4 aSeed;
attribute float aIndex;

varying float vAlpha;
varying float vGlint;

const float TAU = 6.28318530718;

void main() {
  float r0 = position.x;
  float th0 = position.y;
  float y0 = position.z;

  // Slow convective swirl; particles near the wall lag behind the core.
  float swirl = (0.045 + 0.035 * aSeed.x) * (1.0 - 0.3 * r0 / uRadius);
  float th = th0 + swirl * uTime;
  float r = r0 + 0.35 * sin(uTime * (0.21 + 0.3 * aSeed.y) + aSeed.z * TAU);

  // Coarse particles settle (negative uFall); mod() recycles them at the top.
  float vy = uFall + 0.08 * (aSeed.z - 0.5);
  float y = mod(y0 + vy * uTime + 0.25 * sin(uTime * 0.37 + aSeed.w * TAU), uHeight);

  vec3 p = vec3(r * cos(th), y, r * sin(th));

  // Brownian jitter, strongest for the finest particles.
  p += uJitter * vec3(
    sin(uTime * 7.3 + aSeed.x * 91.0),
    sin(uTime * 6.1 + aSeed.y * 57.0),
    sin(uTime * 8.7 + aSeed.w * 73.0)
  );

  // Particles beyond the live count stay hidden; the 1-unit ramp fades them in and out.
  float shown = clamp(uCount - aIndex, 0.0, 1.0);
  float edge = smoothstep(0.0, 0.5, y) * smoothstep(uHeight, uHeight - 0.5, y);

  // Glint where a particle crosses the laser sheet: the half-plane through the axis facing "now".
  vec2 normal = vec2(-uNowDir.y, uNowDir.x);
  float d = dot(p.xz, normal);
  float ahead = smoothstep(-0.2, 0.4, dot(p.xz, uNowDir));
  vGlint = ahead * exp(-(d * d) / (uSheetWidth * uSheetWidth));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  float fog = exp(-pow(depth * uFogDensity, 2.0));
  vAlpha = shown * edge * fog;

  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + 1.4 * vGlint) * uPixelRatio * uScale / depth;
}
`;

export const particleFragment = /* glsl */ `
uniform vec3 uDust;
uniform vec3 uGlintColor;
uniform float uDustAlpha;

varying float vAlpha;
varying float vGlint;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.1, d);
  float a = disc * vAlpha;
  if (a < 0.004) discard;
  // HDR glint (>1) so only particles in the beam reach the bloom threshold.
  vec3 col = uDust * uDustAlpha + uGlintColor * vGlint * 3.2;
  gl_FragColor = vec4(col, a);
}
`;

export const sheetVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// uv.x runs from the chamber axis (0) out to the ring (1); uv.y from floor to top.
export const sheetFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  float body = smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
  float fade = mix(1.0, 0.35, vUv.x);
  // Soft pulses travel outward from the emitter towards the current minute on the ring.
  float pulse = 0.7 + 0.3 * sin(vUv.x * 9.0 - uTime * 2.2);
  gl_FragColor = vec4(uColor, uOpacity * body * fade * pulse);
}
`;
