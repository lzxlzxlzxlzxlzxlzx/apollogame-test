// GAL-ART-01A/S3：显式自定义深字在亮底的真浏览器对比审计。
import { mountUI } from '../../src/ui/components/index.js';
import { daylight } from '../../games/game-i/themes.js';

mountUI(document.getElementById('root')!, {
  type: 'Panel', id: 'label-custom-light-panel', props: { bg: 'raised' }, layout: { padding: 28 }, children: [
    { type: 'Label', id: 'label-custom-light', props: { text: 'Custom color is readable', size: 'xl', color: { custom: '#17213B' }, bold: true } },
  ],
}, {}, daylight);
