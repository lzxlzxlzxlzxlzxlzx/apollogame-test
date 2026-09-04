import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { HEART_TOWER_THEME, hud } from './game-105.js';
import { TowerGameSession } from './tower-session.js';
import './game-105-s5.css';

// S5 check-ui entry: the S4 opening structure, rendered with the candidate skin.
const session = new TowerGameSession();
for (let frame = 0; frame < 30; frame++) session.observePhysics(true);
mountUI(document.getElementById('root')!, hud(session, 0), {}, HEART_TOWER_THEME);
