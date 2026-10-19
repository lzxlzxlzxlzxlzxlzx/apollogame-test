// 审计入口：game111 对话屏（VN 三件）。
// 用法：node tools/ui-audit.mjs tools/audits/game111-talk.audit.ts
// 喂最长人设 + 最长回话 + 最长玩家发言 = 最坏情况（重叠要在最坏情况下量）。
import { mountUI } from '../../src/ui/components/index.js';
import { apolloOnyx } from '../../src/ui/components/apollo-kit.js';
import { buildTalkScreen } from '../../games/game111/ui.js';
import { NPCS, TOPICS, STUB_REPLIES } from '../../games/game111/world-data.js';

const longest = <T>(xs: readonly T[], len: (x: T) => number): T =>
  xs.reduce((a, b) => (len(b) > len(a) ? b : a));

const npc = longest(NPCS, (n) => n.persona.length);
const said = longest(TOPICS, (t) => t.text.length);
const reply = longest(Object.values(STUB_REPLIES), (s) => s.length);

mountUI(
  document.getElementById('root')!,
  buildTalkScreen({ npcId: npc.id, name: npc.name, persona: npc.persona, affinity: 88, said: said.text, reply, stubbed: true }),
  {},
  apolloOnyx,
);
