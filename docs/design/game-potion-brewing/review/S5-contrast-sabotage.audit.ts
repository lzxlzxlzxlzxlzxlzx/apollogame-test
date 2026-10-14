// S5 独立复查专用：仅修改内存 LayoutNode，验证对比度审计可验红。
import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { MOON_ROUND } from '../../../../games/game-potion-brewing/fixtures.js';
import { buildRecipeScreen, POTION_THEME } from '../../../../games/game-potion-brewing/screen.js';

const tree = buildRecipeScreen(MOON_ROUND.recipe);
const matches = tree.children?.filter((node) => node.id === 'potion-recipe-name') ?? [];
if (matches.length !== 1) throw new Error(`sabotage anchor expected 1, got ${matches.length}`);
matches[0]!.props = { ...matches[0]!.props, color: { custom: '#f1d39a' } }; // 与羊皮纸底同色
mountUI(document.getElementById('root')!, tree, {}, POTION_THEME);
