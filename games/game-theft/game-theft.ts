import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { loadGameArtOverrides } from '@zerocraft/engine/assets/index.js';
import { DEFAULT_THEFT_CONFIG } from './config.js';
import { projectTheftView } from './project.js';
import { TheftGameSession } from './session.js';
import { buildTheftScreen, THEFT_THEME, THEFT_TUTORIAL_OPEN_ACTION, type TheftSettlementView } from './ui.js';
import { THEFT_SKINS, theftSkinUrl, type TheftSkinMap } from './assets.js';
import type { TheftView } from './project.js';
import type { TheftGameConfig } from './config.js';
import type { RiskRevealReceipt } from '@zerocraft/engine/engine/protocol/components.js';

export interface TheftMountOptions {
  /** 壳层返回钩子；本游戏当前未消费，但需兼容统一游戏启动合同。 */
  readonly exit?: () => void;
  readonly config?: TheftGameConfig;
  readonly onComplete?: (receipt: RiskRevealReceipt) => void;
}

/** 结算是表现层阶段：规则回执已经固定，展示完才交给嵌入宿主结束本局。 */
function settlementFrom(receipt: RiskRevealReceipt): TheftSettlementView {
  if (receipt.status === 'exposed') return { outcome: 'exposed', title: '暴露', receipt };
  return receipt.acquiredIds.length > 0
    ? { outcome: 'success', title: '成功', receipt }
    : { outcome: 'escaped', title: '逃跑', receipt };
}

/** 本地可玩入口：宿主只驱动固定 tick 并转交具名 action，所有判定留在 capability。 */
export function mount(container: HTMLElement, options: TheftMountOptions = {}): () => void {
  const config = options.config ?? DEFAULT_THEFT_CONFIG;
  const session = new TheftGameSession(config);
  let skins: TheftSkinMap = {};
  let active = true;
  let frozenView: TheftView | undefined;
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  let lootFlightTimer: ReturnType<typeof setTimeout> | undefined;
  let lootFlight: TheftView['lootFlight'];
  let seenAcquiredIds = new Set(session.state().acquiredIds ?? []);
  let seenQteAttempts = session.state().qteAttempts ?? 0;
  let seenQtePressInputs = 0;
  let pendingPressFeedback = '';
  let render: (view?: TheftView) => void = () => {};
  let settlement: TheftSettlementView | undefined;
  let tutorialVisible = true;
  let settlementTimer: ReturnType<typeof setTimeout> | undefined;
  let reported = false;
  const actionSink = {
    enqueueAction(name: string, value?: { arg?: string }): void {
      // 引导属于纯 UI 表现，重新打开不应进入 session 输入队列、更不能改变确定性结果。
      if (name === THEFT_TUTORIAL_OPEN_ACTION) {
        if (!settlement) {
          tutorialVisible = true;
          render();
        }
        return;
      }
      // 反馈停帧期间不接收额外 QTE；规则层仍持续推进风险，并由 capability 锁住 QTE 刻度。
      if (name === 'theft.qte.press' && frozenView) return;
      // 任意一次已接收的校准都会让首次引导退出，释放转盘与门位的完整可视区域。
      if (name === 'theft.qte.press') tutorialVisible = false;
      session.enqueueAction(name, value);
      if (name === 'theft.qte.press') {
        // 先给出“已收到”的纯表现确认；下一固定 tick 再以权威结果替换它。
        pendingPressFeedback = '输入已接收 · 正在判定';
        render({ ...projectTheftView(config, session.state()), statusText: pendingPressFeedback });
      }
    },
  };
  const ui = mountUI(
    container,
    buildTheftScreen(projectTheftView(config, session.state()), skins, undefined, tutorialVisible),
    {},
    THEFT_THEME,
    actionSink,
  );
  render = (view = projectTheftView(config, session.state())): void => {
    // 视觉只回放刚按下的指针/金区；风险、门和战利品永远从本 tick 的权威状态取值。
    const feedbackView = frozenView
      ? {
        ...view,
        qteAngleDeg: frozenView.qteAngleDeg,
        qteTargetAngleDeg: frozenView.qteTargetAngleDeg,
        qteInPerfectRange: frozenView.qteInPerfectRange,
        qteFlashTone: frozenView.qteFlashTone,
      }
      : view;
    ui.update(
    buildTheftScreen(
      lootFlight && feedbackView.lootFlight === undefined ? { ...feedbackView, lootFlight } : feedbackView,
      skins,
      settlement,
      tutorialVisible,
    ),
    THEFT_THEME,
    );
  };
  // 嵌入 iframe 的首个 Space 可能先触发已聚焦 Button 的浏览器默认行为。捕获阶段直接投递同一个
  // 具名 action 并阻止默认 click，保证第一下和鼠标 QTE 完全等价、不会双重结算。
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' || event.repeat || settlement) return;
    event.preventDefault();
    event.stopPropagation();
    actionSink.enqueueAction('theft.qte.press');
  };
  // DokiWorlds 的 iframe 初始焦点可能停在宿主的“返回”按钮上。让游戏舞台可程序化聚焦，
  // 并在 mount 后再补一次，避免玩家的第一下 Space 被宿主吞掉。
  container.tabIndex = -1;
  const claimKeyboardFocus = (): void => {
    if (!active) return;
    container.focus({ preventScroll: true });
    window.focus();
  };
  claimKeyboardFocus();
  requestAnimationFrame(claimKeyboardFocus);
  // document 捕获比只挂 window 更靠近 iframe 文档的实际事件路径，仍只投递一个具名 action。
  document.addEventListener('keydown', onKeyDown, true);
  void loadGameArtOverrides('game-theft').then((next) => {
    if (!active || Object.keys(next).length === 0) return;
    skins = next;
    render();
  });
  const timer = setInterval(() => {
    const before = projectTheftView(config, session.state());
    session.tick();
    const next = session.state();
    const newlyAcquired = (next.acquiredIds ?? []).find((entryId) => !seenAcquiredIds.has(entryId));
    seenAcquiredIds = new Set(next.acquiredIds ?? []);
    if (newlyAcquired) {
      const item = config.items.find((candidate) => candidate.entryId === newlyAcquired);
      const slotIndex = next.slotTargetIds?.findIndex((entryId) => entryId === newlyAcquired) ?? -1;
      if (item && slotIndex >= 0) {
        // 图可由调用方 imageUrl 覆盖；缺省消费登记过的演示资产。动画本身是纯 UI 表现，不写回 sim。
        lootFlight = { entryId: newlyAcquired, slotIndex, imageUrl: item.imageUrl ?? theftSkinUrl(skins, THEFT_SKINS.demoLoot) };
        if (lootFlightTimer) clearTimeout(lootFlightTimer);
        lootFlightTimer = setTimeout(() => {
          lootFlight = undefined;
          if (active) render();
        }, 980);
      }
    }
    const qtePressInputs = session.inputs.filter((input) => input.action === 'qte-press').length;
    const playerPressed = qtePressInputs > seenQtePressInputs;
    seenQtePressInputs = qtePressInputs;
    if (playerPressed) pendingPressFeedback = '';
    // 仅表现层回看：规则已经在固定 tick 内结算，冻结的是刚刚结算的投影，不把墙钟带进 sim。
    if ((next.qteAttempts ?? 0) > seenQteAttempts && playerPressed) {
      seenQteAttempts = next.qteAttempts ?? 0;
      const settled = projectTheftView(config, next);
      // 用按下前一帧的角度回放指针/金区，用结算后的状态文字显示判定结果。
      frozenView = {
        ...settled,
        qteAngleDeg: before.qteAngleDeg,
        qteTargetAngleDeg: before.qteTargetAngleDeg,
        qteInPerfectRange: before.qteInPerfectRange,
        qteFlashTone: next.lastQtePenaltyBp === 0 ? 'gold' : 'danger',
      };
      render();
      if (pauseTimer) clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => {
        frozenView = undefined;
        if (active) render();
      }, 500);
    } else {
      seenQteAttempts = next.qteAttempts ?? 0;
      render();
    }
    const receipt = session.receipt();
    if (receipt) {
      clearInterval(timer);
      // 回执的值在这一刻已经不可变；只延迟宿主回传，不让 UI 动画参与任何游戏判定。
      settlement = settlementFrom(receipt);
      frozenView = undefined;
      render();
      settlementTimer = setTimeout(() => {
        if (!active || reported) return;
        reported = true;
        options.onComplete?.(receipt);
      }, 2_800);
    }
  }, 1_000 / 60);
  render();
  return () => { active = false; clearInterval(timer); document.removeEventListener('keydown', onKeyDown, true); if (pauseTimer) clearTimeout(pauseTimer); if (lootFlightTimer) clearTimeout(lootFlightTimer); if (settlementTimer) clearTimeout(settlementTimer); ui(); };
}
