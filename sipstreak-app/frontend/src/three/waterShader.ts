import * as THREE from 'three'

/**
 * GPU water surface. The vertex shader displaces a flat disc with layered travelling waves plus
 * expanding, decaying ripple rings that reflect off the bottle wall, and derives the normal from
 * finite differences of the same height function. The fragment shader shades it with a Fresnel
 * term, a moving specular glint, a caustic shimmer and a foam rim at the glass.
 * All motion is driven by uniforms, so nothing is rebuilt on the CPU per frame.
 */
export const WATER_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;       // ambient wave strength (0 when motion is reduced)
uniform float uRippleT;   // seconds since the last splash
uniform float uRipple;    // splash energy 0..1
uniform float uRadius;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec2 vPlane;
varying float vHeight;

float ring(float r, float t, float radius) {
  // a ring front travelling outwards, plus its reflection off the wall
  float speed = 1.15;
  float k = 15.0;
  float front = speed * t;
  float direct = sin(k * (r - front)) * exp(-pow((r - front) * 2.6, 2.0));
  float back = sin(k * ((2.0 * radius - r) - front)) * exp(-pow(((2.0 * radius - r) - front) * 2.6, 2.0)) * 0.55;
  return (direct + back) * exp(-1.6 * t);
}

float height(vec2 p) {
  float ambient = (sin(p.x * 3.1 + uTime * 2.2) * 0.022 + cos(p.y * 4.2 - uTime * 1.7) * 0.018
                 + sin((p.x + p.y) * 6.3 + uTime * 3.1) * 0.008) * uAmp;
  float r = length(p);
  float edge = 1.0 - smoothstep(uRadius * 0.82, uRadius, r) * 0.6; // calmer at the glass
  float rip = ring(r, uRippleT, uRadius) * 0.075 * uRipple * edge;
  return ambient + rip;
}

void main() {
  vec2 p = position.xy;
  float e = 0.02;
  float h = height(p);
  float hx = height(p + vec2(e, 0.0));
  float hy = height(p + vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - h) / e, -(hy - h) / e, 1.0));
  vec4 mv = modelViewMatrix * vec4(p, h, 1.0);
  vNormalV = normalize(normalMatrix * n);
  vViewPos = mv.xyz;
  vPlane = p;
  vHeight = h;
  gl_Position = projectionMatrix * mv;
}
`

export const WATER_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uRadius;
uniform float uGlow;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec2 vPlane;
varying float vHeight;

void main() {
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  if (!gl_FrontFacing) N = -N;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  vec3 L = normalize(vec3(0.45, 0.8, 0.5));
  float diff = clamp(dot(N, L), 0.0, 1.0);
  vec3 H = normalize(L + V);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 90.0);
  // caustic shimmer: two interfering sine fields, brighter where the surface bends light
  float c = sin(vPlane.x * 9.0 + uTime * 1.6 + sin(vPlane.y * 7.0 - uTime)) * sin(vPlane.y * 8.0 - uTime * 1.3 + cos(vPlane.x * 6.0));
  float caustic = smoothstep(0.55, 1.0, c) * 0.35;
  float r = length(vPlane) / uRadius;
  float foam = smoothstep(0.9, 1.0, r) * (0.55 + 0.45 * sin(vPlane.x * 40.0 + vPlane.y * 33.0 + uTime * 2.0));
  vec3 base = mix(uColor * 0.55, uColor, diff);
  vec3 col = base + uColor * caustic + vec3(1.0) * spec * 0.9 + vec3(0.75, 0.95, 1.0) * fres * 0.55 + vec3(1.0) * foam * 0.35;
  col += uColor * uGlow * 0.25 + vec3(abs(vHeight) * 4.0) * 0.25; // crest highlight
  gl_FragColor = vec4(col, 0.93);
  #include <colorspace_fragment>
}
`

export function createWaterMaterial(radius: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uAmp: { value: 1 },
      uRippleT: { value: 10 },
      uRipple: { value: 0 },
      uRadius: { value: radius },
      uColor: { value: new THREE.Color('#2fb8ff') },
      uGlow: { value: 0 },
    },
  })
}

/** Advance the uniforms for one frame (pure function of its inputs, unit-testable without WebGL). */
export function stepWater(u: THREE.ShaderMaterial['uniforms'], o: { t: number; dt: number; ripple: number; sinceSplash: number; reduce: boolean; color: THREE.Color; glow: number }) {
  u.uTime.value = o.t
  u.uAmp.value = o.reduce ? 0 : 1
  u.uRipple.value = o.reduce ? 0 : o.ripple
  u.uRippleT.value = o.sinceSplash
  u.uColor.value.copy(o.color)
  u.uGlow.value = o.glow
}
