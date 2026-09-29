import { apolloOnyx } from '@zerocraft/engine/ui/components/apollo-kit.js';
import type { LayoutNode, UITheme } from '@zerocraft/engine/ui/components/index.js';
import type { ChestInput, ChestResultData, ItemNode } from './chest.js';
import type { ChestQteSnapshot } from './qte-session.js';
import {
  QTE_ASSIST_AFTER_MISSES,
  QTE_ASSIST_END,
  QTE_ASSIST_START,
  QTE_ATTEMPT_ACTION,
  QTE_START_ACTION,
  QTE_WINDOW_END,
  QTE_WINDOW_START,
} from './qte-blueprint.js';

export const CHEST_CLAIM_ACTION = 'chest.claim';
export const CHEST_THEME: UITheme = {
  ...apolloOnyx,
  pageBg: 'radial-gradient(circle at 50% 38%, rgba(116,55,20,.82) 0%, rgba(31,13,34,.94) 43%, #070611 78%)',
  texture: 'repeating-linear-gradient(45deg, rgba(255,210,120,.025) 0 1px, transparent 1px 13px)',
  wash: 'radial-gradient(circle at 50% 45%, rgba(255,153,44,.13), transparent 42%)',
  jade: '#f0a63d', jadeWash: 'rgba(240,166,61,.18)', jadeLine: 'rgba(255,215,126,.58)',
  gold: '#ffd978', text: '#fff4d6', sub: '#d3af79', dim: '#8f765e',
};

export const CHEST_SKIN_KEYS = {
  closed: 'game-loot-chest/texture/chest-closed',
  open: 'game-loot-chest/texture/chest-open',
  qteDial: 'game-loot-chest/texture/qte-dial-face',
  qteNeedle: 'game-loot-chest/texture/qte-needle',
} as const;

export const CHEST_SKIN_MAP: ReadonlyMap<string, string> = new Map([
  [CHEST_SKIN_KEYS.closed, './assets/treasure-chest.png'],
  [CHEST_SKIN_KEYS.open, './assets/treasure-chest-open.png'],
  [CHEST_SKIN_KEYS.qteDial, './assets/ai/openai/qte-dial-face.png'],
  [CHEST_SKIN_KEYS.qteNeedle, './assets/ai/openai/qte-needle.png'],
]);

function skinSrc(key: string): string {
  const src = CHEST_SKIN_MAP.get(key);
  if (!src) throw new Error(`Missing chest skin: ${key}`);
  return src;
}

function lockMarks(locks: number): LayoutNode {
  return {
    type: 'Panel', id: 'qte-lock-marks', props: { bare: true },
    layout: { direction: 'row', gap: 18, align: 'center', justify: 'center' },
    children: [0, 1, 2].map((index) => ({
      type: 'Panel' as const,
      id: `qte-lock-${index}`,
      props: { bg: index < locks ? 'gold-sheen' : 'raised', edge: 'gold', shape: 'diamond' as const },
      layout: {
        width: 30, height: 30, radius: 4,
        ...(index < locks ? { anim: 'pop', animMs: 220, fx: [{ kind: 'glow' as const, color: 'gold' as const, ms: 900 }] } : {}),
      },
    })),
  };
}

function qteOverlay(qte: ChestQteSnapshot): LayoutNode {
  const assisted = qte.misses >= QTE_ASSIST_AFTER_MISSES;
  const start = assisted ? QTE_ASSIST_START : QTE_WINDOW_START;
  const end = assisted ? QTE_ASSIST_END : QTE_WINDOW_END;
  const span = end - start + 1;
  const angle = (qte.elapsed / qte.duration) * 360;
  return {
    type: 'Panel', id: 'qte-overlay', props: { bare: true },
    layout: { x: 128, y: 12, width: 264, height: 264, allowOverlap: true },
    children: [
      {
        type: 'Image', id: 'qte-dial-face',
        props: { src: skinSrc(CHEST_SKIN_KEYS.qteDial), alt: '鎏金蓝珐琅锁芯圆盘', fit: 'contain' },
        layout: { x: 0, y: 0, width: 264, height: 264, allowOverlap: true, fx: [{ kind: 'glow', color: 'gold', ms: 1200 }] },
      },
      {
        type: 'ProgressBar', id: 'qte-target-zone',
        props: { value: span, max: qte.duration, tone: 'gold', shape: 'ring', size: 180 },
        layout: { x: 42, y: 42, width: 180, height: 180, rotate: (start / qte.duration) * 360, allowOverlap: true, fx: [{ kind: 'glow', color: 'gold', ms: 950 }] },
      },
      {
        type: 'Panel' as const, id: 'qte-dial-center', props: { bg: 'sunken' as const, edge: 'gold' as const },
        layout: { x: 59, y: 59, width: 146, height: 146, radius: 73, allowOverlap: true },
      },
      {
        type: 'Panel', id: 'qte-needle-rotor', props: { bare: true },
        layout: { x: 0, y: 0, width: 264, height: 264, rotate: angle, allowOverlap: true },
        children: [{
          type: 'Image', id: 'qte-needle',
          props: { src: skinSrc(CHEST_SKIN_KEYS.qteNeedle), alt: '旋转的鎏金锁芯指针', fit: 'contain' },
          // 原图的圆形轴心在上、箭头尖在下；翻转后轴心贴住圆盘中心，箭头尖才朝外指向刻度。
          layout: { x: 91, y: -5, width: 82, height: 142, rotate: 180, allowOverlap: true, fx: [{ kind: 'glow', color: 'gold', ms: 620 }] },
        }],
      },
      {
        // 交互层必须压在逐帧替换的转子之上并保持 DOM 身份稳定；否则 pointerdown 后转子被替换，mouseup 不会合成 click。
        type: 'Panel', id: 'qte-hit-area', props: { bare: true, action: QTE_ATTEMPT_ACTION },
        // PUI debt: action Panel 的 layoutStyle 与 cursor:pointer 之间缺分号；margin:0 作为无副作用数据规避，见 requests.md。
        layout: { x: 0, y: 0, width: 264, height: 264, margin: 0, allowOverlap: true, press3d: true },
      },
    ],
  };
}

function chestStage(qte: ChestQteSnapshot): LayoutNode {
  const playing = qte.phase === 'playing';
  const opening = qte.phase === 'opening';
  const revealed = qte.phase === 'revealed';
  const assisted = qte.misses >= QTE_ASSIST_AFTER_MISSES;
  const instruction = qte.attempts === 0 || qte.feedback === 'idle'
    ? '指针进入金色区域时点击'
    : qte.feedback === 'hit'
      ? '解锁成功！准备下一枚封印'
      : assisted
        ? '锁芯已稳定，再试一次'
        : '偏离判定区，再试一次';
  return {
    type: 'Panel', id: 'chest-stage',
    props: {
      bare: true,
      ...(qte.phase === 'ready' ? { action: QTE_START_ACTION } : playing ? { action: QTE_ATTEMPT_ACTION } : {}),
    },
    layout: {
      // 同 qte-overlay：margin:0 只用于避免共享 Panel action 样式接缝吞掉 height。
      width: 520, height: revealed ? 330 : 430, margin: 0, allowOverlap: true,
      ...(qte.phase === 'ready' || playing ? { press3d: true } : {}),
    },
    children: [
      {
        type: 'Image', id: 'chest-image',
        props: { src: skinSrc(opening || revealed ? CHEST_SKIN_KEYS.open : CHEST_SKIN_KEYS.closed), alt: opening || revealed ? '已开启的宝箱' : '待开启的宝箱', fit: 'contain' },
        layout: {
          x: 0, y: 0, width: 520, height: 280, allowOverlap: true,
          anim: opening ? 'pop' : qte.feedback === 'miss' && qte.attempts > 0 ? 'shake' : qte.phase === 'ready' ? 'float' : undefined,
          animMs: opening ? 760 : qte.feedback === 'miss' ? 220 : 2400,
          ...(opening ? { fx: [{ kind: 'flash', color: 'gold', ms: 620, once: true }, { kind: 'glow', color: 'gold', ms: 900 }] } : {}),
        },
      },
      ...(playing ? [qteOverlay(qte)] : []),
      ...(opening ? [{
        type: 'Particles' as const, id: 'chest-opening-stars', props: { kind: 'stars' as const, count: 26, loop: false, color: '#ffd978' },
        layout: { x: 42, y: 8, width: 436, height: 264, allowOverlap: true },
      }] : []),
      ...(revealed ? [] : [{
        type: 'Panel' as const, id: 'chest-stage-copy', props: { bg: 'sunken' as const, edge: 'gold' as const, shadow: { y: 5, color: 'ink' as const } },
        layout: { x: 40, y: 286, width: 440, direction: 'column' as const, gap: 6, padding: 10, align: 'center' as const, radius: 16 },
        children: playing
          ? [
              lockMarks(qte.locks),
              {
                type: 'Label' as const, id: 'qte-instruction', props: { text: instruction, size: 28, color: 'text' as const, bold: true, stroke: true },
              },
              { type: 'Label' as const, id: 'qte-key-hint', props: { text: '点击宝箱  /  按空格键', size: 20, color: 'text' as const, bold: true } },
            ]
          : qte.phase === 'ready'
            ? [{ type: 'Label' as const, id: 'ready-instruction', props: { text: '点击宝箱开始开锁', size: 26, color: 'text' as const, bold: true, stroke: true }, layout: { fx: [{ kind: 'pulse' as const, color: 'gold' as const, ms: 1300 }] } }]
            : opening
              ? [{ type: 'Label' as const, id: 'opening-copy', props: { text: '封印解除……', size: 28, color: 'gold' as const, bold: true, stroke: true }, layout: { anim: 'pop' } }]
              : [],
      }]),
    ],
  };
}

function rewardCard(reward: ChestResultData['rewards'][number], spec: ItemNode | undefined, index: number): LayoutNode {
  const art = spec?.image?.src
    ? { type: 'Image' as const, id: `reward-art-${index}`, props: { src: spec.image.src, alt: spec.image.alt ?? spec.name ?? reward.itemId, fit: 'contain' as const }, layout: { width: 72, height: 72 } }
    : { type: 'Label' as const, id: `reward-fallback-${index}`, props: { text: reward.itemId === 'gold' ? '✦' : '◆', size: 46, color: 'gold', bold: true }, layout: { fx: [{ kind: 'glow' as const, color: 'gold' as const, ms: 1200 }] } };
  return {
    type: 'Panel', id: `reward-${index}`, props: { bg: 'raised', edge: 'gold', shadow: { y: 5, color: 'ink' } },
    layout: { minCol: 138, direction: 'column', gap: 7, padding: 14, align: 'center', justify: 'center', radius: 18, anim: 'dealIn', animDelay: index * 90, animMs: 420, tilt3d: true },
    children: [
      art,
      { type: 'Label', id: `reward-name-${index}`, props: { text: spec?.name ?? reward.itemId, size: 'md', color: 'text', bold: true } },
      { type: 'Badge', id: `reward-quantity-${index}`, props: { text: `×${reward.quantity}`, tone: 'gold' } },
    ],
  };
}

export function buildChestScreen(
  input: ChestInput,
  qte: ChestQteSnapshot,
  result: ChestResultData | undefined,
  display: ReadonlyMap<string, ItemNode>,
  claimStatus: 'idle' | 'sent-host' | 'sent-preview' = 'idle',
): LayoutNode {
  const revealed = qte.phase === 'revealed' && result !== undefined;
  const rewardColumns = revealed ? Math.max(1, Math.min(result.rewards.length, 4)) : 1;
  const rewardGridWidth = Math.min(680, rewardColumns * 174);
  return {
    type: 'Screen', id: 'chest-root', props: { center: true, fill: true, bg: { custom: 'transparent' } },
    layout: { direction: 'column', gap: 8, padding: 10, align: 'center', justify: 'center' },
    children: [
      { type: 'Label', id: 'chest-title', props: { text: input.chest?.name ?? '神秘宝箱', size: 38, color: 'gold', bold: true, stroke: true }, layout: { anim: 'slideUp', animMs: 360 } },
      chestStage(qte),
      ...(revealed ? [{
        type: 'Panel' as const, id: 'reward-grid', props: { bare: true },
        layout: { width: rewardGridWidth, maxWidth: 680, direction: 'grid' as const, cols: rewardColumns, minCol: 150, gap: 12, align: 'stretch' as const },
        children: result.rewards.map((reward, index) => rewardCard(reward, display.get(reward.itemId), index)),
      }, {
        type: 'Button' as const, id: 'claim-button', props: {
          label: claimStatus === 'sent-host' ? '已领取' : claimStatus === 'sent-preview' ? '预览完成' : '全部领取',
          kind: 'hero' as const,
          action: CHEST_CLAIM_ACTION,
          disabled: claimStatus !== 'idle',
        },
        layout: { width: 176, height: 54, press3d: true, fx: [{ kind: 'sheen-hover' as const, color: 'gold' as const }] },
      }, {
        type: 'Particles' as const, id: 'reward-particles', props: { kind: 'sparkle' as const, count: 20, loop: true, color: '#ffd978' },
        layout: { x: 0, y: 0, width: 1, height: 1, allowOverlap: true },
      }] : []),
    ],
  };
}

export function buildChestErrorScreen(message: string, sessionId?: string): LayoutNode {
  return {
    type: 'Screen', id: 'chest-error-root', props: { center: true, fill: true, bg: { custom: 'transparent' } },
    layout: { padding: 24, align: 'center', justify: 'center' },
    children: [{
      type: 'Panel', id: 'chest-error-card', props: { bg: 'blood', edge: 'danger', shadow: { y: 7, color: 'ink' } },
      layout: { width: 520, maxWidth: 520, direction: 'column', gap: 12, padding: 28, radius: 22, anim: 'shake', animMs: 340 },
      children: [
        { type: 'Badge', id: 'chest-error-mark', props: { text: '!', tone: 'danger' } },
        { type: 'Label', id: 'chest-error-title', props: { text: '宝箱无法开启', size: 'xxl', color: 'text', bold: true } },
        { type: 'Label', id: 'chest-error-copy', props: { text: '本次开箱参数无效，未产生任何掉落。', size: 'md', color: 'sub' } },
        { type: 'Label', id: 'chest-error-detail', props: { text: message, size: 'sm', color: 'warn', mono: true } },
        ...(sessionId ? [{ type: 'Label' as const, id: 'chest-error-session', props: { text: `会话：${sessionId}`, size: 'xs' as const, color: 'dim' as const } }] : []),
      ],
    }],
  };
}
