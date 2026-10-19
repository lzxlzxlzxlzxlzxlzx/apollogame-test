// game111 无头演示 —— 跑 N 个回合，把小镇的生活打出来（自证用·非门禁件）。
//
//   node_modules/.bin/vite-node scripts/game111-demo.ts              # 默认 NullNpcAgentPort（零网络·确定性）
//   GAME111_ENDPOINT=http://127.0.0.1:8711/decide \
//     node_modules/.bin/vite-node scripts/game111-demo.ts            # 接 DeepSeek 代理（先起 game111-deepseek-proxy.mjs）
//   GAME111_TURNS=12 ... 改回合数
import { Engine } from '../src/runtime/engine.js';
import { hashSnapshot } from '../src/net/determinism.js';
import { NullNpcAgentPort, HttpNpcAgentPort } from '../src/services/npc-agent/index.js';
import type { NpcAgentPort } from '../src/engine/protocol/agent.js';
import type { Resource, State } from '../src/engine/protocol/components.js';
import { recall } from '../src/skills/tier2/memory.js';
import { buildBlueprint, setupTown, ZONE_NAME } from '../games/game111/blueprint.js';
import { runTurn } from '../games/game111/turn-driver.js';
import { NPCS, AGENT_NPC_IDS, NEEDS, needId, zoneFsm } from '../games/game111/world-data.js';

const TURNS = Number(process.env.GAME111_TURNS ?? 6);
const ENDPOINT = process.env.GAME111_ENDPOINT;

const port: NpcAgentPort = ENDPOINT
  ? new HttpNpcAgentPort({ endpoint: ENDPOINT, timeoutMs: 20000 })
  : new NullNpcAgentPort({
      // 铁律：**每条规则的动词必须真能回补那一项需求**，否则一旦该项垫底就进活锁
      // （首版把 curiosity→move_to，而 move_to 只改所在地、不回好奇心 → 实跑十回合全员卡在
      //  「动身去后山」原地刷屏。这不是模型的毛病，是规则表自己把自己锁死了）。
      rules: [
        { whenLowest: 'energy', verb: 'rest' },          // +精力
        { whenLowest: 'social', verb: 'talk_to', args: ['gud'] }, // +社交欲 +心情
        { whenLowest: 'curiosity', verb: 'observe' },    // +好奇心 +心情
        { whenLowest: 'mood', verb: 'observe' },         // +心情
      ],
    });

const e = new Engine();
e.load(buildBlueprint(111));
setupTown(e.world, 0);

const NAME = new Map(NPCS.map((n) => [n.id, n.name]));
const read = (id: string): number => {
  for (const [eid] of e.world.query('Resource')) {
    const r = e.world.getComponent<Resource>(eid, 'Resource');
    if (r?.id === id) return r.current;
  }
  return -1;
};
const zone = (npc: string): string => {
  for (const [eid] of e.world.query('State')) {
    const s = e.world.getComponent<State>(eid, 'State');
    if (s?.fsmId === zoneFsm(npc)) return ZONE_NAME[s.current] ?? s.current;
  }
  return '?';
};

console.info(`小都会 · ${ENDPOINT ? `真后端 ${ENDPOINT}` : 'NullNpcAgentPort（零网络）'} · ${TURNS} 回合\n`);

for (let t = 1; t <= TURNS; t++) {
  const r = await runTurn(e.world, t, port);
  console.info(`── 第 ${t} 回合 ──`);
  for (const it of r.resolved) {
    const who = NAME.get(it.npcId) ?? it.npcId;
    const arg = it.args?.[0] !== undefined ? String(it.args[0]) : '';
    const said = { move_to: `动身去 ${ZONE_NAME[arg] ?? arg}`, talk_to: `找 ${NAME.get(arg) ?? arg} 搭话`, rest: '歇一会儿', observe: '四处看看' }[it.verb] ?? it.verb;
    console.info(`  ${who}：${said}${r.filled.includes(it.npcId) ? '   （超期降级补的）' : ''}`);
  }
  if (r.failures.length > 0) console.info(`  ⚠ 端口失败：${r.failures.map((f) => `${f.npcId}(${f.reason})`).join(' ')}`);
  const line = AGENT_NPC_IDS.map((id) =>
    `${NAME.get(id)}@${zone(id)} ${NEEDS.map((n) => `${n.name}${read(needId(id, n.key))}`).join(' ')}`).join('  |  ');
  console.info(`  ${line}`);
}

console.info('\n── 记忆（top 3）──');
for (const id of AGENT_NPC_IDS) {
  console.info(`${NAME.get(id)}：`);
  for (const m of recall(e.world, `npc-${id}`, { k: 3, now: TURNS })) {
    console.info(`   [强度${m.strength} 第${m.turn}回合 来源${m.source}] ${m.subject} ${m.tags.join('/')} ${m.object ?? ''}`);
  }
}
console.info(`\n世界指纹 hash = ${hashSnapshot(e.world.snapshot())}`);
