// scripts/ui-walkthrough-probe.test.mjs —— REQ-RENDERCHECK R2b 自检：
//   ① classifyStep（剧本步骤三态分类·纯函数）
//   ② signalArgForClick（args→单值 data-arg 可表达性判定·纯函数）
//   ③ findMatchingAction（活体动作清单匹配·纯函数·喂假清单）
//   ④ summarizeWalk / aggregateSummaries（UI 可驱动率算法·纯函数）
//   ⑤ interpretUiWalkthrough（game-pipeline.mjs S4 门怎么读探针退出码·纯函数）
//   ⑥ CLI 用法错 / 无浏览器降级（不起真浏览器·快车道纪律）
//
// 真起服+真浏览器走查一整个游戏（对 game-a 8 场剧本跑一轮）是本单交付的**手动核证**动作
// （回报里附退出码/UI 可驱动率/逐剧本结果），不进本文件常跑的自动化套件——同 R1/R3 既有先例
// （render-probe.test.mjs ①注释）：产物会写真游戏的 public/games/<slug>/probe/**（噪声递增+拖慢
// 日常跑测），故拆开：读码/匹配/汇总逻辑用纯函数单测钉死（下方①-⑤），真连通性用一次性手动验证。
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  classifyStep, signalArgForClick, findMatchingAction, summarizeWalk, aggregateSummaries,
} from './ui-walkthrough-probe.mjs';
import { interpretUiWalkthrough } from './game-pipeline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'ui-walkthrough-probe.mjs');

// ═══ ① classifyStep（剧本步骤三态分类·不碰 DOM/浏览器）═══
describe('classifyStep（signal/tick/expect 三态·纯函数）', () => {
  it('tick 步骤 → kind=tick（装配/时间推进类·非「动作」）', () => {
    expect(classifyStep({ tick: 3 })).toEqual({ kind: 'tick' });
  });
  it('expect 步骤 → kind=expect + 断言条数（非「动作」）', () => {
    expect(classifyStep({ expect: [{ res: 'hp', eq: 10 }, { flag: 'dead', eq: false }] })).toEqual({ kind: 'expect', count: 2 });
  });
  it('signal 步骤 → kind=signal 透传 signal/args/by', () => {
    expect(classifyStep({ signal: 'play', args: { cards: [1, 2] }, by: 'hero' }))
      .toEqual({ kind: 'signal', signal: 'play', args: { cards: [1, 2] }, by: 'hero' });
  });
  it('signal 步骤无 args/by → 透传 undefined（非报错·非空对象兜底）', () => {
    const r = classifyStep({ signal: 'next-round' });
    expect(r.kind).toBe('signal'); expect(r.signal).toBe('next-round');
    expect(r.args).toBeUndefined(); expect(r.by).toBeUndefined();
  });
});

// ═══ ② signalArgForClick（args → dispatch() 认的单值 data-arg·纯函数）═══
describe('signalArgForClick（结构性能否化成一次点击的单值参）', () => {
  it('无 args → ok:true，arg:undefined（点击无需 data-arg）', () => {
    expect(signalArgForClick(undefined)).toEqual({ ok: true, arg: undefined });
  });
  it('空对象 args → ok:true，arg:undefined', () => {
    expect(signalArgForClick({})).toEqual({ ok: true, arg: undefined });
  });
  it('单键原始值 args（字符串/数字/布尔）→ ok:true，arg=String(值)', () => {
    expect(signalArgForClick({ arg: 'east' })).toEqual({ ok: true, arg: 'east' });
    expect(signalArgForClick({ n: 3 })).toEqual({ ok: true, arg: '3' });
    expect(signalArgForClick({ on: true })).toEqual({ ok: true, arg: 'true' });
  });
  it('多键 args → ok:false（结构非单值·非原子点击可表达）', () => {
    const r = signalArgForClick({ a: 1, b: 2 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('非单值');
  });
  it('单键但值为数组（如 game-a play 的 args.cards）→ ok:false（多选合成操作·非一次点击）', () => {
    const r = signalArgForClick({ cards: [14, 27] });
    expect(r.ok).toBe(false);
  });
  it('单键但值为嵌套对象 → ok:false', () => {
    expect(signalArgForClick({ target: { x: 1 } }).ok).toBe(false);
  });
});

// ═══ ③ findMatchingAction（活体动作清单匹配·喂假清单·不起浏览器）═══
describe('findMatchingAction（__zcProbe.actions() 快照 → 匹配 signal(+arg)）', () => {
  const live = [
    { action: 'menu.start', arg: undefined, uiId: 'btn-start', disabled: false },
    { action: 'select.difficulty', arg: 'l2', uiId: 'seg-l2', disabled: false },
    { action: 'select.difficulty', arg: 'l3', uiId: 'seg-l3', disabled: true }, // 禁用
    { action: 'hand.toggle', arg: '0', uiId: 'card-0', disabled: false },
  ];
  it('action+arg 都对 → 命中该控件', () => {
    const m = findMatchingAction(live, 'select.difficulty', 'l2');
    expect(m).toHaveLength(1);
    expect(m[0].uiId).toBe('seg-l2');
  });
  it('action 对但 arg 不对 → 不命中', () => {
    expect(findMatchingAction(live, 'select.difficulty', 'l9')).toHaveLength(0);
  });
  it('禁用控件（disabled:true）即便 action+arg 都对也不命中', () => {
    expect(findMatchingAction(live, 'select.difficulty', 'l3')).toHaveLength(0);
  });
  it('剧本 signal 字面量在活体 DOM 里压根不存在 → 空清单（不是驱动器 bug·是词表不重合）', () => {
    expect(findMatchingAction(live, 'play-round', undefined)).toEqual([]);
  });
  it('arg=undefined（无需 arg 的信号）→ 只按 action 名匹配', () => {
    expect(findMatchingAction(live, 'menu.start', undefined)).toHaveLength(1);
  });
  it('空/缺失活体清单 → 空数组（不抛错）', () => {
    expect(findMatchingAction([], 'menu.start', undefined)).toEqual([]);
    expect(findMatchingAction(undefined, 'menu.start', undefined)).toEqual([]);
  });
});

// ═══ ④ summarizeWalk / aggregateSummaries（UI 可驱动率算法·纯函数）═══
describe('summarizeWalk（只数 signal 步骤入分母·tick/expect 不算「动作」）', () => {
  it('3 个 signal(2 驱动 1 未驱动) + 1 tick + 1 expect → drivenSteps=2/2signalSteps=3·rate=2/3', () => {
    const steps = [
      { kind: 'tick', driven: false },
      { kind: 'signal', driven: true },
      { kind: 'signal', driven: true },
      { kind: 'signal', driven: false },
      { kind: 'expect', driven: false },
    ];
    const s = summarizeWalk(steps);
    expect(s).toMatchObject({ totalSteps: 5, signalSteps: 3, drivenSteps: 2, tickSteps: 1, expectSteps: 1 });
    expect(s.uiDrivableRate).toBeCloseTo(2 / 3, 10);
  });
  it('零 signal 步骤（纯 tick/expect 剧本）→ rate 约定=1（无东西可驱动≠驱动失败）', () => {
    const s = summarizeWalk([{ kind: 'tick', driven: false }, { kind: 'expect', driven: false }]);
    expect(s.signalSteps).toBe(0);
    expect(s.uiDrivableRate).toBe(1);
  });
  it('全部 signal 步骤零驱动 → rate=0', () => {
    const s = summarizeWalk([{ kind: 'signal', driven: false }, { kind: 'signal', driven: false }]);
    expect(s.uiDrivableRate).toBe(0);
  });
});
describe('aggregateSummaries（多剧本合计）', () => {
  it('跨剧本累加 signalSteps/drivenSteps → 合计 rate 按总数算(非逐剧本平均)', () => {
    const a = summarizeWalk([{ kind: 'signal', driven: true }, { kind: 'signal', driven: true }]); // 2/2
    const b = summarizeWalk([{ kind: 'signal', driven: false }, { kind: 'signal', driven: false }]); // 0/2
    const total = aggregateSummaries([a, b]);
    expect(total.signalSteps).toBe(4); expect(total.drivenSteps).toBe(2);
    expect(total.uiDrivableRate).toBeCloseTo(0.5, 10); // 4 步总平均 0.5·非 (1+0)/2 的逐剧本平均
  });
  it('空数组 → rate=1（同零分母约定）', () => {
    expect(aggregateSummaries([]).uiDrivableRate).toBe(1);
  });
});

// ═══ ⑤ interpretUiWalkthrough（game-pipeline.mjs S4 门读探针退出码·纯函数）═══
describe('interpretUiWalkthrough（S4 门怎么读 UI 走查探针退出码）', () => {
  it('探针 exit 0 → 门绿·summary 带「UI 走查过」', () => {
    const r = interpretUiWalkthrough('walkthrough 绿（3 tests）· 验收剧本 8 场景绿', 0, '');
    expect(r.exit).toBe(0);
    expect(r.summary).toContain('UI 走查过');
  });
  it('探针 exit 3（环境无浏览器）→ 门仍绿（不算红）·summary 明确标注「未跑·环境无浏览器」', () => {
    const r = interpretUiWalkthrough('base', 3, '');
    expect(r.exit).toBe(0);
    expect(r.summary).toContain('未跑');
    expect(r.summary).toContain('环境无浏览器');
  });
  it('探针 exit 1（真出错：装载失败/驱动点击后控制台 error/零剧本）→ 门红', () => {
    const r = interpretUiWalkthrough('base', 1, '✗ 装载失败');
    expect(r.exit).toBe(1);
    expect(r.summary).toContain('✗ UI 走查未过');
    expect(r.summary).toContain('装载失败');
  });
  it('探针非常规退出码（如 137·被 kill）同样门红（非白名单一律红）', () => {
    expect(interpretUiWalkthrough('base', 137, '').exit).toBe(1);
  });
  // 2026-09-17 换机制不换意图。原钉法是 `interpretUiWalkthrough.length === 3`——拿**参数个数**
  // 当「低可驱动率不判红」的证据。意图完全正确且保留，但参数个数不是那条不变量本身：
  // 判词现在要把率显示出来（此前 game108 板上挂 ✓、产物里躺着 0/74·量了不用还显绿），
  // 因此多收一个 rate 参数，数参数个数当场误报。改成**直接断言那条不变量**：不论率是多少，
  // 只要探针退出码是 0，门就绿——比数参数严（数参数拦不住「收了 rate 又拿它判红」）。
  it('低 UI 可驱动率不是这里的判红依据——任何率下 exit 恒随探针退出码（防手滑拿百分比当阈值）', () => {
    for (const rate of [0, 0.01, 0.5, 1, undefined, Number.NaN]) {
      expect(interpretUiWalkthrough('base', 0, '', rate).exit).toBe(0);   // 率再低也不在这里判红
      expect(interpretUiWalkthrough('base', 1, 'boom', rate).exit).toBe(1); // 红只由探针退出码来
    }
    // 率要显示出来（不许再退回一个干净的 ✓·那正是 game108 挂着绿灯的原因）
    expect(interpretUiWalkthrough('base', 0, '', 0).summary).toContain('0%');
    expect(interpretUiWalkthrough('base', 0, '', 0).summary).toContain('零可驱动');
  });
});

// ═══ ⑥ CLI 用法错 / 无浏览器降级（不起真浏览器·快车道纪律）═══
describe('CLI 用法校验（退出码 2·不碰浏览器）', () => {
  it('缺 --game → 退出码 2', () => {
    const r = spawnSync(process.execPath, [CLI], { encoding: 'utf8', timeout: 10000 });
    expect(r.status).toBe(2);
  });
  it('未知 slug（三处均无该游戏）→ 退出码 2', () => {
    const r = spawnSync(process.execPath, [CLI, '--game', 'totally-not-a-real-game-xyz'], { encoding: 'utf8', timeout: 10000 });
    expect(r.status).toBe(2);
  });
});
describe('无浏览器优雅降级（PATH 遮蔽 + 覆盖显式路径 → 退出码 3·同 R1/R3 语义）', () => {
  it('game-a（真实存在的游戏）+ 双探测路都落空 → 退出码 3（不算失败）', () => {
    const r = spawnSync(process.execPath, [CLI, '--game', 'game-a'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '/nonexistent-bin-dir-for-path-shadow-test', RENDER_PROBE_CHROMIUM: '/nonexistent/chrome-does-not-exist' },
      timeout: 15000,
    });
    expect(r.status).toBe(3);
    const out = JSON.parse(r.stdout.trim());
    expect(out.ok).toBe(false);
    expect(out.code).toBe('NO_BROWSER');
  });
});

// ═══ 假信心自查（REQ-RENDERCHECK R2b 施工纪律·点名要求）═══
// 仪式：把 findMatchingAction 短路成「不管清单/参数对不对，恒当命中」→ 上面 ③ 的
// 「action 对但 arg 不对」「禁用控件不命中」「压根没这个 signal」三条断言必须转红（假信心失能的证据）；
// 复原后重跑全绿。本次真跑过（非纸面描述）——过程记录随施工回报一并交（撤掉短路即转红，是本条自查
// 的可执行证明；下方固定断言把「短路后会漏判」的数学前提钉死，供后人重放核对，同 render-probe.test.mjs
// 的「假信心自查」小节先例）。
describe('假信心自查·短路语义（钉死「恒当命中」为什么是假信心）', () => {
  it('若 findMatchingAction 被短路成恒真（不看 action/arg/disabled 直接回填一条假匹配），则「不存在的 signal」' +
     '也会被判成可驱动——这正是三条断言（arg 不对/disabled/压根没这 signal）要拦住的假阳性', () => {
    const live = [{ action: 'menu.start', arg: undefined, uiId: 'x', disabled: false }];
    // 真实现：老实报「没有」。（原有"短路版对照组"两行删于测试加固批 2026-08-24——
    // 对本地字面量断非空=恒真，不测任何被测物，恰是本 describe 要杜绝的假信心形状。）
    expect(findMatchingAction(live, 'this-signal-does-not-exist-anywhere', undefined)).toEqual([]);
  });
});
