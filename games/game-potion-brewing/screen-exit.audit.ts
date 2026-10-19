import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { POTION_THEME, buildExitScreen } from './screen.js';

mountUI(document.getElementById('root')!, buildExitScreen(true), {}, POTION_THEME);
