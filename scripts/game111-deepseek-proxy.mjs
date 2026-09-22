#!/usr/bin/env node
// game111 · DeepSeek 决策代理（**开发期基建·不是游戏层代码，也不是引擎能力**）
//
// 为什么需要它，两条硬理由：
//  ① **形状不同**。引擎的 `HttpNpcAgentPort` 按自己的契约 POST `{npcId,turn,verbs,needs,memories,...}`，
//     期望回 `{intents:[...]}`。DeepSeek 是 OpenAI 兼容的 chat/completions：收 `{model,messages}`、
//     回 `{choices:[{message:{content}}]}`。两边对不上，中间必须有人翻译。
//  ② **钥匙不能进浏览器**。任何让前端直连大模型的写法都等于把 API key 发给每个玩家。
//     key 只在本进程里（读 env），浏览器只看得到 localhost 的这个端点。
//
// 因此它落在 `scripts/`：和引擎/游戏都无关的开发期工具。**零引擎改动、零游戏层例外**。
// 换 provider 只改本文件的 ENDPOINT/MODEL/鉴权三处，游戏侧一行不动——这正是端口契约的意义。
//
// 用法：
//   export DEEPSEEK_API_KEY=sk-...
//   node scripts/game111-deepseek-proxy.mjs            # 默认 http://127.0.0.1:8711/decide
//   PORT=9000 node scripts/game111-deepseek-proxy.mjs
// 自检（不花钱·不出网）：
//   node scripts/game111-deepseek-proxy.mjs --selftest
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8711);
const API_KEY = process.env.DEEPSEEK_API_KEY ?? '';
const ENDPOINT = process.env.DEEPSEEK_ENDPOINT ?? 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

/**
 * AgentContext → 两段 message（纯函数·可自检）。
 *
 * prompt 纪律：动词闭集**逐条写进去**并明确「只准用这些」。闭集外的产出不是灾难（barrier 会拒收并留痕），
 * 但每一次被拒都是白花的 token，所以在 prompt 侧先收一道。
 */
export function buildMessages(ctx) {
  const verbs = (ctx.verbs ?? []).map((v) => `${v.verb}/${v.arity ?? 0}`).join(' , ');
  const needs = Object.entries(ctx.needs ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join(' ');
  const mems = (ctx.memories ?? [])
    .map((m) => `- [${m.tags.join('/')}|强度${m.strength}|第${m.turn}回合|来源${m.source}] ${m.subject} → ${m.object ?? '(无对象)'}`)
    .join('\n') || '（暂无相关记忆）';

  const system = [
    '你在扮演一个小镇里的居民，正在决定这一回合做什么。',
    '',
    '只准输出 JSON，形如：{"intents":[{"verb":"move_to","args":["z-cafe"]}]}',
    '不要输出 markdown 代码块，不要解释，不要多余的字。',
    `可用动词（名字/参数个数）：${verbs}`,
    '参数个数必须严格对上。动词和参数都不许自创——不在表内的会被直接丢弃。',
    '一般只出 1 条意图。',
  ].join('\n');

  const user = [
    ctx.persona ? `你是谁：${ctx.persona}` : '',
    `现在是第 ${ctx.turn} 回合。`,
    ctx.hints?.zoneName ? `你在：${ctx.hints.zoneName}（${ctx.hints.zone}）` : '',
    ctx.hints?.zones ? `可去的地方：${ctx.hints.zones}` : '',
    needs ? `你的状态（0-100，越低越迫切）：${needs}` : '',
    (ctx.perceived ?? []).length > 0 ? `同一个地方还有：${ctx.perceived.join(', ')}` : '这里只有你一个人。',
    '',
    '你记得的事：',
    mems,
    '',
    '这一回合你想做什么？',
  ].filter(Boolean).join('\n');

  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/**
 * DeepSeek 回包 → `{intents:[...]}`（纯函数·可自检）。
 *
 * 只做**取出 JSON**这一件事，不判闭集——闭集裁决归 `t2-intent-barrier`；代理先过滤一遍的话，
 * 被拒的那些就永远不会留下 reject 痕迹，正是「什么都没发生」最难查的形状（引擎端口注释同源）。
 * 模型爱加 ```json 围栏，所以剥一层；再不行就从首个 { 到末个 } 抠。
 */
export function parseChatContent(content) {
  if (typeof content !== 'string') return { intents: [] };
  let s = content.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    const o = JSON.parse(s);
    if (Array.isArray(o)) return { intents: o };
    if (Array.isArray(o?.intents)) return { intents: o.intents };
  } catch { /* 落到下面抠括号 */ }
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const o = JSON.parse(s.slice(a, b + 1));
      if (Array.isArray(o?.intents)) return { intents: o.intents };
    } catch { /* 放弃 */ }
  }
  return { intents: [] };
}

async function callDeepSeek(ctx) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: buildMessages(ctx),
      temperature: 1.0, // 要「活人感」就别压成 0；确定性不靠模型，靠录下来的意图流
      max_tokens: 200,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`deepseek http ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return parseChatContent(body?.choices?.[0]?.message?.content);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serve() {
  if (!API_KEY) {
    console.error('[game111-proxy] 缺 DEEPSEEK_API_KEY —— 没有它代理只会一直回空，游戏会全员走降级路径。');
    console.error('[game111-proxy] export DEEPSEEK_API_KEY=sk-... 之后重跑。');
  }
  const server = http.createServer(async (req, res) => {
    // 只给本机开发用；浏览器要跨端口访问故放 CORS。
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type,authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end('POST only'); return; }

    let ctx;
    try { ctx = JSON.parse(await readBody(req)); }
    catch { res.writeHead(400, { 'content-type': 'application/json' }).end('{"intents":[]}'); return; }

    try {
      const out = await callDeepSeek(ctx);
      console.info(`[game111-proxy] turn=${ctx.turn} npc=${ctx.npcId} → ${JSON.stringify(out.intents)}`);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    } catch (e) {
      // 绝不抛给调用方：空数组是 barrier 早就设计好的一条路（超期 → 降级补默认动词）。
      console.warn(`[game111-proxy] turn=${ctx?.turn} npc=${ctx?.npcId} 失败：${e.message}`);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"intents":[]}');
    }
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.info(`[game111-proxy] listening http://127.0.0.1:${PORT}/decide  model=${MODEL}`);
    console.info('[game111-proxy] 游戏侧：new HttpNpcAgentPort({ endpoint: "http://127.0.0.1:%d/decide" })', PORT);
  });
}

// ── 自检（零网络·零 key·CI 可跑）────────────────────────────────────────
function selftest() {
  let fail = 0;
  const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fail++; console.error(`✗ ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
    else console.info(`✓ ${name}`);
  };
  const one = [{ verb: 'rest' }];
  eq('裸 JSON', parseChatContent('{"intents":[{"verb":"rest"}]}').intents, one);
  eq('```json 围栏', parseChatContent('```json\n{"intents":[{"verb":"rest"}]}\n```').intents, one);
  eq('``` 无语言围栏', parseChatContent('```\n{"intents":[{"verb":"rest"}]}\n```').intents, one);
  eq('前后有废话', parseChatContent('好的，我决定：{"intents":[{"verb":"rest"}]} 就这样').intents, one);
  eq('裸数组', parseChatContent('[{"verb":"rest"}]').intents, one);
  eq('纯废话 → 空', parseChatContent('我觉得今天不错').intents, []);
  eq('非字符串 → 空', parseChatContent(undefined).intents, []);

  const msgs = buildMessages({
    npcId: 'nao', turn: 3, verbs: [{ verb: 'move_to', arity: 1 }, { verb: 'rest' }],
    needs: { mood: 40, energy: 10 }, perceived: ['mor'], persona: '有边界感的咖啡店主',
    memories: [{ id: 'm1', subject: 'nao', object: 'mor', turn: 2, strength: 50, tags: ['talk'], source: 'intent' }],
    hints: { zone: 'z-cafe', zoneName: '野咖啡馆', zones: 'z-cafe(野咖啡馆)' },
  });
  eq('两段 message', msgs.length, 2);
  const sys = msgs[0].content, usr = msgs[1].content;
  const has = (name, hay, needle) => eq(name, hay.includes(needle), true);
  has('闭集写进 system', sys, 'move_to/1');
  has('arity 写进 system', sys, 'rest/0');
  has('禁自创写进 system', sys, '不许自创');
  has('人设进 user', usr, '有边界感的咖啡店主');
  // 需求按 key 名升序（不靠对象键序）——同引擎 lowestNeed 的口径。
  has('需求升序', usr, 'energy=10 mood=40');
  has('同区在场者进 user', usr, 'mor');
  has('记忆来源进 user', usr, '来源intent');

  console.info(fail === 0 ? '\n[selftest] 全过' : `\n[selftest] ${fail} 条失败`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv.includes('--selftest')) selftest();
else serve();
