import { mountUI } from '../../src/ui/components/index.js';
import { buildChestScreen, CHEST_THEME } from '../../dokiworld/game-loot-chest/src/chest-screen.js';
import { parseChestInput, presentation } from '../../dokiworld/game-loot-chest/src/chest.js';

const input = parseChestInput({
  sessionId: 'ui-audit', tableId: 'ui-audit', chest: { name: '遗迹青铜宝箱' },
  rng: { algorithm: 'mulberry32-v1', seed: 1 },
  root: { type: 'item', itemId: 'gold', name: '金币', quantity: { fixed: 8 } },
});

mountUI(document.getElementById('root')!, buildChestScreen(input, {
  phase: 'playing', feedback: 'miss', locks: 1, misses: 3, attempts: 4, elapsed: 42, duration: 100,
}, undefined, presentation(input)), {}, CHEST_THEME);
