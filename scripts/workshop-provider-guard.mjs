// scripts/workshop-provider-guard.mjs —— 「测试供应商不许静默产出所有人的游戏」回归钉
// （owner 2026-08-26 实证：工作台里每个游戏启动都是同一个「一个可控方块 + 三个平台方块」）。
//
// 病根链：mock provider 对**任何** prompt 都回同一份内置 manifest（platformer 预设）；
// 而工作台 ① `provider()` 的兜底 `provs.find(p => p.keyAvailable)` 能选中它
//        ② `providerChips` 又把 mock 从界面上**过滤掉** ⇒ 选中了也看不见
//        ③ 生成响应与卡带卡片都不带任何「这是测试样例」的字样
// ⇒ 作者只看到「所有游戏长得一模一样」，界面上找不到任何线索。
//
// 三腿（②③ 是真跑逻辑不是搜字符串）：
//   ① 兜底不许落 mock（把 provider() 从 HTML 里抠出来真执行）
//   ② mock 是当前默认时 chips 必须显形（同上·真执行 filter 表达式）
//   ③ mock 造的卡带卡片打标（meta.provider==='mock' → 状态「Mock 样例」）
// 用法：node scripts/workshop-provider-guard.mjs（退出码 0=绿）
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(ROOT, 'workshop/index.dc.html'), 'utf8');
let pass = 0, fail = 0;
const check = (ok, name, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

// ── ① provider() 真执行 ──────────────────────────────────────────────
const m = src.match(/\n  provider\(\) \{\n([\s\S]*?)\n  \}\n/);
if (!m) { console.log('  ✗ 抠不出 provider()（函数签名变了？）'); process.exit(1); }
// eslint-disable-next-line no-new-func
const provider = new Function('state', m[1].replace(/this\.state/g, 'state'));
const mk = (list, dflt) => ({ settings: { providers: list.map((id) => ({ id, keyAvailable: true })), default: dflt } });
check(provider(mk(['mock'], null)) !== 'mock',
  '① 只有 mock 可用时，兜底也不选它（回真供应商/明确报错，而不是产假货）',
  `实得 ${provider(mk(['mock'], null))}`);
check(provider(mk(['qwen', 'mock'], null)) === 'qwen', '① 有真供应商时选真的');
check(provider(mk(['claude-code', 'mock'], null)) === 'claude-code', '① claude-code 优先不变（零回归）');
check(provider(mk(['qwen', 'mock'], 'mock')) === 'mock', '① 作者**明确指定** mock 仍照办（不越权替人决定）');

// ── ② mock 是当前默认时 chips 必须显形 ────────────────────────────────
const fm = src.match(/const providerChips = provs\.filter\((.*?)\)\.map/);
check(!!fm, '② 抠得出 providerChips 的 filter');
if (fm) {
  // eslint-disable-next-line no-new-func
  const f = new Function('p', 'curProv', `return (${fm[1]})(p);`);
  check(f({ id: 'mock' }, 'mock') === true, '② mock 正是当前默认 → 显形（否则原因在界面上永远看不见）');
  check(f({ id: 'mock' }, 'qwen') === false, '② 不是默认时仍不摆上货架（它是测试基建·零噪音）');
  check(f({ id: 'qwen' }, 'qwen') === true, '② 真供应商照常显示');
}

// ── ③ mock 造的卡带卡片打标 ───────────────────────────────────────────
check(/cc\.meta\.provider === 'mock'/.test(src), '③ 卡片按 meta.provider 判 mock');
check(/'Mock 样例'/.test(src) && /Mock 测试样例（非真生成）/.test(src), '③ 状态徽章 + 简介都点名「非真生成」');
check(/const STATUS_ORDER = \[[^\]]*'Mock 样例'/.test(src), '③ 状态筛选 chip 认得这个状态');

// ── ④ 服务端：走 mock 的生成响应必须自报家门 ────────────────────────────
// （②③ 守的是界面，这一腿守的是**接口**——任何调用方都读得到，不依赖某个壳记得显示。）
try {
  const out = execFileSync('python3', ['-c', `
import sys, json
sys.path.insert(0, ${JSON.stringify(ROOT)})
from main_entry.generate_api import handle_generate
a = handle_generate({'provider': 'mock', 'prompt': '随便什么题材', 'autofix': False})
b = handle_generate({'provider': 'anthropic', 'prompt': 'x'})
print(json.dumps({'mockFlag': a.get('mock'), 'mockOk': a.get('success'), 'realHasFlag': 'mock' in b}))
`], { env: { ...process.env, ZEROCRAFT_MOCK_LLM: '1' }, encoding: 'utf8' });
  const r = JSON.parse(out.trim().split('\n').pop());
  check(r.mockOk === true, '④ mock 生成本身仍可用（测试基建不许被误伤）');
  check(r.mockFlag === true, '④ 走 mock 的响应带 mock:true（调用方据此明示"这是固定样例"）');
  check(r.realHasFlag === false, '④ 非 mock 不带这面旗（不误报）');
} catch (e) {
  check(false, '④ 服务端 mock 盖章', String(e && e.message).slice(0, 160));
}

console.log(`\nWORKSHOP-PROVIDER-GUARD: ${fail === 0 ? 'PASS' : 'FAIL'} (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
