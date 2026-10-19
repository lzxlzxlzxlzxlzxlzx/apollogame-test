import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { parseChestInput, presentation, resolveChest } from '../src/chest.js';
import { buildChestScreen, CHEST_THEME } from '../src/chest-screen.js';

const input = parseChestInput({
  sessionId: 'ui-audit', tableId: 'ui-audit', chest: { name: '遗迹青铜宝箱' },
  rng: { algorithm: 'mulberry32-v1', seed: 1 },
  root: { type: 'item', itemId: 'gold', name: '金币', quantity: { fixed: 8 } },
});

mountUI(
  document.getElementById('root')!,
  buildChestScreen(input, 'revealed', resolveChest(input), presentation(input)),
  {},
  CHEST_THEME,
);
