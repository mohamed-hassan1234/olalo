import { AdditiveBlending, BackSide, Color, DoubleSide, ShaderMaterial } from 'three';

/** Emissive strip revealed from the base upward by world-space height (Nexus seams). */
export function makeRevealMaterial(color: string) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uReveal: { value: 0 }, uIntensity: { value: 1.6 } },
    vertexShader: /* glsl */ `
      varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vY = wp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uReveal; uniform float uIntensity;
      varying float vY;
      void main() {
        float edge = uReveal - vY;
        if (edge < 0.0) discard;
        float head = 1.0 + 2.5 * exp(-edge * 0.6);
        gl_FragColor = vec4(uColor * uIntensity * head, 1.0);
      }`,
    toneMapped: false,
  });
}

/** Holographic ring that draws on around its circumference (TorusGeometry uv.x runs around the ring). */
export function makeArcMaterial(color: string, opacity = 0.9) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uReveal: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uReveal; uniform float uTime; uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        if (vUv.x > uReveal) discard;
        float lead = smoothstep(0.04, 0.0, uReveal - vUv.x) * step(uReveal, 0.999);
        float shimmer = 0.85 + 0.15 * sin(vUv.x * 120.0 + uTime * 2.0);
        gl_FragColor = vec4(uColor * (shimmer + lead * 3.0), uOpacity);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

/** Energy conduit: revealed along its length, with pulses travelling outward (bridges, filaments). */
export function makeFlowMaterial(color: string) {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uReveal: { value: 0 },
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uSpeed: { value: 0.35 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uReveal; uniform float uTime; uniform float uIntensity; uniform float uSpeed;
      varying vec2 vUv;
      void main() {
        if (vUv.x > uReveal) discard;
        float pulse = pow(fract(vUv.x * 3.0 - uTime * uSpeed), 8.0);
        float head = smoothstep(0.06, 0.0, uReveal - vUv.x) * step(uReveal, 0.999);
        float core = 0.55 + 1.6 * pulse + 3.0 * head;
        gl_FragColor = vec4(uColor * core * uIntensity, 0.95);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
}

/** Large back-faced sphere: navy zenith fading to a near-black horizon. Not fogged. */
export function makeSkyMaterial() {
  return new ShaderMaterial({
    uniforms: { uTop: { value: new Color('#0A1230') }, uHorizon: { value: new Color('#0D1835') }, uBottom: { value: new Color('#05070D') } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(uHorizon, uTop, smoothstep(0.0, 0.6, h)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.15, -h));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
}

/** Soft radial glow sprite material (billboard planes for atmosphere and world halos). */
export function makeGlowMaterial(color: string, opacity = 0.5) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}
