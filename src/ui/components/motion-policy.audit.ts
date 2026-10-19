import { mountUI } from './index.js';
import { SHELL } from '../shell-theme.js';
const host = document.querySelector<HTMLElement>('#root')!;
const seen: string[] = []; (window as unknown as { __motionActions: string[] }).__motionActions = seen;
mountUI(host, { type: 'Panel', id: 'motion', props: { bare: true }, layout: { anim: 'flyIn' }, children: [
  { type: 'Button', id: 'go', props: { label: '继续', action: 'go', skin: '/x.png', skinFeedback: { hoverBrightness: 1.2, pressedBrightness: .9, glowRadius: 6, glowColor: { custom: '#abcdef' }, transitionMs: 160 } } },
  { type: 'Label', id: 'cue', props: { text: '提示' }, layout: { fx: [{ kind: 'cue', ms: 1300 }] } },
  { type: 'Slider', id: 'slider', props: { min: 0, max: 2, value: 1, trackSkin: '/x.png', thumbSkin: '/x.png', motionMs: 150 } },
] }, { go: () => seen.push('go') }, SHELL, undefined, { reducedMotion: location.hash === '#work' });
