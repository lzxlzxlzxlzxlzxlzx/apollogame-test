import { apolloOnyx } from '@zerocraft/engine/ui/components/apollo-kit.js';
import type { LayoutNode, UITheme } from '@zerocraft/engine/ui/components/index.js';
import type { ChestInput, ChestResultData, ItemNode } from './chest.js';

export const CHEST_CLAIM_ACTION = 'chest.claim';
export type ChestOpeningPhase = 'closed' | 'opening' | 'revealed';
export const CHEST_THEME: UITheme = {
  ...apolloOnyx,
  // DokiWorld iframe 必须透出宿主场景；宝箱与奖励卡各自仍保留局部面板皮肤。
  pageBg: 'transparent',
  texture: '',
  wash: '',
  jade: '#f0a63d', jadeWash: 'rgba(240,166,61,.18)', jadeLine: 'rgba(255,215,126,.58)',
  gold: '#ffd978', text: '#fff4d6', sub: '#d3af79', dim: '#8f765e',
};

export const CHEST_SKIN_KEYS = {
  closed: 'game-loot-chest/texture/chest-closed',
  open: 'game-loot-chest/texture/chest-open',
} as const;

export const CHEST_SKIN_MAP: ReadonlyMap<string, string> = new Map([
  [CHEST_SKIN_KEYS.closed, './assets/treasure-chest.png'],
  [CHEST_SKIN_KEYS.open, './assets/treasure-chest-open.png'],
]);

function skinSrc(key: string): string {
  const src = CHEST_SKIN_MAP.get(key);
  if (!src) throw new Error(`Missing chest skin: ${key}`);
  return src;
}

function chestStage(phase: ChestOpeningPhase): LayoutNode {
  const closed = phase === 'closed';
  const opening = phase === 'opening';
  return {
    type: 'Panel', id: 'chest-stage',
    props: { bare: true },
    layout: {
      width: 520, height: 330, allowOverlap: true,
    },
    children: [
      {
        type: 'Image', id: 'chest-image',
        props: { src: skinSrc(closed ? CHEST_SKIN_KEYS.closed : CHEST_SKIN_KEYS.open), alt: closed ? '即将开启的宝箱' : opening ? '正在开启的宝箱' : '已开启的宝箱', fit: 'contain' },
        layout: {
          x: 0, y: 0, width: 520, height: 280, allowOverlap: true,
          anim: opening ? 'pop' : closed ? 'float' : undefined,
          animMs: opening ? 760 : closed ? 1400 : undefined,
          ...(opening ? { fx: [{ kind: 'flash', color: 'gold', ms: 620, once: true }, { kind: 'glow', color: 'gold', ms: 900 }] } : {}),
        },
      },
      ...(closed || opening ? [{
        type: 'Particles' as const, id: 'chest-opening-stars', props: { kind: 'stars' as const, count: 26, loop: false, color: '#ffd978' },
        layout: { x: 42, y: 8, width: 436, height: 264, allowOverlap: true },
      }] : []),
      ...(closed || opening ? [{
        type: 'Panel' as const, id: 'chest-stage-copy', props: { bg: 'sunken' as const, edge: 'gold' as const, shadow: { y: 5, color: 'ink' as const } },
        layout: { x: 40, y: 286, width: 440, direction: 'column' as const, gap: 6, padding: 10, align: 'center' as const, radius: 16 },
        children: [{ type: 'Label' as const, id: 'opening-copy', props: { text: opening ? '宝箱正在开启……' : '宝箱即将开启……', size: 28, color: 'gold' as const, bold: true, stroke: true }, layout: { anim: 'pop' } }],
      }] : []),
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
  phase: ChestOpeningPhase,
  result: ChestResultData | undefined,
  display: ReadonlyMap<string, ItemNode>,
  claimStatus: 'idle' | 'sent-host' | 'sent-preview' = 'idle',
): LayoutNode {
  const revealed = phase === 'revealed' && result !== undefined;
  const rewardColumns = revealed ? Math.max(1, Math.min(result.rewards.length, 4)) : 1;
  const rewardGridWidth = Math.min(680, rewardColumns * 174);
  return {
    type: 'Screen', id: 'chest-root', props: { center: true, fill: true, bg: { custom: 'transparent' } },
    layout: { direction: 'column', gap: 8, padding: 10, align: 'center', justify: 'center' },
    children: [
      { type: 'Label', id: 'chest-title', props: { text: input.chest?.name ?? '神秘宝箱', size: 38, color: 'gold', bold: true, stroke: true }, layout: { anim: 'slideUp', animMs: 360 } },
      chestStage(phase),
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
