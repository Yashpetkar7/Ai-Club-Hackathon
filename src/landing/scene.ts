import {
  AdditiveBlending,
  CatmullRomCurve3,
  Color,
  ColorManagement,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { SHEET_FS, SHEET_VS, THREAD_FS, THREAD_VS } from './shaders';

/** GPT-4 rate measured by Walters & Wilder (2023). The share of hollow sheets in the hero is exactly this. */
export const HOLLOW_SHARE = 0.18;

export interface LampTarget {
  hollow: boolean;
  index: number;
  x: number;
  y: number;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  sheets: number;
  still: boolean;
  /** 0 to 5, one whole number per chapter. Read every frame. */
  stage: () => number;
  /** 1 breaks the claim trail, 0 heals it. Read every frame. */
  broken: () => number;
  onLamp: (x: number, y: number, target: LampTarget | null) => void;
  onRings: (points: { x: number; y: number }[], visible: boolean) => void;
  onStage: (stage: number) => void;
  onLost: () => void;
}

const fract = (x: number): number => x - Math.floor(x);

/** Camera position and look-at for each chapter. */
const SHOTS: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, 0, 9, 0.6, 0, -3],
  [0, 0.6, 12.5, 0.6, 0, -3],
  [0, 1.1, 10.6, 0, -0.55, -1.5],
  [0.2, 1.1, 7.6, 1.4, -0.5, -6],
  [0, 0.5, 10.4, 1.4, 0, -4],
  [0, 0.9, 11.2, 1.2, 0.2, -4],
];

/** Returns a function that stops the scene and frees the GPU, or null when WebGL is not available. */
export function startScene(o: SceneOptions): (() => void) | null {
  const prevCm = ColorManagement.enabled;
  ColorManagement.enabled = false;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas: o.canvas, antialias: o.sheets > 600, powerPreference: 'high-performance' });
  } catch {
    ColorManagement.enabled = prevCm;
    return null;
  }
  renderer.outputColorSpace = LinearSRGBColorSpace;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  renderer.setPixelRatio(dpr);

  const N = o.sheets;
  const small = N < 600;
  const scene = new Scene();
  const cam = new PerspectiveCamera(42, 1, 0.1, 80);
  const NIGHT = new Color(0x0c0e22);
  const DAY = new Color(0xe6f0ec);
  const bg = new Color();

  const plane = new PlaneGeometry(1, 1.414, 5, 8);
  const geo = new InstancedBufferGeometry();
  geo.index = plane.index;
  geo.setAttribute('position', plane.getAttribute('position'));
  geo.setAttribute('uv', plane.getAttribute('uv'));
  geo.instanceCount = N;
  const seeds = new Float32Array(N * 4);
  const index = new Float32Array(N);
  let r = 7;
  const rnd = () => {
    r = (r * 16807) % 2147483647;
    return r / 2147483647;
  };
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rnd();
    index[i] = i;
  }
  geo.setAttribute('aS', new InstancedBufferAttribute(seeds, 4));
  geo.setAttribute('aI', new InstancedBufferAttribute(index, 1));

  const shift = small ? -2.4 : 0;
  const U = {
    uT: { value: 0 },
    uStage: { value: 0 },
    uFake: { value: HOLLOW_SHARE },
    uCam: { value: new Vector3() },
    uRay: { value: new Vector3(0, 0, -1) },
    uDay: { value: 0 },
    uLamp: { value: 1 },
    uBg: { value: bg },
    uGate: { value: 3.5 },
    uN: { value: N },
    uShift: { value: shift },
    uBr: { value: 1 },
  };
  const sheetMat = new ShaderMaterial({ uniforms: U, vertexShader: SHEET_VS, fragmentShader: SHEET_FS, side: DoubleSide });
  const sheets = new Mesh(geo, sheetMat);
  sheets.frustumCulled = false;
  scene.add(sheets);

  const ringGeo = new TorusGeometry(1.55, 0.028, 10, 90);
  const rings = [0, 1, 2].map(() => {
    const m = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0x63dccb, transparent: true, opacity: 0 }));
    m.rotation.y = Math.PI / 2 - 0.5;
    scene.add(m);
    return m;
  });

  const pts: Vector3[] = [];
  for (let i = 0; i <= 90; i++) {
    const u = i / 90;
    pts.push(new Vector3(Math.sin(u * 5.2 + 0.4) * 2.3 + 2.6 + shift, -2.22 + u * 2.9, 3.2 - u * 25));
  }
  const threadU = { uT: U.uT, uO: { value: 0 }, uB: { value: 1 } };
  const thread = new Mesh(
    new TubeGeometry(new CatmullRomCurve3(pts), 220, 0.03, 8, false),
    new ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, uniforms: threadU, vertexShader: THREAD_VS, fragmentShader: THREAD_FS }),
  );
  scene.add(thread);

  const ptr = { x: 0.25, y: 0.12, tx: 0.25, ty: 0.12, last: -9 };
  const aim = (e: PointerEvent) => {
    ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.ty = 1 - (e.clientY / window.innerHeight) * 2;
    ptr.last = performance.now() / 1000;
  };
  const size = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.fov = w < h ? 58 : 42;
    cam.updateProjectionMatrix();
    U.uGate.value = w < h ? 1.75 : 3.5;
  };
  const lost = (e: Event) => {
    e.preventDefault();
    o.onLost();
  };
  size();
  window.addEventListener('resize', size);
  window.addEventListener('pointermove', aim, { passive: true });
  window.addEventListener('pointerdown', aim, { passive: true });
  o.canvas.addEventListener('webglcontextlost', lost);

  const look = new Vector3();
  const v = new Vector3();
  let st = o.stage();
  let br = o.broken();
  let t = 0;
  let prev = 0;
  let acc = 0;
  let frames = 0;
  let lastNow = 0;
  let warm = 0;
  let slow = 0;
  let raf = 0;
  let running = true;

  const underLamp = (): LampTarget | null => {
    let best = -1;
    let bd = 0.055;
    let bz = 1e9;
    let bx = 0;
    let by = 0;
    const ray = U.uRay.value;
    for (let i = 0; i < N; i++) {
      const a = seeds[i * 4]!;
      const b = seeds[i * 4 + 1]!;
      const c = seeds[i * 4 + 2]!;
      const d = seeds[i * 4 + 3]!;
      const rr = 3.2 + 10.5 * Math.pow(a, 0.75);
      const an = b * 6.2832 + (t * 0.11) / (0.5 + rr * 0.1);
      v.set(Math.cos(an) * rr + 1.2, (c - 0.5) * 12 + Math.sin(t * 0.3 + d * 6.28) * 0.45, Math.sin(an) * rr * 0.75 - 6.5);
      const dx = v.x - cam.position.x;
      const dy = v.y - cam.position.y;
      const dz = v.z - cam.position.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 13 || dz > -1) continue;
      const dot = (dx * ray.x + dy * ray.y + dz * ray.z) / len;
      const off = Math.sqrt(Math.max(0, 1 - dot * dot));
      if (off < bd && len < bz) {
        bz = len;
        best = i;
        v.project(cam);
        bx = (v.x * 0.5 + 0.5) * window.innerWidth;
        by = (0.5 - v.y * 0.5) * window.innerHeight;
      }
    }
    if (best < 0) return null;
    const hollow = fract(seeds[best * 4]! * 7.31 + seeds[best * 4 + 3]! * 3.77 + seeds[best * 4 + 2]! * 5.13) <= HOLLOW_SHARE;
    return { hollow, index: best, x: bx, y: by };
  };

  const frame = (ms: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) {
      lastNow = ms / 1000;
      return;
    }
    const now = ms / 1000;
    const dt = Math.min(0.05, now - prev);
    prev = now;
    if (!o.still) t += dt;
    else if (!t) t = 4;

    // Quality governor. Preview panes and battery savers cap at 30 fps without the GPU being slow,
    // so it reacts only below 25, and never to a throttled page.
    if (lastNow) acc += now - lastNow;
    lastNow = now;
    frames++;
    if (acc > 1) {
      const fps = frames / acc;
      acc = 0;
      frames = 0;
      warm++;
      if (warm > 2 && fps > 5) {
        slow = fps < 25 ? slow + 1 : 0;
        if (slow >= 3) {
          slow = 0;
          if (dpr > 0.8) {
            dpr = Math.max(0.8, dpr * 0.85);
            renderer.setPixelRatio(dpr);
            size();
          } else if (geo.instanceCount > 420) geo.instanceCount = Math.max(420, Math.floor(geo.instanceCount * 0.8));
        }
      }
    }

    const want = o.stage();
    st += (want - st) * (o.still || Math.abs(want - st) > 1.6 ? 1 : Math.min(1, dt * 6));
    o.onStage(st);
    if (!o.still && performance.now() / 1000 - ptr.last > 3.2) {
      ptr.tx = 0.32 + Math.sin(t * 0.42) * 0.52;
      ptr.ty = Math.sin(t * 0.63 + 1) * 0.5;
    }
    ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 7);
    ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 7);

    const k = Math.min(4, Math.floor(st));
    const f = st - k;
    const A = SHOTS[k]!;
    const B = SHOTS[k + 1]!;
    const m = (i: 0 | 1 | 2 | 3 | 4 | 5) => A[i] + (B[i] - A[i]) * f;
    cam.position.set(m(0) + ptr.x * 0.35, m(1) + ptr.y * 0.22, m(2));
    look.set(m(3), m(4), m(5));
    cam.lookAt(look);
    cam.updateMatrixWorld();
    v.set(ptr.x, ptr.y, 0.5).unproject(cam).sub(cam.position).normalize();
    U.uRay.value.copy(v);
    U.uCam.value.copy(cam.position);

    const day = Math.min(1, Math.max(0, (st - 4.35) / 0.5));
    U.uT.value = t;
    U.uStage.value = st;
    U.uDay.value = day;
    U.uLamp.value = 1 - day;
    U.uFake.value = st < 1 ? HOLLOW_SHARE + (1 - HOLLOW_SHARE) * Math.max(0, (st - 0.25) / 0.75) : st < 2 ? 1 - 0.55 * Math.max(0, Math.min(1, (st - 1.3) / 0.6)) : 0.45;
    bg.copy(NIGHT).lerp(DAY, day);
    renderer.setClearColor(bg, 1);

    const ro = Math.max(0, 1 - Math.abs(st - 2) * 2.1);
    const at = rings.map((ring, i) => {
      ring.position.set((i - 1) * U.uGate.value, -1.55, -1.5);
      (ring.material as MeshBasicMaterial).opacity = ro * (0.75 + 0.25 * Math.sin(t * 2 + i));
      ring.visible = ro > 0.01;
      v.copy(ring.position);
      v.y -= 2;
      v.project(cam);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (0.5 - v.y * 0.5) * window.innerHeight };
    });
    o.onRings(at, ro > 0.55);

    br += (o.broken() - br) * Math.min(1, dt * 5);
    U.uBr.value = br;
    threadU.uB.value = br;
    threadU.uO.value = Math.max(0, 1 - Math.abs(st - 3) * 1.9);
    thread.visible = threadU.uO.value > 0.01;

    o.onLamp((ptr.x * 0.5 + 0.5) * window.innerWidth, (0.5 - ptr.y * 0.5) * window.innerHeight, st < 0.35 && !small ? underLamp() : null);
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    window.removeEventListener('pointermove', aim);
    window.removeEventListener('pointerdown', aim);
    o.canvas.removeEventListener('webglcontextlost', lost);
    plane.dispose();
    geo.dispose();
    ringGeo.dispose();
    sheetMat.dispose();
    thread.geometry.dispose();
    (thread.material as ShaderMaterial).dispose();
    for (const ring of rings) (ring.material as MeshBasicMaterial).dispose();
    renderer.dispose();
    ColorManagement.enabled = prevCm;
  };
}
