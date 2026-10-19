// click-probe 单测（REQ-S3CLICK·owner 2026-08-07 判 A）
//
// 同 render-probe.test.mjs 的既有惯例：**只测纯函数读码**，不起浏览器、不碰真仓库状态。
// 真连通性（起 vite + 真 Chromium + 真点）由跑 `node scripts/click-probe.mjs --game <slug>`
// 手动核证，交付回报里附退出码；硬塞进日常套件会每次 npm test 都重写真游戏的 probe 产物。
//
// 本文件钉死的是**门到底会不会红**——这正是本单最容易做假的地方：
// 施工过程中两版判据都「看起来在检查、实测撤修照绿」（整页快照被倒计时污染 / textContent
// 让噪声顺祖先链爬满全树 / 注释里的 resolveBindings 被当成调用），全靠撤修验红逮出来。
import { describe, it, expect } from 'vitest';
import { interpretClickProbe, interpretCanvasClickProbe, canvasClickTargets, canvasClientPoint, validateCompiledCanvasFixture, interpretCompiledCanvasProbe, checkBindWiring, requiresEngineInputEvidence, LEGACY_WAIVED } from './click-probe.mjs';
import { interpretClickGate } from './game-pipeline.mjs';

const base = { slug: 'gx', controls: 3, changed: 2, consoleErrors: [], waived: undefined };

describe('click-probe · 判词（interpretClickProbe）', () => {
  it('点得动 → 过', () => {
    expect(interpretClickProbe(base).exit).toBe(0);
  });

  it('**全点了一遍 DOM 一处没变 → 红**（本门存在的理由：输入接线整条断了）', () => {
    const v = interpretClickProbe({ ...base, changed: 0 });
    expect(v.exit).toBe(1);
    expect(v.summary).toMatch(/一处都没变/);
    expect(v.summary).toMatch(/Engine\.step/); // 判词要能直接指路，不能只说"失败"
  });

  it('一个可驱动控件都没有 → 红（UI 完全不可驱动）', () => {
    expect(interpretClickProbe({ ...base, controls: 0 }).exit).toBe(1);
  });

  it('点击过程报控制台 error → 红', () => {
    const v = interpretClickProbe({ ...base, consoleErrors: ['boom'] });
    expect(v.exit).toBe(1);
    expect(v.summary).toMatch(/boom/);
  });

  it('点击被遮挡或超时，即使别的 DOM 在变也不能判绿', () => {
    const v = interpretClickProbe({ ...base, clickFailures: 1 });
    expect(v.exit).toBe(1);
    expect(v.summary).toMatch(/未能真实点击/);
  });

  it('有 Engine 输入源时，本地菜单变了但无真实动作经 Engine.step 必须红', () => {
    const v = interpretClickProbe({ ...base, changed: 2, engineRequired: true, engineMatched: 0 });
    expect(v.exit).toBe(1);
    expect(v.summary).toMatch(/Engine\.step/);
    expect(interpretClickProbe({ ...base, engineRequired: true, engineMatched: 1 }).exit).toBe(0);
  });

  it('只对显式 new Engine({ input }) 宿主加权威输入要求；旧式无输入源战斗不误红', () => {
    expect(requiresEngineInputEvidence([{ text: 'const e = new Engine({ input: queue });' }])).toBe(true);
    expect(requiresEngineInputEvidence([{ text: 'const e = new Engine({ input });' }])).toBe(true);
    expect(requiresEngineInputEvidence([{ text: 'const e = new Engine(); e.start();' }])).toBe(false);
    expect(requiresEngineInputEvidence([{ text: '// new Engine({ input: queue })\nconst e = new Engine();' }])).toBe(false);
  });

  it('豁免的存量游戏不判红，但**实测数照实写进判词**（豁免≠不跑≠不留证）', () => {
    const v = interpretClickProbe({ ...base, changed: 0, waived: 'owner 不回溯' });
    expect(v.exit).toBe(0);
    expect(v.waived).toBe(true);
    expect(v.summary).toMatch(/0 个点后 DOM 有变化/);
  });

  it('豁免名单只含存量游戏——**game108 及以后的新游戏必须受检**（owner 2026-08-07 口径）', () => {
    expect(LEGACY_WAIVED.game108).toBeUndefined();
    expect(Object.keys(LEGACY_WAIVED).length).toBeGreaterThan(0);
    for (const reason of Object.values(LEGACY_WAIVED)) expect(reason).toMatch(/不回溯/); // 每条都得写理由
  });
});

describe('click-probe · bind 接线静态检查（checkBindWiring）', () => {
  const f = (path, text) => ({ path, text });

  it('用了 bind 且真调了 resolveBindings → 过', () => {
    expect(checkBindWiring([
      f('a/screen.ts', "props: { bind: 'hp' }"),
      f('a/host.ts', 'const t = resolveBindings(tree, ds);'),
    ]).ok).toBe(true);
  });

  it('**用了 bind 却没人调 resolveBindings → 红**（bind 必然是哑弹）', () => {
    const r = checkBindWiring([f('a/screen.ts', "props: { bind: 'hp' }")]);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/哑弹/);
    expect(r.detail).toMatch(/resolveBindings\(tree, dataSource\)/); // 判词带修法
  });

  it('**注释里提一句 resolveBindings 不算调用**（实测被这么骗过一次）', () => {
    const r = checkBindWiring([
      f('a/screen.ts', "props: { bind: 'hp' }"),
      f('a/host.ts', '// 记得跑 resolveBindings(tree, ds)\n/* 或者 resolveBindings(x) */\nconst t = tree;'),
    ]);
    expect(r.ok).toBe(false);
  });

  it('压根没用 bind 的游戏 → 过（不强推 bind）', () => {
    expect(checkBindWiring([f('a/screen.ts', "props: { text: 'hi' }")]).ok).toBe(true);
  });
});

describe('Canvas 卡带点击门（具名 Signal 真入世界）', () => {
  const manifest = { entities: {
    inside: { Transform: { x: 40, y: 30 }, Shape: { width: 20, height: 20 }, Clickable: { action: 'inspect.inside' } },
    outside: { Transform: { x: 400, y: 300 }, Shape: { width: 20, height: 20 }, Clickable: { action: 'inspect.outside' } },
    masked: { Transform: { x: 20, y: 20 }, Shape: { width: 20, height: 20 }, Clickable: { action: 'inspect.masked', hitMaskKey: 'art:mask' } },
  } };
  it('只选 Canvas 内可见 Shape 中心；不把遮罩包围盒当真实命中', () => {
    expect(canvasClickTargets(manifest, 100, 80)).toEqual([{ id: 'inside', action: 'inspect.inside', x: 40, y: 30 }]);
  });
  it('具名 Signal 精确命中才绿；零候选/零命中/控制台错误均红', () => {
    const base = { candidates: 1, hits: [{ id: 'inside', action: 'inspect.inside', signalMatched: true }], consoleErrors: [] };
    expect(interpretCanvasClickProbe(base).exit).toBe(0);
    expect(interpretCanvasClickProbe({ ...base, hits: [{ ...base.hits[0], signalMatched: false }] }).exit).toBe(1);
    expect(interpretCanvasClickProbe({ ...base, candidates: 0, hits: [] }).exit).toBe(1);
    expect(interpretCanvasClickProbe({ ...base, consoleErrors: ['boom'] }).exit).toBe(1);
    expect(interpretCanvasClickProbe({ ...base, transparentExpected: true, transparentChecked: 0 }).exit).toBe(1);
    expect(interpretCanvasClickProbe({ ...base, transparentExpected: true, transparentChecked: 1, transparentFailures: 1 }).exit).toBe(1);
    expect(interpretCanvasClickProbe({ ...base, transparentExpected: true, transparentChecked: 1, transparentFailures: 0 }).exit).toBe(0);
  });
  it('逻辑点按画布盒缩放映射到不同 CSS 视口，绝不直接用原图像素当 client 坐标', () => {
    const point = { x: 400, y: 300 };
    expect(canvasClientPoint({ left: 10, top: 20, width: 800, height: 600, logicalWidth: 800, logicalHeight: 600 }, point)).toEqual({ x: 410, y: 320 });
    expect(canvasClientPoint({ left: 30, top: 50, width: 400, height: 300, logicalWidth: 800, logicalHeight: 600 }, point)).toEqual({ x: 230, y: 200 });
  });
});

describe('编译游戏 Canvas 真手势门', () => {
  const fixture = { version: 1, canvasSelector: '#scene canvas', logicalWidth: 1440, logicalHeight: 900,
    gestures: [{ device: 'mouse', kind: 'drag', from: [100, 100], to: [200, 200],
      expect: { input: { key: 'drag', phase: 'drag' }, visible: { selector: '#progress', before: '1 /', after: '2 /' } } }] };
  it('夹具必须声明可命中画布、真手势、引擎动作和玩家可见变化；零控件无夹具仍由 DOM 门判红', () => {
    expect(validateCompiledCanvasFixture(fixture)).toBe(fixture);
    expect(() => validateCompiledCanvasFixture({ ...fixture, gestures: [] })).toThrow();
    expect(() => validateCompiledCanvasFixture({ ...fixture, gestures: [{ ...fixture.gestures[0], expect: { action: 'add.herb' } }] })).toThrow();
    expect(interpretClickProbe({ ...base, controls: 0 }).exit).toBe(1);
  });
  it('Canvas 每个手势都须可达、经 Engine.step 且可见变化；不能用背景动画冒充', () => {
    const hit = { reachable: true, inputMatched: true, visibleChanged: true };
    expect(interpretCompiledCanvasProbe({ gestures: [hit], consoleErrors: [] }).exit).toBe(0);
    for (const key of ['reachable', 'inputMatched', 'visibleChanged'])
      expect(interpretCompiledCanvasProbe({ gestures: [{ ...hit, [key]: false }], consoleErrors: [] }).exit).toBe(1);
    expect(interpretCompiledCanvasProbe({ gestures: [], consoleErrors: [] }).exit).toBe(1);
    expect(interpretCompiledCanvasProbe({ gestures: [hit], consoleErrors: ['boom'] }).exit).toBe(1);
  });
});

describe('S3 门读码（interpretClickGate）', () => {
  it('点击门过 → 门过，摘要接在渲染摘要后面', () => {
    const v = interpretClickGate('渲染过', 0, '[click-probe] gx ✓ 点击打穿（3 个控件）');
    expect(v.exit).toBe(0);
    expect(v.summary).toMatch(/渲染过/);
    expect(v.summary).toMatch(/点击打穿/);
    expect(v.summary).not.toMatch(/\[click-probe\]/); // 前缀已剥掉，判词干净
    expect(v.summary.match(/点击打穿/g)).toHaveLength(1); // **不许套娃**（实测出过「✓点击打穿（✓点击打穿（…」）
  });

  it('点击门红 → **门红**（不许被渲染门的绿盖过去）', () => {
    const v = interpretClickGate('渲染过', 1, '一处都没变');
    expect(v.exit).toBe(1);
    expect(v.summary).toMatch(/一处都没变/);
  });

  it('环境无浏览器（3）→ 不算红（同 R1/R3 语义）', () => {
    expect(interpretClickGate('渲染过', 3, '').exit).toBe(0);
  });
});
