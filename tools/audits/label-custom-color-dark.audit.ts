// GAL-ART-01A/S3：显式自定义亮字在深底的真浏览器对比审计。
import { mountUI } from '../../src/ui/components/index.js';
import { onyx } from '../../games/game-i/themes.js';

mountUI(document.getElementById('root')!, {
  type: 'Panel', id: 'label-custom-dark-panel', props: { bg: 'ink-deep' }, layout: { padding: 28 }, children: [
    { type: 'Label', id: 'label-custom-dark', props: { text: 'Custom color is readable', size: 'xl', color: { custom: '#F4EEFF' }, bold: true } },
  ],
}, {}, onyx);
