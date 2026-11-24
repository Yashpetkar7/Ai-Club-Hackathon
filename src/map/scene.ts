import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, OctahedronGeometry, PerspectiveCamera, Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import type { Graph, Layout } from './graph';

export interface MapOptions {
  canvas: HTMLCanvasElement;
  graph: Graph;
  at: Layout;
  still: boolean;
  colors: { ok: string; flag: string; cite: string; share: string };
  onPick: (id: string) => void;
  onLabels: (p: { id: string; x: number; y: number; front: boolean }[]) => void;
}

/** Circles are confirmed sources, diamonds are flagged. Solid lines cite, faint lines share references. */
export function startMap(o: MapOptions): (() => void) | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new Scene();
  const cam = new PerspectiveCamera(45, 1, 0.1, 100);
  const root = new Group();
  scene.add(root);
  const ball = new SphereGeometry(0.2, 20, 16);
  const gem = new OctahedronGeometry(0.28);
  const okMat = new MeshBasicMaterial({ color: o.colors.ok });
  const flagMat = new MeshBasicMaterial({ color: o.colors.flag, wireframe: true });
  const meshes = o.graph.nodes.map((n) => {
    const m = new Mesh(n.flagged ? gem : ball, n.flagged ? flagMat : okMat);
    m.position.set(...o.at[n.id]!);
    m.userData.id = n.id;
    root.add(m);
    return m;
  });
  const lines = (pairs: [string, string][], color: string, opacity: number) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pairs.flatMap(([a, b]) => [...o.at[a]!, ...o.at[b]!]), 3));
    const l = new LineSegments(g, new LineBasicMaterial({ color, transparent: true, opacity }));
    root.add(l);
    return l;
  };
  const all = [lines(o.graph.shared.map((s) => [s.a, s.b]), o.colors.share, 0.35), lines(o.graph.cites.map((c) => [c.from, c.to]), o.colors.cite, 1)];
  const reach = Math.max(4, ...Object.values(o.at).map((p) => Math.hypot(...p)));
  let yaw = 0.4;
  let pitch = 0.25;
  let dist = reach * 2.15;
  let drag: { x: number; y: number; moved: number } | null = null;
  let touched = false;
  const size = () => {
    const w = o.canvas.clientWidth || 1;
    const h = o.canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(size);
  ro.observe(o.canvas);
  const ray = new Raycaster();
  const down = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    touched = true;
    o.canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY, moved: drag.moved + Math.abs(dx) + Math.abs(dy) };
    yaw += dx * 0.007;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.006));
  };
  const up = (e: PointerEvent) => {
    if (drag && drag.moved < 6) {
      const b = o.canvas.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((e.clientX - b.left) / b.width) * 2 - 1, 1 - ((e.clientY - b.top) / b.height) * 2), cam);
      const hit = ray.intersectObjects(meshes)[0];
      if (hit) o.onPick(String(hit.object.userData.id));
    }
    drag = null;
  };
  const zoom = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    dist = Math.max(reach * 1.1, Math.min(reach * 4, dist * (1 + e.deltaY * 0.001)));
  };
  o.canvas.addEventListener('pointerdown', down);
  o.canvas.addEventListener('pointermove', move);
  o.canvas.addEventListener('pointerup', up);
  o.canvas.addEventListener('wheel', zoom, { passive: false });
  const v = new Vector3();
  let raf = 0;
  let on = true;
  const frame = () => {
    if (!on) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    if (!o.still && !touched) yaw += 0.0018;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
    o.onLabels(
      meshes.map((m) => {
        v.copy(m.position).project(cam);
        return { id: String(m.userData.id), x: (v.x * 0.5 + 0.5) * o.canvas.clientWidth, y: (0.5 - v.y * 0.5) * o.canvas.clientHeight, front: v.z < 1 };
      }),
    );
  };
  size();
  raf = requestAnimationFrame(frame);
  return () => {
    on = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    o.canvas.removeEventListener('pointerdown', down);
    o.canvas.removeEventListener('pointermove', move);
    o.canvas.removeEventListener('pointerup', up);
    o.canvas.removeEventListener('wheel', zoom);
    ball.dispose();
    gem.dispose();
    okMat.dispose();
    flagMat.dispose();
    for (const l of all) {
      l.geometry.dispose();
      (l.material as LineBasicMaterial).dispose();
    }
    renderer.dispose();
  };
}
