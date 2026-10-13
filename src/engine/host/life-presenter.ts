import type { IWorld } from '../core/types.js';
import type {
  LifeActionResult,
  LifeActivityContext,
  LifeCalendar,
  LifeCalendarAdvanceResult,
  LifeDialogueSession,
  LifeFarmActionResult,
  LifeGatherActionResult,
  LifeGiftActionResult,
  LifeHarvestActionResult,
  LifeInteractionAffordance,
  LifePlantActionResult,
  LifePosition,
  LifeQuestProjection,
  LifeRelationshipProjection,
  LifeScene,
  LifeSelectedItem,
  LifeSelectedTarget,
  LifeTalkActionResult,
  LifeTimeAdvanceResult,
  Transform,
  LifeWarpResult,
  LifeWarp,
  State,
  Text,
} from '../protocol/components.js';
import type { Inventory } from '../../skills/tier2/inventory.js';
import type { DialogueScript } from '../../skills/tier3/dialogue.js';
import { optionAvailable } from '../../skills/tier3/dialogue.js';
import type { DialogueSource } from '../../ui/components/index.js';
import { resolveLifePose } from '../protocol/life-pose.js';

export interface LifeHostViewModel {
  readonly scene: string;
  readonly x: number;
  readonly y: number;
  /** Continuous player footpoint in tile units; render-only consumers never write it back. */
  readonly poseX: number;
  readonly poseY: number;
  readonly date: string;
  readonly slot: string;
  readonly placeLabel: string;
  readonly canInteract: boolean;
  readonly interactionSummary: string;
  readonly inventory: readonly { itemId: string; count: number }[];
  readonly allowedActions: readonly string[];
  readonly nearby: readonly string[];
  readonly nearbyWarps: readonly string[];
  /** Player-facing labels for current-scene warp affordances, keyed by warp id. */
  readonly warpLabels?: Readonly<Record<string, string>>;
  readonly affordances: readonly LifeInteractionAffordance[];
  readonly selectedItem?: string;
  readonly selectedTarget?: string;
  readonly results: Readonly<Record<string, string>>;
  readonly dialogue?: string;
  readonly dialogueActive?: boolean;
  readonly dialogueTarget?: string;
  readonly dialogueKind?: 'line' | 'choice' | 'check';
  readonly dialogueTerminal?: boolean;
  readonly dialogueOptions?: readonly { index: number; label: string; available: boolean }[];
  readonly objective: string;
  readonly relationships: readonly { npcId: string; value: number; levelId: string; levelTitle: string }[];
}

const ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  till: '翻土', water: '浇水', plant: '播种', harvest: '收获', forage: '采集', fish: '垂钓', mine: '采矿', buy: '购买', talk: '交谈', gift: '送礼', build: '建造', warp: '通行',
});

/** Stable fallback for authored identifiers; it never special-cases content ids. */
export function humanizeLifeId(id: string): string {
  const tail = id.split(':').at(-1) ?? id;
  return tail.split(/[._-]+/u).filter(Boolean).map((part) => /^[a-z]/u.test(part) ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part).join(' ') || id;
}

export function lifeResultFeedback(results: Readonly<Record<string, string>>): string | undefined {
  const rejected = results.warp?.startsWith('rejected') ? ['warp', results.warp] as const : Object.entries(results).find(([, value]) => value.startsWith('rejected'));
  return rejected ? `${humanizeLifeId(rejected[0])}: ${humanizeLifeId(rejected[1])}` : undefined;
}

export function createLifeDialogueSource(world: IWorld): DialogueSource {
  return {
    current(entityId) {
      const script = world.getComponent<DialogueScript>(entityId, 'DialogueScript');
      const state = world.getComponent<State>(entityId, 'State');
      const node = script && state ? script.nodes[state.current] : undefined;
      if (!node) return undefined;
      if (node.kind === 'line') return { kind: 'line', speaker: node.speaker, text: node.text, emotion: node.emotion };
      if (node.kind === 'choice') return { kind: 'choice', speaker: node.speaker, text: node.prompt, emotion: node.emotion, options: node.options.map((option) => ({ label: option.text, available: optionAvailable(world, option) })) };
      return { kind: 'check', speaker: node.speaker, text: node.prompt, emotion: node.emotion };
    },
  };
}

/** Pure, read-only host projection. All eligibility comes from engine-owned affordances. */
export function selectLifeHostView(world: IWorld, priorResults: Readonly<Record<string, string>> = {}): LifeHostViewModel {
  const player = world.getComponent<LifePosition>('life:player', 'LifePosition');
  if (!player) throw new Error('Life host requires life:player/LifePosition');
  const pose = resolveLifePose(player, world.getComponent<Transform>('life:player', 'Transform'));
  const calendar = world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar');
  const bag = world.getComponent<Inventory>('life:player', 'Inventory');
  const context = world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext');
  const item = world.getComponent<LifeSelectedItem>('life:player', 'LifeSelectedItem');
  const target = world.getComponent<LifeSelectedTarget>('life:player', 'LifeSelectedTarget');
  const pairs: readonly [string, unknown][] = [
    ['action', world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')],
    ['farm', world.getComponent<LifeFarmActionResult>('life:player', 'LifeFarmActionResult')],
    ['plant', world.getComponent<LifePlantActionResult>('life:player', 'LifePlantActionResult')],
    ['harvest', world.getComponent<LifeHarvestActionResult>('life:player', 'LifeHarvestActionResult')],
    ['gather', world.getComponent<LifeGatherActionResult>('life:player', 'LifeGatherActionResult')],
    ['talk', world.getComponent<LifeTalkActionResult>('life:player', 'LifeTalkActionResult')],
    ['calendar', world.getComponent<LifeCalendarAdvanceResult>('life:calendar', 'LifeCalendarAdvanceResult')],
    ['time', world.getComponent<LifeTimeAdvanceResult>('life:calendar', 'LifeTimeAdvanceResult')],
    ['warp', world.getComponent<LifeWarpResult>('life:player', 'LifeWarpResult')],
    ['gift', world.getComponent<LifeGiftActionResult>('life:player', 'LifeGiftActionResult')],
  ];
  const results: Record<string, string> = { ...priorResults };
  for (const [name, result] of pairs) {
    if (result && typeof result === 'object' && 'status' in result) {
      const value = result as { status: string; reason?: string };
      results[name] = `${value.status}${value.reason ? `:${value.reason}` : ''}`;
    }
  }
  const dialogueEntity = 'life:dialogue-session:player';
  const text = world.getComponent<Text>(dialogueEntity, 'Text');
  const dialogueSession = world.getComponent<LifeDialogueSession>(dialogueEntity, 'LifeDialogueSession');
  const dialogueScript = world.getComponent<DialogueScript>(dialogueEntity, 'DialogueScript');
  const dialogueState = world.getComponent<State>(dialogueEntity, 'State');
  const dialogueNode = dialogueScript && dialogueState ? dialogueScript.nodes[dialogueState.current] : undefined;
  const dialogue = createLifeDialogueSource(world).current(dialogueEntity);
  const activeQuest = world.getComponent<LifeQuestProjection>('life:quest-projection', 'LifeQuestProjection')?.entries.find((entry) => entry.state === 'active');
  const relationshipProjection = world.getComponent<LifeRelationshipProjection>('life:relationship-projection', 'LifeRelationshipProjection');
  const affordances = context?.affordances ?? [];
  const scenes = new Map<string, LifeScene>();
  for (const [entityId] of world.query('LifeScene')) {
    const scene = world.getComponent<LifeScene>(entityId, 'LifeScene');
    if (scene) scenes.set(scene.sceneId, scene);
  }
  const warpLabels: Record<string, string> = {};
  for (const [entityId] of world.query('LifeWarp')) {
    const warp = world.getComponent<LifeWarp>(entityId, 'LifeWarp');
    if (!warp || warp.sceneId !== player.sceneId) continue;
    const destination = scenes.get(warp.toSceneId);
    warpLabels[warp.warpId] = warp.label ?? `前往${destination?.title ?? humanizeLifeId(warp.toSceneId)}`;
  }
  const summary = affordances.flatMap((entry) => entry.action === 'warp'
    ? [warpLabels[entry.targetId] ?? ACTION_LABELS.warp]
    : [ACTION_LABELS[entry.action] ?? humanizeLifeId(entry.action), entry.targetKind === 'tile' ? '' : humanizeLifeId(entry.targetId)])
    .filter((value, index, values) => value !== '' && values.indexOf(value) === index).join(' · ');
  const activeScene = scenes.get(player.sceneId);
  return {
    scene: player.sceneId,
    x: player.x,
    y: player.y,
    poseX: pose.x,
    poseY: pose.y,
    date: calendar ? `${humanizeLifeId(calendar.seasonId)} ${calendar.dayOfSeason}日（第${calendar.totalDay}天）` : '—',
    slot: calendar?.slotId ? humanizeLifeId(calendar.slotId) : '—',
    placeLabel: activeScene?.title ?? humanizeLifeId(player.sceneId),
    canInteract: affordances.some((entry) => entry.available) || !!dialogue,
    interactionSummary: summary || '附近没有可互动对象',
    inventory: (bag?.items ?? []).map((stack) => ({ itemId: stack.kind, count: stack.count })),
    allowedActions: context?.allowedActions ?? [],
    nearby: context?.nearbyPlacementIds ?? [],
    nearbyWarps: context?.nearbyWarpIds ?? [],
    warpLabels,
    affordances,
    selectedItem: item?.itemId,
    selectedTarget: target?.placementId,
    results,
    dialogue: dialogue ? `${dialogue.speaker}：${dialogue.text}` : text?.content,
    dialogueActive: dialogueSession?.status === 'open',
    dialogueTarget: dialogueSession?.npcPlacementId,
    dialogueKind: dialogue?.kind,
    dialogueTerminal: dialogueNode?.kind === 'line' && dialogueNode.next === null,
    dialogueOptions: dialogue?.options?.map((option, index) => ({ index, label: option.label, available: option.available })),
    objective: activeQuest?.objectiveKey ?? '—',
    relationships: (relationshipProjection?.entries ?? []).map((entry) => ({ npcId: entry.npcId, value: entry.value, levelId: entry.levelId, levelTitle: entry.levelTitleKey })),
  };
}
