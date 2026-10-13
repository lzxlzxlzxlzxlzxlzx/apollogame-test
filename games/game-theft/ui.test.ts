// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { mountUI, renderNode, validateLayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { DEFAULT_THEFT_CONFIG } from './config.js';
import { projectTheftView } from './project.js';
import { buildTheftScreen, THEFT_THEME, THEFT_TUTORIAL_OPEN_ACTION } from './ui.js';
import { THEFT_PRESS_ACTION, THEFT_REVEAL_ACTION, THEFT_WITHDRAW_ACTION, TheftGameSession } from './session.js';
import { mount as mountTheft } from './game-theft.js';

afterEach(() => vi.useRealTimers());

function walk(node: LayoutNode): LayoutNode[] { return [node, ...(node.children ?? []).flatMap(walk)]; }

describe('game-theft 双环翻格 UI', () => {
  const session = new TheftGameSession(DEFAULT_THEFT_CONFIG);
  const view = projectTheftView(DEFAULT_THEFT_CONFIG, session.state());
  const tree = buildTheftScreen(view);

  it('使用合法透明 LayoutNode 与 house 主题', () => {
    expect(validateLayoutNode(tree)).toEqual([]);
    expect(tree.props).toMatchObject({ center: true, fill: true, bg: 'transparent' });
    expect(THEFT_THEME.pageBg).toBe('transparent');
  });

  it('有 4+12 个不透明门位、唯一顶部暴露表、旋转指针 QTE 和常驻撤退', () => {
    const nodes = walk(tree);
    expect(nodes.filter((node) => /^theft-slot-\d+$/.test(node.id))).toHaveLength(16);
    expect(view.slots.filter((slot) => slot.ring === 'inner')).toHaveLength(4);
    expect(view.slots.filter((slot) => slot.ring === 'outer')).toHaveLength(12);
    expect(nodes.find((node) => node.id === 'theft-exposure-meter')?.props).toMatchObject({ max: 10_000 });
    expect((nodes.find((node) => node.id === 'theft-qte-dial')?.props as { skin?: string } | undefined)?.skin).toContain('theft-qte-dial.png');
    expect((nodes.find((node) => node.id === 'theft-qte-pointer')?.props as { skin?: string } | undefined)?.skin).toContain('theft-qte-pointer.png');
    expect(nodes.find((node) => node.id === 'theft-qte-pointer')?.layout?.rotate).toBeTypeOf('number');
    expect(nodes.find((node) => node.id === 'theft-qte-dial')?.layout?.rotate).toBe(0);
    expect(nodes.find((node) => node.id === 'theft-qte-hitbox')?.props).toMatchObject({ action: THEFT_PRESS_ACTION, focusRing: false });
    expect(nodes.find((node) => node.id === 'theft-qte-hitbox')?.layout).toMatchObject({ x: 200, y: 200, width: 124, height: 124 });
    expect(nodes.find((node) => node.id === 'theft-qte-label')).toBeUndefined();
    expect(nodes.find((node) => node.id === 'theft-slot-4')?.layout).toMatchObject({ x: 236, y: 47 });
    // 右侧嵌槽在原图中较外扩；逐格校准后 3 点位上/左修，不得退回规则圆。
    expect(nodes.find((node) => node.id === 'theft-slot-7')?.layout).toMatchObject({ x: 429, y: 233 });
    expect(nodes.find((node) => node.id === 'theft-slot-13')?.layout).toMatchObject({ x: 43, y: 233 });
    expect(nodes.find((node) => node.id === 'theft-slot-0')?.layout).toMatchObject({ x: 231, y: 127 });
    const blackSlot = view.slots.find((slot) => slot.state === 'black')!;
    const hiddenSlot = view.slots.find((slot) => slot.state === 'hidden')!;
    expect((nodes.find((node) => node.id === `theft-slot-${blackSlot.index}`)?.props as { skin?: string } | undefined)?.skin).toContain('theft-door-sealed-v2.png');
    expect((nodes.find((node) => node.id === `theft-slot-${blackSlot.index}`)?.props as { disabled?: boolean } | undefined)?.disabled).toBeUndefined();
    expect((nodes.find((node) => node.id === `theft-slot-${hiddenSlot.index}`)?.props as { skin?: string } | undefined)?.skin).toContain('theft-door-unopened.png');
    expect(nodes.some((node) => ['theft-title', 'theft-target', 'theft-risk-label', 'theft-difficulty-badge'].includes(node.id))).toBe(false);
    expect(nodes.some((node) => (node.props as { shape?: string }).shape === 'diamond')).toBe(false);
    expect(nodes.find((node) => node.id === 'theft-withdraw')?.props).toMatchObject({ action: THEFT_WITHDRAW_ACTION });
    expect(nodes.find((node) => node.id === 'theft-exposure-meter')?.props).toMatchObject({ barHeight: 34, fillGlow: true });
    expect((nodes.find((node) => node.id === 'theft-exposure-meter')?.props as { fillColor?: string } | undefined)?.fillColor).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    expect(nodes.find((node) => node.id === 'theft-exposure-meter')?.layout).toMatchObject({ width: 426, height: 34 });
    expect(nodes.find((node) => node.id === 'theft-floating-frame')?.layout).toMatchObject({ y: -42 });
    expect(nodes.find((node) => node.id === 'theft-slot-0')?.layout?.z).toBeGreaterThan(nodes.find((node) => node.id === 'theft-qte-hitbox')?.layout?.z ?? 0);
  });

  it('完美 QTE 在持续转盘阶段存入开门机会，并只给隐藏非黑位挂带参数的具名动作', () => {
    session.state().qteTick = session.state().qteIdealTick;
    session.enqueueAction(THEFT_PRESS_ACTION); session.tick();
    const revealTree = buildTheftScreen(projectTheftView(DEFAULT_THEFT_CONFIG, session.state()));
    const buttons = walk(revealTree).filter((node) => /^theft-slot-\d+$/.test(node.id));
    const actionable = buttons.filter((node) => (node.props as { action?: string }).action === THEFT_REVEAL_ACTION);
    expect(actionable.length).toBe(16 - DEFAULT_THEFT_CONFIG.difficulty.blackSlotCount);
    expect(actionable.every((node) => typeof (node.props as { actionArg?: string }).actionArg === 'string')).toBe(true);
    const html = renderNode(revealTree, THEFT_THEME);
    expect(html).toContain('data-action="theft.reveal"');
    expect(walk(revealTree).filter((node) => /^theft-reveal-key-\d+$/.test(node.id))).toHaveLength(1);
  });

  it('中盘使用原生 Button 命中层，确保点击进入具名 QTE action', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const calls: string[] = [];
    const cleanup = mountUI(host, tree, {}, THEFT_THEME, { enqueueAction: (name) => calls.push(name) });
    (host.querySelector('#theft-qte-hitbox') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(calls).toEqual([THEFT_PRESS_ACTION]);
    cleanup(); host.remove();
  });

  it('首次引导暂盖顶部非交互装饰区，首个校准后收起，问号可随时重新打开', () => {
    vi.useFakeTimers();
    const tutorialNodes = walk(buildTheftScreen(view));
    expect(tutorialNodes.find((node) => node.id === 'theft-tutorial-copy')?.props).toMatchObject({
      text: '点击中央区域或按下空格进行校准，获得钥匙\n使用钥匙打开锁住的大门，在暴露值满之前撤退',
      font: 'ui', size: 'lg', bold: true,
    });
    expect(tutorialNodes.find((node) => node.id === 'theft-tutorial-card')?.layout).toMatchObject({ x: 58, y: 146, width: 504, height: 82, z: 8 });
    expect(tutorialNodes.find((node) => node.id === 'theft-tutorial-open')?.props).toMatchObject({ action: THEFT_TUTORIAL_OPEN_ACTION });
    expect(validateLayoutNode(buildTheftScreen(view))).toEqual([]);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const cleanup = mountTheft(host);
    expect(host.querySelector('#theft-tutorial-card')).not.toBeNull();
    (host.querySelector('#theft-qte-hitbox') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(host.querySelector('#theft-tutorial-card')).toBeNull();
    (host.querySelector('#theft-tutorial-open') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(host.querySelector('#theft-tutorial-card')).not.toBeNull();
    cleanup(); host.remove();
  });

  it('结果只在指针周围使用圆形脉冲光环，不回退成方形闪光', () => {
    const flashTree = buildTheftScreen({ ...view, qteFlashTone: 'gold' });
    const nodes = walk(flashTree);
    expect(nodes.find((node) => node.id === 'theft-qte-result-aura')?.props).toMatchObject({ shape: 'pill' });
    expect(nodes.find((node) => node.id === 'theft-qte-result-aura')?.layout?.fx).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'pulse', color: 'gold', once: true }),
    ]));
  });

  it('取得物品时从同一门位坐标弹出，并飞向底部战利品托盘', () => {
    const flightTree = buildTheftScreen({
      ...view,
      lootFlight: { entryId: 'silver-watch', slotIndex: 4, imageUrl: 'https://cdn.example/silver-watch.png' },
    });
    const flight = walk(flightTree).find((node) => node.id === 'theft-loot-flight-silver-watch');
    expect(flight?.type).toBe('Image');
    expect(flight?.props).toMatchObject({ src: 'https://cdn.example/silver-watch.png' });
    expect(flight?.layout).toMatchObject({ x: 239, y: 50, flyTo: { to: 'theft-loot-bag', ms: 900, arc: 92 } });
  });

  it('底部托盘只陈列取得物品图，不再烘焙名称或空状态文字', () => {
    const trayTree = buildTheftScreen({
      ...view,
      acquiredLoot: [{ entryId: 'silver-watch', displayName: '银质怀表', imageUrl: 'https://cdn.example/silver-watch.png' }],
    });
    const nodes = walk(trayTree);
    expect(nodes.find((node) => node.id === 'theft-loot-silver-watch')?.props).toMatchObject({ src: 'https://cdn.example/silver-watch.png' });
    expect(nodes.some((node) => ['theft-loot-title', 'theft-loot-list'].includes(node.id))).toBe(false);
  });

  it('真实入口在下一固定 tick 结算：指针停 0.5 秒，但顶部暴露持续增长', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cleanup = mountTheft(host);

    (host.querySelector('#theft-qte-hitbox') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(host.querySelector('#theft-preview-state-label')).toBeNull();

    vi.advanceTimersByTime(20);
    expect(host.querySelector('#theft-preview-state-label')).toBeNull();
    const frozenAngle = (host.querySelector('#theft-qte-pointer') as HTMLElement).style.transform;
    const frozenExposureWidth = Number((host.querySelector('#theft-exposure-meter > div > div') as HTMLElement).style.width.replace('%', ''));
    vi.advanceTimersByTime(400);
    expect((host.querySelector('#theft-qte-pointer') as HTMLElement).style.transform).toBe(frozenAngle);
    const advancingExposureWidth = Number((host.querySelector('#theft-exposure-meter > div > div') as HTMLElement).style.width.replace('%', ''));
    expect(advancingExposureWidth).toBeGreaterThan(frozenExposureWidth);
    vi.advanceTimersByTime(120);
    const resumedAngle = (host.querySelector('#theft-qte-pointer') as HTMLElement).style.transform;
    expect(resumedAngle).not.toBe(frozenAngle);
    const degrees = Number((resumedAngle.match(/rotate\((-?\d+)/) ?? [])[1]);
    // QTE 是引擎内的确定性暂停，恢复后只允许前进刚恢复的几帧；风险则独立持续累计。
    expect(Math.abs(degrees)).toBeLessThan(40);
    cleanup(); host.remove();
  });

  it('空格以同一个具名 action 触发 QTE，不干扰鼠标门位 action', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cleanup = mountTheft(host);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(20);
    expect(host.querySelector('#theft-preview-state-label')).toBeNull();
    // 首次空格须直接进入同一 QTE 结算路径，不依赖先点击中盘获得焦点。
    expect(host.querySelector('#theft-qte-result-aura')).not.toBeNull();
    cleanup(); host.remove();
  });

  it('终局以磨砂结算层展示成功、暴露或逃跑；无所得明确写一无所获', () => {
    const settlementTree = buildTheftScreen(view, {}, {
      outcome: 'escaped', title: '逃跑', receipt: { type: 'RiskRevealReceipt', sessionId: 'test', status: 'withdrew', acquiredIds: [], revealedSlots: [], riskBp: 0, elapsedTicks: 20, qteAttempts: 1, perfectQtes: 1 },
    });
    const nodes = walk(settlementTree);
    expect(nodes.find((node) => node.id === 'theft-settlement-scrim')?.props).toMatchObject({ bare: true });
    expect((nodes.find((node) => node.id === 'theft-settlement-scrim')?.props as { glass?: boolean }).glass).toBeUndefined();
    expect(nodes.find((node) => node.id === 'theft-settlement-title')?.props).toMatchObject({ text: '逃跑', font: 'cnbrush', size: 58, color: 'text' });
    expect((nodes.find((node) => node.id === 'theft-settlement-title')?.props as { glow?: boolean }).glow).toBeUndefined();
    expect(nodes.find((node) => node.id === 'theft-settlement-caption')?.props).toMatchObject({ font: 'ui', size: 'lg', color: 'text' });
    expect(nodes.find((node) => node.id === 'theft-settlement-hint')?.props).toMatchObject({ font: 'ui', size: 'md', color: 'sub' });
    expect(nodes.find((node) => node.id === 'theft-settlement-empty')?.props).toMatchObject({ text: '一无所获', font: 'ui', bold: true, color: 'text' });
    expect(validateLayoutNode(settlementTree)).toEqual([]);
  });

  it('终局先展示结算层，展示完成后才向嵌入宿主回传回执', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const complete = vi.fn();
    const cleanup = mountTheft(host, { onComplete: complete });
    (host.querySelector('#theft-withdraw') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    vi.advanceTimersByTime(20);
    expect(host.querySelector('#theft-settlement-scrim')).not.toBeNull();
    expect(complete).not.toHaveBeenCalled();
    // 终局在首个 60Hz tick（约 16ms）才生成，所以补足到结算计时器的 2.8 秒前一刻。
    vi.advanceTimersByTime(2_779);
    expect(complete).not.toHaveBeenCalled();
    // interval 的首拍会落在 16.66ms 网格上；越过该网格与 2.8 秒展示窗后才允许回传。
    vi.advanceTimersByTime(40);
    expect(complete).toHaveBeenCalledTimes(1);
    cleanup(); host.remove();
  });

  it('挂载时主动聚焦可访问舞台，首个空格无需先用鼠标点中盘', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cleanup = mountTheft(host);
    expect(host.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(host);
    cleanup(); host.remove();
  });
});
