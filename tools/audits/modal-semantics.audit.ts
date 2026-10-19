// GAL-PUI-02B · 通用 Modal 在 1440×900 逻辑画布的浏览器审计入口。
import { mountUI } from '../../src/ui/components/index.js';
import type { LayoutNode } from '../../src/ui/components/index.js';

const root: LayoutNode = {
  type: 'Panel', id: 'modal-audit-root', props: { bare: true },
  children: [
    { type: 'Button', id: 'modal-audit-launcher', props: { label: '打开历史', action: 'open' } },
    {
      type: 'Modal', id: 'modal-audit-wide',
      props: { title: '历史记录', size: 'wide', closeAction: 'close' },
      children: [
        { type: 'Label', id: 'modal-audit-copy', props: { text: '此处容纳长篇历史与 CG 浏览内容。' } },
        { type: 'Button', id: 'modal-audit-close', props: { label: '关闭', action: 'close' } },
      ],
    },
  ],
};

mountUI(document.getElementById('root')!, root);
