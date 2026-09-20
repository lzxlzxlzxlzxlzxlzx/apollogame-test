import { mountHost } from '@engine/host/mount-host.js';
import { createRunLoop } from '@engine/host/run-loop.js';
import { apolloOnyx, mountUI } from '@ui/components/index.js';
import { McFightSession } from './session.js';
import { readView, renderShop } from './render.js';

export function mount(container: HTMLElement): () => void {
  const host = mountHost(container, { fieldW: 960, fieldH: 640, topBarH: 640 });
  const session = new McFightSession();
  const ui = mountUI(host.topHost, renderShop(readView(session)), {}, apolloOnyx, session.input);
  const loop = createRunLoop({
    create: () => session, engineOf: s => s.engine, read: readView,
    sig: JSON.stringify, paint: view => ui.update(renderShop(view)), dispose: s => s.dispose(),
  });
  loop.start();
  return () => { loop.stop(); ui(); host.teardown(); };
}
