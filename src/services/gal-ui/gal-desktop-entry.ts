/* AI START */
import type { HostExitResult } from '../platform/host-exit.js';
import { openManorEscape } from './manor-escape-play.js';

interface GalDesktopBridge {
  requestExit(): Promise<HostExitResult>;
}

declare global {
  interface Window { galDesktop?: GalDesktopBridge; }
}

const root = document.getElementById('app');
if (!root) throw new Error('缺少桌面挂载点');
const bridge = window.galDesktop;
void openManorEscape(root, bridge ? {
  previewExitFeedback: false,
  hostExit: { requestExit: () => bridge.requestExit() },
} : { previewExitFeedback: false }).catch(error => {
  root.textContent = error instanceof Error ? error.message : String(error);
});
/* AI END */
