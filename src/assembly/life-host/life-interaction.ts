import type { IWorld } from '../../engine/core/types.js';
import type { LifeInteractionAffordance } from '../../engine/protocol/components.js';
import { appendTrace, findDebugTrace } from '../../skills/debug-trace.js';
import type { WorldUi2DPresentation } from '../../renderer/index.js';
import type { LayoutNode } from '../../ui/components/index.js';
import { humanizeLifeId, type LifeHostViewModel } from './life-presenter.js';
import { LIFE_DIALOGUE_CLOSE_ACTION } from '../../skills/tier2/life-talk.js';

export interface LifeInteractionAction { readonly name: string; readonly arg?: string }
export interface LifeInteractionOption { readonly id: string; readonly label: string; readonly enabled: boolean; readonly actions?: readonly LifeInteractionAction[]; readonly children?: readonly LifeInteractionOption[] }
export interface LifeInteractionState { readonly open: boolean; readonly path: readonly string[]; readonly selected: number; readonly sourceKey: string }
export interface LifeInteractionTraceSink { record(kind: 'decision' | 'transition' | 'reject' | 'commit', what: string, why?: string): void }

export const LIFE_INTERACTION_ACTIVATE_ACTION = 'life-host.interaction.activate';
export const CLOSED_LIFE_INTERACTION: LifeInteractionState = Object.freeze({ open: false, path: [], selected: 0, sourceKey: '' });

const ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({ till: '翻土', water: '浇水', plant: '播种', harvest: '收获', forage: '采集', fish: '垂钓', mine: '采矿', buy: '购买', talk: '交谈', gift: '送礼', build: '建造', warp: '通行' });
const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({ 'zone-disallowed': '此处不能这样做', 'already-watered': '土地已经浇水', 'missing-seed': '需要种子', 'missing-materials': '材料不足', depleted: '资源已枯竭', 'dialogue-open': '正在交谈', 'missing-dialogue': '暂无话题', locked: '尚未开启', 'invalid-target': '目标不可用', 'inventory-full': '背包已满', 'missing-gift': '没有合适礼物', 'relationship-cap': '今日收益已满' });

const leaf = (id: string, label: string, ...actions: LifeInteractionAction[]): LifeInteractionOption => ({ id, label, enabled: true, actions });
const dialogueActive = (view: LifeHostViewModel): boolean => view.dialogueActive === true || (!!view.dialogue && !!view.dialogueTarget);
const contextKey = (view: LifeHostViewModel): string => `${view.scene}:${view.x}:${view.y}`;
const dialogueContextKey = (view: LifeHostViewModel): string => `dialogue:${view.dialogueTarget ?? 'player'}`;

function affordanceLabel(value: LifeInteractionAffordance, view: LifeHostViewModel): string {
  if (value.action === 'warp') return view.warpLabels?.[value.targetId] ?? `${ACTION_LABELS.warp} · ${humanizeLifeId(value.targetId)}`;
  const action = ACTION_LABELS[value.action] ?? humanizeLifeId(value.action);
  return value.targetKind === 'tile' ? action : `${action} · ${humanizeLifeId(value.targetId)}`;
}

function actionsFor(value: LifeInteractionAffordance): readonly LifeInteractionAction[] {
  if (value.action === 'warp') return [{ name: 'life.warp', arg: value.targetId }];
  return value.targetKind === 'placement' ? [{ name: 'life.select-target', arg: value.targetId }, { name: 'life.action', arg: value.action }] : [{ name: 'life.action', arg: value.action }];
}

function optionFromAffordance(value: LifeInteractionAffordance, view: LifeHostViewModel): LifeInteractionOption {
  const id = value.targetKind === 'tile' ? value.action : `${value.action}:${value.targetId}`;
  const label = affordanceLabel(value, view);
  if (!value.available) return { id, label: `${label} · ${REASON_LABELS[value.reason ?? 'invalid-target'] ?? humanizeLifeId(value.reason ?? 'invalid-target')}`, enabled: false };
  if (value.action !== 'plant' && value.action !== 'gift') return { id, label, enabled: true, actions: actionsFor(value) };
  const targetAction: readonly LifeInteractionAction[] = value.targetKind === 'placement' ? [{ name: 'life.select-target', arg: value.targetId }] : [];
  const children = (value.candidateItemIds ?? []).map((itemId) => leaf(`${value.action}:${itemId}`, humanizeLifeId(itemId), ...targetAction, { name: 'life.select-item', arg: itemId }, { name: 'life.action', arg: value.action }));
  return { id, label, enabled: children.length > 0, children };
}

export function buildLifeInteractionOptions(view: LifeHostViewModel): readonly LifeInteractionOption[] {
  if (dialogueActive(view)) {
    const choices = (view.dialogueOptions ?? []).map((option): LifeInteractionOption => option.available ? leaf(`dialogue:${option.index}`, option.label, { name: 'dialogue.choose', arg: String(option.index) }) : { id: `dialogue:${option.index}`, label: option.label, enabled: false });
    if (choices.length) return choices;
    if (view.dialogueKind === 'line' || view.dialogueKind === 'check') return [leaf(view.dialogueTerminal ? 'dialogue:close' : 'dialogue:advance', '继续', { name: view.dialogueTerminal ? LIFE_DIALOGUE_CLOSE_ACTION : 'dialogue.advance' })];
  }
  return view.affordances.map((value) => optionFromAffordance(value, view));
}

function optionsAt(root: readonly LifeInteractionOption[], path: readonly string[]): readonly LifeInteractionOption[] | null {
  let options = root;
  for (const id of path) {
    const parent = options.find((option) => option.id === id);
    if (!parent?.children?.length) return null;
    options = parent.children;
  }
  return options;
}

const enabledIndices = (options: readonly LifeInteractionOption[]): number[] => options.flatMap((option, index) => option.enabled ? [index] : []);
const fingerprintOption = (option: LifeInteractionOption): string => `${option.id}:${option.label}:${option.enabled ? 1 : 0}:${option.actions?.map((action) => `${action.name}=${action.arg ?? ''}`).join(',') ?? ''}[${option.children?.map(fingerprintOption).join('|') ?? ''}]`;
const sourceKey = (root: readonly LifeInteractionOption[], context = ''): string => `${context}|${root.map(fingerprintOption).join('|')}`;

export function createLifeInteractionTraceSink(world: IWorld): LifeInteractionTraceSink | undefined {
  let lastTick = -1; let count = 0;
  return { record: (kind, what, why) => {
    const trace = findDebugTrace(world);
    if (!trace) return;
    const tick = trace.tick ?? world.getVersion();
    if (tick !== lastTick) { lastTick = tick; count = 0; }
    if (count >= 3) return;
    appendTrace(trace, tick, 'life-host-interaction', kind, what, why); count += 1;
  } };
}

export class LifeInteractionController {
  private state: LifeInteractionState = CLOSED_LIFE_INTERACTION;
  private activeDialogueKey = '';
  constructor(private readonly trace?: LifeInteractionTraceSink) {}
  get current(): LifeInteractionState { return this.state; }
  close(reason?: string): void {
    if (this.state.open) this.trace?.record('transition', 'menu:open→closed', reason);
    this.state = CLOSED_LIFE_INTERACTION;
  }
  reconcile(view: LifeHostViewModel, root: readonly LifeInteractionOption[]): void {
    if (dialogueActive(view)) {
      const context = dialogueContextKey(view);
      const enabled = enabledIndices(root);
      if (this.activeDialogueKey !== context) this.activeDialogueKey = context;
      if (enabled.length === 0) { this.close('dialogue-no-enabled-option'); return; }
      const key = sourceKey(root, context);
      const options = this.state.open ? optionsAt(root, this.state.path) : null;
      if (!this.state.open || this.state.sourceKey !== key || !options?.[this.state.selected]?.enabled) {
        this.state = { open: true, path: [], selected: enabled[0]!, sourceKey: key };
        this.trace?.record('transition', 'dialogue:panel-open', root[enabled[0]!]!.id);
      }
      return;
    }
    if (this.activeDialogueKey) {
      this.trace?.record('transition', 'dialogue:active→closed', this.activeDialogueKey);
      this.activeDialogueKey = '';
      this.close('dialogue-complete');
    }
    if (!view.canInteract || enabledIndices(root).length === 0) { this.close('context-unavailable'); return; }
    if (!this.state.open) return;
    if (this.state.sourceKey !== sourceKey(root, contextKey(view))) { this.close('context-changed'); return; }
    const options = optionsAt(root, this.state.path);
    if (!options?.length || !options[this.state.selected]?.enabled) this.close('selection-invalid');
  }
  interact(root: readonly LifeInteractionOption[], view?: LifeHostViewModel): readonly LifeInteractionAction[] {
    const enabled = enabledIndices(root);
    if (enabled.length === 0) { this.trace?.record('reject', 'interaction:none', 'no-enabled-option'); this.close(); return []; }
    const only = enabled.length === 1 ? root[enabled[0]!] : undefined;
    if (only?.actions?.length) { this.trace?.record('commit', `interaction:${only.id}`, `${only.actions.length}-action-sequence`); this.close(); return only.actions; }
    this.state = { open: true, path: [], selected: enabled[0]!, sourceKey: sourceKey(root, view ? contextKey(view) : '') };
    this.trace?.record('transition', 'menu:closed→open', `${enabled.length}-options`);
    return [];
  }
  cycle(root: readonly LifeInteractionOption[], delta: 1 | -1): void {
    if (!this.state.open) return;
    const options = optionsAt(root, this.state.path);
    const enabled = options ? enabledIndices(options) : [];
    if (!options?.length || enabled.length === 0) { this.close('level-unavailable'); return; }
    const current = enabled.indexOf(this.state.selected);
    const selected = enabled[(current + delta + enabled.length) % enabled.length]!;
    this.state = { ...this.state, selected };
    this.trace?.record('decision', `selection:${options[selected]!.id}`, `cycle:${delta}`);
  }
  confirm(root: readonly LifeInteractionOption[]): readonly LifeInteractionAction[] {
    if (!this.state.open) { this.trace?.record('reject', 'confirm:ignored', 'menu-closed'); return []; }
    const options = optionsAt(root, this.state.path);
    const selected = options?.[this.state.selected];
    if (!selected?.enabled) { this.trace?.record('reject', 'confirm:ignored', 'selection-disabled'); return []; }
    if (selected.children?.length) {
      const first = enabledIndices(selected.children)[0];
      if (first === undefined) { this.trace?.record('reject', `submenu:${selected.id}`, 'no-enabled-child'); return []; }
      this.state = { ...this.state, path: [...this.state.path, selected.id], selected: first };
      this.trace?.record('transition', `submenu:${selected.id}`, `${selected.children.length}-children`);
      return [];
    }
    this.trace?.record('commit', `interaction:${selected.id}`, `${selected.actions?.length ?? 0}-action-sequence`);
    this.close();
    return selected.actions ?? [];
  }
  activate(root: readonly LifeInteractionOption[], optionId?: string): readonly LifeInteractionAction[] {
    if (!this.state.open || !optionId || !this.state.sourceKey.endsWith(root.map(fingerprintOption).join('|'))) { this.trace?.record('reject', 'pointer:ignored', 'stale-or-closed'); return []; }
    const options = optionsAt(root, this.state.path);
    const selected = options?.findIndex((option) => option.id === optionId && option.enabled) ?? -1;
    if (selected < 0) { this.trace?.record('reject', `pointer:${optionId}`, 'not-visible-enabled'); return []; }
    this.state = { ...this.state, selected };
    return this.confirm(root);
  }
  back(root?: readonly LifeInteractionOption[]): void {
    if (!this.state.open) return;
    if (this.state.path.length === 0) { this.close('back'); return; }
    const parentPath = this.state.path.slice(0, -1);
    const parentOptions = root ? optionsAt(root, parentPath) : undefined;
    this.state = { ...this.state, path: parentPath, selected: parentOptions ? (enabledIndices(parentOptions)[0] ?? 0) : 0 };
    this.trace?.record('transition', 'submenu→parent', parentPath.join('/') || 'root');
  }
}

export function buildLifeInteractionNode(root: readonly LifeInteractionOption[], state: LifeInteractionState, contextText?: string): LayoutNode | null {
  if (root.length === 0) return null;
  if (!state.open) {
    const enabled = root.filter((option) => option.enabled);
    const disabled = root.filter((option) => !option.enabled);
    const prompt = enabled.length === 0 ? undefined : enabled.length === 1 ? `${enabled[0]!.label}（E）` : '互动（E）';
    return { type: 'Panel', id: 'life-host-world-prompt', props: { bg: 'raised', edge: 'gold', shadow: { y: 4, color: 'ink' } }, layout: { maxWidth: 260, padding: 8, radius: 10 }, children: [
      ...(contextText ? [{ type: 'Label' as const, id: 'life-host-world-prompt-context', props: { text: contextText, size: 'sm' as const, color: 'text' as const } }] : []),
      ...(prompt ? [{ type: 'Label' as const, id: 'life-host-world-prompt-label', props: { text: prompt, size: 'sm' as const, bold: true, color: 'gold' as const, glow: true } }] : []),
      ...disabled.slice(0, 2).map((option): LayoutNode => ({ type: 'Label', id: `life-host-world-status-${option.id}`, props: { text: option.label, size: 'xs', color: 'sub' } })),
    ] };
  }
  const options = optionsAt(root, state.path) ?? [];
  const title = state.path.length ? root.find((option) => option.id === state.path[0])?.label ?? '选择' : '选择互动';
  const level = state.path.join('-') || 'root';
  return { type: 'Panel', id: 'life-host-world-menu', props: { title, bg: 'raised', edge: 'gold', shadow: { y: 5, color: 'ink' } }, layout: { maxWidth: 244, direction: 'column', gap: 6, padding: 10, radius: 12 }, children: [
    ...(contextText ? [{ type: 'Label' as const, id: 'life-host-world-menu-context', props: { text: contextText, size: 'sm' as const, color: 'text' as const } }] : []),
    ...options.map((option, index): LayoutNode => ({ type: 'Panel', id: `life-host-world-option-${level}-${option.id}`, props: { bg: index === state.selected ? 'gold-sheen' : 'sunken', edge: index === state.selected ? 'gold' : 'mine', ...(option.enabled ? { action: LIFE_INTERACTION_ACTIVATE_ACTION, actionArg: option.id } : {}) }, layout: { direction: 'row', align: 'center', gap: 7, padding: 6, radius: 8, press3d: option.enabled }, children: [
      { type: 'Label', id: `life-host-world-option-marker-${level}-${option.id}`, props: { text: index === state.selected ? '▶' : option.enabled ? '·' : '—', color: index === state.selected ? 'gold' : 'dim', bold: index === state.selected } },
      { type: 'Label', id: `life-host-world-option-label-${level}-${option.id}`, props: { text: `${option.label}${option.children?.length ? ' ›' : ''}`, color: index === state.selected ? 'text' : option.enabled ? 'sub' : 'dim', size: 'sm', bold: index === state.selected } },
    ] })),
    { type: 'Label', id: 'life-host-world-menu-help', props: { text: 'Tab 切换 · Enter 确定 · Esc 返回', color: 'sub', size: 'xs' } },
  ] };
}

export function buildLifeInteractionPresentation(view: LifeHostViewModel, root: readonly LifeInteractionOption[], state: LifeInteractionState): WorldUi2DPresentation | null {
  const node = buildLifeInteractionNode(root, state, dialogueActive(view) ? view.dialogue : undefined);
  return node ? { entityId: 'life:player', transform: { x: view.poseX, y: view.poseY }, offsetY: -0.7, keepInViewport: { padding: 10 }, interactive: state.open, node } : null;
}
