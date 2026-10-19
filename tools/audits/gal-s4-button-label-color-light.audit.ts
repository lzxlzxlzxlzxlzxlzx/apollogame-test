import { mountUI } from '../../src/ui/components/index.js';
import { daylight } from '../../games/game-i/themes.js';

mountUI(document.getElementById('root')!, {
  type: 'Panel', id: 's4-light-night', props: { bg: { custom: '#264070' } },
  layout: { direction: 'row', gap: 10, padding: 24 },
  children: [
    { type: 'Button', id: 's4-light-auto', props: { label: '自动', kind: 'ghost', skin: '', labelColor: { custom: '#F4EEFF' }, action: 'story.auto' } },
    { type: 'Button', id: 's4-light-disabled', props: { label: '跳过', kind: 'ghost', skin: '', labelColor: 'gold', disabled: true, action: 'story.skip' } },
  ],
}, {}, daylight);
