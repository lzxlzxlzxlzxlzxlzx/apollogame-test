// GAL-PUI-03B 真浏览器验收入口：只用 LayoutNode + ActionSink，不挂游戏层 wheel 监听。
import { mountUI } from '../../src/ui/components/index.js';
import type { LayoutNode } from '../../src/ui/components/index.js';

const calls: string[] = [];
const buildTree = (modal = false): LayoutNode => ({
  type: 'Panel', id: 'wheel-root',
  props: { wheel: { upAction: 'wheel.up', downAction: 'wheel.down' }, bg: 'raised' },
  layout: { direction: 'column', gap: 10, padding: 16, width: 520 },
  children: [
    { type: 'Panel', id: 'wheel-story', props: { title: '故事翻页区' }, layout: { padding: 24 }, children: [{ type: 'Label', id: 'wheel-story-copy', props: { text: '把指针放在这里滚动。' } }] },
    { type: 'Panel', id: 'wheel-history', props: { title: '内层历史', scroll: true }, layout: { direction: 'column', gap: 5, padding: 8, height: 60 }, children: Array.from({ length: 10 }, (_, i) => ({ type: 'Label' as const, id: `wheel-history-${i}`, props: { text: `历史 ${i + 1}` } })) },
    ...(modal ? [{ type: 'Modal' as const, id: 'wheel-modal', props: { closeAction: 'close' }, children: [{ type: 'Label' as const, id: 'wheel-modal-copy', props: { text: '模态已打开' } }] }] : []),
  ],
});

const host = document.getElementById('root')!;
const handle = mountUI(host, buildTree(), {}, undefined, { enqueueAction: (name) => calls.push(name) });
Object.assign(window, {
  __wheelAudit: {
    calls,
    openModal: () => handle.update?.(buildTree(true)),
    teardown: () => handle(),
  },
});
