import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { buildCardRevealScreen, CARD_REVEAL_THEME } from './screen.js';

mountUI(document.getElementById('root')!, buildCardRevealScreen({ status: 'playing', phase: 'P4' }, false, 'idle'), {}, CARD_REVEAL_THEME);
