// REQ-PUI-GAL-SKIN-BORDER-WIDTH：亮色真浏览器审计（Panel/Button/dialog 的 115/58 与 115/36）。
import { mountUI } from '../../src/ui/components/index.js';
import { daylight } from '../../games/game-i/themes.js';
const skin = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZmZmZmZmIi8+PC9zdmc+';

mountUI(document.getElementById('root')!, {
  type: 'Panel', id: 'skin-width-light-root', props: { skin, skinSlice: 115, skinBorderWidth: 58 }, layout: { direction: 'column', gap: 18, padding: 20 }, children: [
    { type: 'Button', id: 'skin-width-light-button', props: { label: '确认', skin, skinSlice: 115, skinBorderWidth: 36, disabled: true } },
    { type: 'dialog', id: 'skin-width-light-dialog', props: { kind: 'choice', skin, skinSlice: 115, skinBorderWidth: 58 } },
  ],
}, {}, daylight);
