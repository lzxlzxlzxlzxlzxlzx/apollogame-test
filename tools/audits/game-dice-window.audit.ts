import { mountUI } from '../../src/ui/components/index.js';
import { buildDiceWindow, DICE_WINDOW_THEME } from '../../games/game-dice/dice-window.js';

mountUI(document.getElementById('root')!, buildDiceWindow({
  dice: [{ sides: 20 }],
  modifier: 2,
  modifierSource: '智力',
  title: '智力检定',
  difficulty: 10,
  backdrop: 'arcane-vault',
}), {}, DICE_WINDOW_THEME);
