import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { apolloBrocade } from '@zerocraft/engine/ui/components/apollo-kit.js';
import { END_TURN_ACTION, PLAY_CARD_ACTION } from './blueprint.js';
import { RhetoricDuelSession, type RhetoricSnapshot } from './session.js';

function duelScreen(state: RhetoricSnapshot): LayoutNode {
  const result = state.phase === 'victory' ? '论证成立' : state.phase.startsWith('defeat') ? '交锋失利' : undefined;
  return {
    type: 'Screen', id: 'rhetoric-duel', props: { fill: true },
    layout: { direction: 'column', gap: 14, padding: 24 },
    children: [
      { type: 'Particles', id: 'rhetoric-ambience', props: { kind: 'sparkle', count: 14, loop: true } },
      { type: 'Panel', id: 'rhetoric-title', props: { edge: 'gold', bg: 'raised', shadow: { y: 4, color: 'ink' } }, layout: { direction: 'column', gap: 4, padding: 16 }, children: [
        { type: 'Label', id: 'rhetoric-name', props: { text: '言弹交锋', font: 'serif', size: 'xxxl', bold: true, color: 'gold' } },
        { type: 'Label', id: 'rhetoric-phase', props: { text: result ?? '旧巷之门 · 以论证打开巷门', size: 'md', color: result ? 'danger' : 'sub' } },
      ] },
      { type: 'Panel', id: 'rhetoric-stats', props: { bare: true }, layout: { direction: 'row', gap: 12 }, children: [
        { type: 'ProgressBar', id: 'rhetoric-progress', props: { label: '论证进度', value: state.progress, max: 10, tone: 'jade' } },
        { type: 'ProgressBar', id: 'rhetoric-pressure', props: { label: '压力', value: state.pressure, max: 10, tone: 'danger' } },
        { type: 'Badge', id: 'rhetoric-focus', props: { text: `专注 ${state.focus}` as string, tone: 'gold' } },
        { type: 'Badge', id: 'rhetoric-turns', props: { text: `回合 ${state.turns + 1}/4` as string, tone: 'jade' } },
      ] },
      { type: 'Panel', id: 'rhetoric-hand', props: { title: '手牌', edge: 'jade', bg: 'raised' }, layout: { direction: 'row', gap: 10, padding: 14 }, children: state.hand.map((cardId, index) => ({
        type: 'Button' as const, id: `rhetoric-card-${index}-${cardId}`,
        props: { label: cardId, kind: 'primary' as const, action: PLAY_CARD_ACTION, actionArg: cardId },
        layout: { fx: [{ kind: 'sheen-hover' as const }], press3d: true },
      })) },
      { type: 'Button', id: 'rhetoric-end-turn', props: { label: '结束回合', kind: 'hero', action: END_TURN_ACTION }, layout: { fx: [{ kind: 'sheen-hover' }], press3d: true } },
    ],
  };
}

/** Internal launcher entry. UI only queues actions; identity-card-play owns card resolution. */
export function mount(container: HTMLElement): () => void {
  const session = new RhetoricDuelSession();
  const ui = mountUI(container, duelScreen(session.snapshot()), {}, apolloBrocade, session.input);
  let active = true;
  const update = (): void => {
    if (!active) return;
    session.tick();
    ui.update(duelScreen(session.snapshot()));
    requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
  return () => { active = false; ui(); };
}
