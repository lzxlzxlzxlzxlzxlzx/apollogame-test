import { mountHost } from '@engine/host/mount-host.js';
import { createRunLoop } from '@engine/host/run-loop.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import { apolloOnyx, mountUI,type LayoutNode } from '@ui/components/index.js';
import { canvasPointerToScreen } from '@net/queued-input.js';
import { S4Session,type S4Phase } from './s4-session.js';
import { projectS4Field, readS4View, renderS4, renderS4Footer } from './s4-render.js';
import { S4_ACTIONS as A } from './content/s4-balance.js';

/** Formal S4 mount; preview and registered route share this exact production entry. */
export function mountS4(container: HTMLElement): () => void {
  return mountCombatSession(container,new S4Session(1),readS4View,renderS4,renderS4Footer);
}
export function mountCombatSession<U extends string,V extends {phase:S4Phase}>(container:HTMLElement,session:S4Session<U>,read:(s:S4Session<U>)=>V,render:(v:V)=>LayoutNode,renderFooter:(v:V)=>LayoutNode):()=>void {
  const host = mountHost(container, { fieldW: 960, fieldH: 720, topBarH: 720, bottomBarH: 70, sceneBackground: '#121d2c' });
  const renderer = new CanvasRenderer({ width: 960, height: 720, background: '#121d2c' });
  renderer.init(host.scene);
  const ui = mountUI(host.topHost, render(read(session)), {}, apolloOnyx, session);
  const footer = mountUI(host.bottomHost, renderFooter(read(session)), {}, apolloOnyx, session);
  const canvas = host.scene.querySelector('canvas')!;
  canvas.dataset.action = A.place;
  const point = (event: PointerEvent) => {
    const p = canvasPointerToScreen(event.clientX, event.clientY, canvas.getBoundingClientRect(), 960, 720);
    return { x: (p.x - 480) / 18, y: (p.y - 360) / 18 };
  };
  let pointer: number | null = null;
  const down = (event: PointerEvent) => {
    if (session.phase !== 'deploy' || pointer !== null) return;
    const p = point(event);
    const picked = session.roster.find(r => { const t = session.placement(r.instanceId); if (!t) return false; const shape = session.world.getComponent<{ type: string; radius?: number }>(r.instanceId, 'Shape'); return Math.hypot(p.x - t.x, p.y - t.y) <= (shape?.radius ?? 0); });
    if (!picked) return;
    pointer = event.pointerId; session.dragging = picked.instanceId; canvas.setPointerCapture(event.pointerId); event.preventDefault(); loop.refresh();
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    const id = session.dragging, p = point(event); pointer = null; session.dragging = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (id) session.enqueueAction(session.deployed.some(r => r.instanceId === id) ? A.move : A.place, { arg: JSON.stringify({ instanceId: id, x: p.x, y: p.y }) });
  };
  const cancel = () => { pointer = null; session.dragging = null; loop.refresh(); };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel);
  const loop = createRunLoop({ create: () => session, engineOf: s => s.engine, read: s => ({ ...read(s), version: s.world.getVersion() }), sig: JSON.stringify,
    paint: view => {
      const full = view.phase === 'shop' || view.phase === 'result';
      host.topHost.style.height = full ? '720px' : view.phase === 'deploy' ? '160px' : '120px'; host.bottomHost.hidden = full;
      ui.update(render(view)); if (!full) { footer.update(renderFooter(view)); renderer.sync(projectS4Field(session)); }
    }, dispose: s => s.dispose(),
  });
  loop.start();
  return () => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); loop.stop(); ui(); footer(); renderer.destroy(); host.teardown(); };
}
