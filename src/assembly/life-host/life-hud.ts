import type { LifeHostDescriptorV1, LifeHostInventoryPanelDescriptor, LifeHostLabelKey, LifeHostProfilePanelDescriptor, LifeHostQuestPanelDescriptor } from '../../authoring/life-host-descriptor.js';
import type { LayoutNode } from '../../ui/components/index.js';
import { humanizeLifeId, type LifeHostViewModel } from './life-presenter.js';
import type { LifeHostUiSkinDescriptor, LifeHostUiSkinSlot } from '../../authoring/life-host-descriptor-core.js';
import { buildLifeHudOverlay, type LifeHudViewport, type LifeHudLocalState } from './life-hud-overlay.js';

type LifeSkinResolver = (skinKey: string) => string | undefined;
type LifeFrameSkin = { skin: string; skinSlice?: number; skinBorderWidth?: number };

/** Render-only: the caller resolves registered texture keys; missing assets add no props. */
function resolveLifeFrame(skin: LifeHostUiSkinDescriptor | undefined, slot: LifeHostUiSkinSlot, resolve: LifeSkinResolver): LifeFrameSkin | undefined {
  const key = skin?.slots[slot];
  const url = key ? resolve(key) : undefined;
  if (!url) return undefined;
  const slice = slot === 'trackedQuestFrame' || slot === 'panelFrame' ? skin?.slices?.[slot] : undefined;
  return { skin: url, ...(slice ? { skinSlice: slice.source, ...(slice.display !== undefined ? { skinBorderWidth: slice.display } : {}) } : {}) };
}

export type LifeHostHudConfig = LifeHostDescriptorV1['hud'];
export const LIFE_INVENTORY_PANEL_TOGGLE_ACTION = 'life.host.inventory.toggle';
export const LIFE_INVENTORY_PANEL_CLOSE_ACTION = 'life.host.inventory.close';
export const LIFE_INVENTORY_INSPECT_ACTION = 'life.host.inventory.inspect';
export const LIFE_QUEST_PANEL_TOGGLE_ACTION = 'life.host.quest.toggle';
export const LIFE_QUEST_PANEL_CLOSE_ACTION = 'life.host.quest.close';
export const LIFE_QUEST_TRACK_ACTION = 'life.host.quest.track';
export const LIFE_PROFILE_PANEL_TOGGLE_ACTION='life.host.profile.toggle';
export const LIFE_PROFILE_PANEL_CLOSE_ACTION='life.host.profile.close';
export interface LifeInventoryPanelRenderOptions {
  readonly descriptor?: LifeHostInventoryPanelDescriptor;
  readonly open?: boolean;
  readonly resolveSkin?: (skinKey: string) => string | undefined;
}
export interface LifeQuestPanelRenderOptions {
  readonly descriptor?: LifeHostQuestPanelDescriptor;
  readonly open?: boolean;
}
export interface LifeProfilePanelRenderOptions {readonly descriptor?:LifeHostProfilePanelDescriptor;readonly open?:boolean;readonly resolveSkin?:(skinKey:string)=>string|undefined}
const DEFAULT_LABELS: Readonly<Record<LifeHostLabelKey, string>> = Object.freeze({
  date: '日期', 'time-slot': '时段', place: '地点', inventory: '背包', interaction: '互动', objective: '目标', 'advance-time': 'T：消磨时光', 'advance-day': 'N：休息至明日', relationships: '关系', 'selected-item': '物品', 'selected-target': '目标', quests: '任务日志', profile:'人物档案',
});

export function resolveLifeHostLabel(config: LifeHostHudConfig, key: LifeHostLabelKey): string {
  return config.labels?.[key] ?? DEFAULT_LABELS[key];
}

export function buildLifeStandardHud(
  view: LifeHostViewModel,
  config: LifeHostHudConfig,
  inventoryPanel?: LifeHostInventoryPanelDescriptor,
  questPanel?: LifeHostQuestPanelDescriptor,
  profilePanel?:LifeHostProfilePanelDescriptor,
  resolveSkin:(skinKey:string)=>string|undefined=()=>undefined,
  uiSkin?:LifeHostDescriptorV1['uiSkin'],
): LayoutNode {
  const trackedFrame = resolveLifeFrame(uiSkin, 'trackedQuestFrame', resolveSkin);
  const ribbon = resolveLifeFrame(uiSkin, 'worldStatusRibbon', resolveSkin);
  const chrome = resolveLifeFrame(uiSkin, 'hudChrome', resolveSkin);
  const label = (key: LifeHostLabelKey): string => resolveLifeHostLabel(config, key);
  const bag = view.inventory.map((stack) => `${humanizeLifeId(stack.itemId)} ×${stack.count}`).join(' · ') || '—';
  const hudResources=view.profile?.attributes.filter((attribute)=>attribute.surfaces.includes('hud'))??[];
  const resourceNodes=hudResources.map((attribute,index):LayoutNode=>{
    const icon=resolveSkin(attribute.iconSkinKey);
    const visual:LayoutNode=icon?{type:'Image',id:`life-host-resource-icon-${index}`,props:{src:icon,alt:attribute.title,fit:'contain',radius:4},layout:{width:20,height:20}}:{type:'Panel',id:`life-host-resource-icon-placeholder-${index}`,props:{bg:'sunken',dashed:true},layout:{width:20,height:20,align:'center',justify:'center',radius:4},children:[{type:'Label',id:`life-host-resource-icon-label-${index}`,props:{text:'◆',size:'xs',color:'sub'}}]};
    return{type:'Panel',id:`life-host-resource-${index}`,props:{bg:'sunken',edge:'jade'},layout:{direction:'row',align:'center',gap:5,padding:5,radius:7},children:[visual,{type:'Label',id:`life-host-resource-title-${index}`,props:{text:attribute.title,size:'xs',color:'sub',bold:true}},{type:'Badge',id:`life-host-resource-value-${index}`,props:{text:`${attribute.value}${attribute.levelTitle?` · ${attribute.levelTitle}`:''}`,tone:'accent'}}]};
  });
  const worldStatus: LayoutNode = { type: 'Panel', id: 'life-host-world-status', props: { bg: 'raised', edge: 'gold', ...ribbon }, layout: { direction: 'row', align: 'center', gap: 10, padding: 8, radius: 8 }, children: [
    { type: 'Badge', id: 'life-host-place', props: { text: `${label('place')} ${view.placeLabel}`, tone: 'accent' } },
    { type: 'Label', id: 'life-host-date', props: { text: view.date ? `${label('date')} ${view.date}` : `${label('date')} —`, color: 'text', size: 'sm', bold: true } },
    { type: 'Badge', id: 'life-host-slot', props: { text: `${label('time-slot')} ${view.slot}`, tone: 'accent' } },
  ] };
  return { type: 'Panel', id: 'life-host-top-hud', props: { bare: true }, layout: { direction: 'row', justify: 'between', align: 'start', gap: 12, padding: 8 }, children: [
      { type: 'Panel', id: 'life-host-tracked-quest', props: { bg: 'raised', edge: 'gold', ...trackedFrame }, layout: { direction: 'column', gap: 3, padding: 8, radius: 8, minCol: 190 }, children: [
        { type: 'Label', id: 'life-host-name', props: { text: config.title ?? 'Life', size: 'sm', bold: true, color: 'text' } },
        { type: 'Label', id: 'life-host-tracked-quest-kicker', props: { text: view.questItems.some((quest) => quest.tracked) ? '当前追踪' : '任务追踪', size: 'xs', color: 'sub', bold: true } },
        { type: 'Label', id: 'life-host-tracked-quest-title', props: { text: view.questItems.find((quest) => quest.tracked)?.title ?? '当前没有追踪任务', size: 'sm', color: 'text', bold: true } },
        { type: 'Label', id: 'life-host-objective', props: { text: `${label('objective')}：${view.objective}`, size: 'xs', color: 'jade', bold: true } },
        { type: 'Label', id: 'life-host-tracked-quest-objective', props: { text: view.questItems.find((quest) => quest.tracked)?.nextObjective ?? '打开任务日志以选择任务', size: 'xs', color: 'jade', bold: true } },
      ] },
    { type: 'Panel', id: 'life-host-resource-actions', props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 10 }, children: [
      worldStatus,
      { type: 'Panel', id: 'life-host-resources', props: { bg: 'raised', edge: 'gold', ...chrome }, layout: { direction: 'row', align: 'center', gap: 6, padding: 6, radius: 8 }, children: [
        ...resourceNodes,
        { type: 'Label', id: 'life-host-bag-label', props: { text: `${label('inventory')} ${bag}`, color: 'text', size: 'xs', bold: true } },
        ...(inventoryPanel?.enabled ? [{ type: 'Button', id: 'life-host-inventory-open', props: { label: `I · ${label(inventoryPanel.titleLabelKey)}`, kind: 'quiet', action: LIFE_INVENTORY_PANEL_TOGGLE_ACTION }, layout: { press3d: true } } satisfies LayoutNode] : []),
        ...(questPanel?.enabled ? [{ type: 'Button', id: 'life-host-quest-open', props: { label: `J · ${label(questPanel.titleLabelKey)}`, kind: 'quiet', action: LIFE_QUEST_PANEL_TOGGLE_ACTION }, layout: { press3d: true } } satisfies LayoutNode] : []),
        ...(profilePanel?.enabled&&view.profile ? [{type:'Button',id:'life-host-profile-open',props:{label:`C · ${label(profilePanel.titleLabelKey)}`,kind:'quiet',action:LIFE_PROFILE_PANEL_TOGGLE_ACTION},layout:{press3d:true}} satisfies LayoutNode]:[]),
      ] },
    ] },
  ] };
}

function skinnedDrawer(node: LayoutNode, frame: LifeFrameSkin | undefined, id: string): LayoutNode {
  if (!frame) return node;
  return { ...node, children: [{ type: 'Panel', id, props: { bg: 'raised', edge: 'gold', ...frame }, layout: { direction: 'column', gap: 8, padding: 12 }, children: node.children }] };
}
export function buildLifeProfilePanel(view:LifeHostViewModel,config:LifeHostHudConfig,descriptor:LifeHostProfilePanelDescriptor,resolveSkin:(skinKey:string)=>string|undefined=()=>undefined):LayoutNode{
  const profile=view.profile!;
  const playerSrc=profile.playerSkinKey?resolveSkin(profile.playerSkinKey):undefined;
  const avatar:LayoutNode=playerSrc?{type:'Image',id:'life-host-profile-avatar',props:{src:playerSrc,alt:profile.title,fit:'contain',radius:12},layout:{width:104,height:132}}:{type:'Panel',id:'life-host-profile-avatar-placeholder',props:{bg:'sunken',dashed:true,edge:'gold'},layout:{width:104,height:132,align:'center',justify:'center',radius:12},children:[{type:'Label',id:'life-host-profile-avatar-label',props:{text:'角色',size:'sm',color:'sub',bold:true}}]};
  const rows=profile.attributes.map((attribute,index):LayoutNode=>{
    const iconSrc=resolveSkin(attribute.iconSkinKey);
    const icon:LayoutNode=iconSrc?{type:'Image',id:`life-host-profile-icon-${index}`,props:{src:iconSrc,alt:attribute.title,fit:'contain',radius:6},layout:{width:32,height:32}}:{type:'Panel',id:`life-host-profile-icon-placeholder-${index}`,props:{bg:'sunken',dashed:true},layout:{width:32,height:32,align:'center',justify:'center',radius:6},children:[{type:'Label',id:`life-host-profile-icon-label-${index}`,props:{text:'◆',size:'sm',color:'sub'}}]};
    return{type:'Panel',id:`life-host-profile-row-${index}`,props:{bg:'raised',edge:'jade'},layout:{direction:'column',gap:7,padding:10,margin:4,radius:10},children:[{type:'Panel',id:`life-host-profile-heading-${index}`,props:{bare:true},layout:{direction:'row',align:'center',justify:'between',gap:10},children:[{type:'Panel',id:`life-host-profile-title-wrap-${index}`,props:{bare:true},layout:{direction:'row',align:'center',gap:8},children:[icon,{type:'Label',id:`life-host-profile-title-${index}`,props:{text:attribute.title,size:'sm',color:'text',bold:true}}]},{type:'Badge',id:`life-host-profile-value-${index}`,props:{text:`${attribute.value}${attribute.levelTitle?` · ${attribute.levelTitle}`:''}`,tone:'accent'}}]},...(attribute.display==='gauge'?[{type:'ProgressBar',id:`life-host-profile-gauge-${index}`,props:{value:attribute.value-attribute.min,max:Math.max(1,attribute.max-attribute.min),tone:'accent',label:`${attribute.min}–${attribute.max}`,showValue:false}} satisfies LayoutNode]:[])]};
  });
  return{type:'Drawer',id:'life-host-profile-drawer',props:{side:'right',title:resolveLifeHostLabel(config,descriptor.titleLabelKey)},children:[{type:'Panel',id:'life-host-profile-actions',props:{bare:true},layout:{direction:'row',justify:'end',margin:4},children:[{type:'Button',id:'life-host-profile-close',props:{label:'关闭',kind:'quiet',action:LIFE_PROFILE_PANEL_CLOSE_ACTION},layout:{press3d:true}}]},{type:'Panel',id:'life-host-profile-summary',props:{bg:'sunken',edge:'gold'},layout:{direction:'row',align:'center',gap:14,padding:12,margin:4,radius:12},children:[avatar,{type:'Label',id:'life-host-profile-name',props:{text:profile.title,size:'lg',color:'text',bold:true}}]},...rows]};
}

export function buildLifeInventoryPanel(
  view: LifeHostViewModel,
  config: LifeHostHudConfig,
  descriptor: LifeHostInventoryPanelDescriptor,
  resolveSkin: (skinKey: string) => string | undefined = () => undefined,
): LayoutNode {
  const itemNodes = view.inventoryItems.map((item): LayoutNode => {
    const src = resolveSkin(item.skinKey);
    const visual: LayoutNode = src
      ? { type: 'Image', id: `life-host-inventory-image-${item.id}`, props: { src, alt: item.title, fit: 'contain', radius: 8 }, layout: { width: 56, height: 56 } }
      : { type: 'Panel', id: `life-host-inventory-placeholder-${item.id}`, props: { bg: 'sunken', dashed: true, edge: 'gold' }, layout: { width: 56, height: 56, align: 'center', justify: 'center', radius: 8 }, children: [
        { type: 'Label', id: `life-host-inventory-placeholder-label-${item.id}`, props: { text: humanizeLifeId(item.kind), size: 'xs', color: 'sub', bold: true } },
      ] };
    return { type: 'Panel', id: `life-host-inventory-item-${item.id}`, props: { bg: 'raised', edge: 'gold' }, layout: { direction: 'column', align: 'center', gap: 6, padding: 8, radius: 10, minCol: 84, tilt3d: true }, children: [
      visual,
      { type: 'Label', id: `life-host-inventory-title-${item.id}`, props: { text: item.title, size: 'sm', color: 'text', bold: true } },
      { type: 'Label', id: `life-host-inventory-count-${item.id}`, props: { text: `数量 ×${item.count}`, size: 'sm', color: 'text', bold: true } },
    ] };
  });
  if (itemNodes.length === 0) itemNodes.push({ type: 'Panel', id: 'life-host-inventory-empty', props: { bg: 'sunken', dashed: true }, layout: { padding: 18, radius: 10 }, children: [
    { type: 'Label', id: 'life-host-inventory-empty-label', props: { text: '当前没有物品', size: 'sm', color: 'sub' } },
  ] });
  return { type: 'Drawer', id: 'life-host-inventory-drawer', props: {
    side: 'right', title: resolveLifeHostLabel(config, descriptor.titleLabelKey),
  }, children: [
    { type: 'Panel', id: 'life-host-inventory-actions', props: { bare: true }, layout: { direction: 'row', justify: 'end', margin: 4 }, children: [
      { type: 'Button', id: 'life-host-inventory-close', props: { label: '关闭', kind: 'quiet', action: LIFE_INVENTORY_PANEL_CLOSE_ACTION }, layout: { press3d: true } },
    ] },
    { type: 'Panel', id: 'life-host-inventory-capacity', props: { bg: 'sunken', edge: 'jade' }, layout: { direction: 'row', justify: 'between', align: 'center', gap: 8, padding: 10, margin: 4, radius: 10 }, children: [
      { type: 'Label', id: 'life-host-inventory-used-slots', props: { text: `已用 ${view.inventoryCapacity.usedSlots}/${view.inventoryCapacity.totalSlots}`, size: 'sm', color: 'text', bold: true } },
      { type: 'Badge', id: 'life-host-inventory-free-slots', props: { text: `空格 ${view.inventoryCapacity.freeSlots}`, tone: 'accent' } },
    ] },
    { type: 'Panel', id: 'life-host-inventory-grid', props: { bare: true }, layout: { direction: 'grid', cols: descriptor.columns, gap: 10, padding: 4 }, children: itemNodes },
  ] };
}

export function buildLifeQuestPanel(
  view: LifeHostViewModel,
  config: LifeHostHudConfig,
  descriptor: LifeHostQuestPanelDescriptor,
): LayoutNode {
  const stateLabel = { active: '进行中', locked: '未解锁', completed: '已完成', failed: '失败' } as const;
  const stateTone = { active: 'accent', locked: 'accent', completed: 'accent', failed: 'danger' } as const;
  const questNodes = view.questItems.map((quest, index): LayoutNode => ({
    type: 'Panel', id: `life-host-quest-item-${index}`, props: { bg: quest.tracked ? 'raised' : 'sunken', edge: quest.tracked ? 'gold' : 'jade' },
    layout: { direction: 'column', gap: 7, padding: 12, margin: 4, radius: 10 },
    children: [
      { type: 'Panel', id: `life-host-quest-heading-${index}`, props: { bare: true }, layout: { direction: 'row', justify: 'between', align: 'center', gap: 8 }, children: [
        { type: 'Label', id: `life-host-quest-title-${index}`, props: { text: quest.title, size: 'md', color: 'text', bold: true } },
        { type: 'Badge', id: `life-host-quest-state-${index}`, props: { text: stateLabel[quest.state], tone: stateTone[quest.state] } },
      ] },
      { type: 'Label', id: `life-host-quest-chapter-${index}`, props: { text: quest.summary, size: 'xs', color: 'sub' } },
      { type: 'Label', id: `life-host-quest-objective-${index}`, props: { text: quest.nextObjective, size: 'sm', color: quest.state === 'locked' ? 'sub' : 'text', bold: quest.state === 'active' } },
      { type: 'ProgressBar', id: `life-host-quest-progress-${index}`, props: { value: quest.completedNodes, max: Math.max(1, quest.visibleNodes), tone: quest.state === 'failed' ? 'danger' : quest.state === 'completed' ? 'ok' : 'accent', label: `进度 ${quest.completedNodes}/${quest.visibleNodes}`, showValue: false } },
      { type: 'Button', id: `life-host-quest-track-${index}`, props: { label: quest.tracked ? '正在追踪' : '追踪任务', kind: quest.tracked ? 'quiet' : 'primary', disabled: quest.tracked, action: LIFE_QUEST_TRACK_ACTION, actionArg: quest.questId }, layout: { press3d: true } },
    ],
  }));
  const hasActive = view.questItems.some((quest) => quest.state === 'active');
  return { type: 'Drawer', id: 'life-host-quest-drawer', props: {
    side: 'right', title: resolveLifeHostLabel(config, descriptor.titleLabelKey),
  }, children: [
    { type: 'Panel', id: 'life-host-quest-actions', props: { bare: true }, layout: { direction: 'row', justify: 'end', margin: 4 }, children: [
      { type: 'Button', id: 'life-host-quest-close', props: { label: '关闭', kind: 'quiet', action: LIFE_QUEST_PANEL_CLOSE_ACTION }, layout: { press3d: true } },
    ] },
    ...(!hasActive ? [{ type: 'Panel', id: 'life-host-quest-no-active', props: { bg: 'sunken', dashed: true }, layout: { padding: 12, margin: 4, radius: 10 }, children: [
      { type: 'Label', id: 'life-host-quest-no-active-label', props: { text: '当前没有进行中的任务', size: 'sm', color: 'sub' } },
    ] } satisfies LayoutNode] : []),
    ...(questNodes.length > 0 ? questNodes : [{ type: 'Panel', id: 'life-host-quest-empty', props: { bg: 'sunken', dashed: true }, layout: { padding: 18, margin: 4, radius: 10 }, children: [
      { type: 'Label', id: 'life-host-quest-empty-label', props: { text: '尚无可见任务', size: 'sm', color: 'sub' } },
    ] } satisfies LayoutNode]),
  ] };
}

export function buildLifeStandardUi(
  view: LifeHostViewModel,
  config: LifeHostHudConfig,
  worldInteraction?: LayoutNode | null,
  inventory: LifeInventoryPanelRenderOptions = {},
  quests: LifeQuestPanelRenderOptions = {},
  profile:LifeProfilePanelRenderOptions={}, uiSkin?:LifeHostDescriptorV1['uiSkin'],
  resolveSkin: LifeSkinResolver = inventory.resolveSkin ?? profile.resolveSkin ?? (() => undefined),
  viewport?: LifeHudViewport,
  localState?: LifeHudLocalState,
): LayoutNode {
  const descriptor = inventory.descriptor;
  const frame = resolveLifeFrame(uiSkin, 'panelFrame', resolveSkin);
  const drawer = descriptor?.enabled && inventory.open
    ? skinnedDrawer(buildLifeInventoryPanel(view, config, descriptor, inventory.resolveSkin), frame, 'life-host-inventory-frame')
    : null;
  const questDescriptor = quests.descriptor;
  const questDrawer = questDescriptor?.enabled && quests.open
    ? skinnedDrawer(buildLifeQuestPanel(view, config, questDescriptor), frame, 'life-host-quest-frame')
    : null;
  const profileDescriptor=profile.descriptor;
  const profileDrawer=profileDescriptor?.enabled&&profile.open&&view.profile?skinnedDrawer(buildLifeProfilePanel(view,config,profileDescriptor,profile.resolveSkin), frame, 'life-host-profile-frame'):null;
  const legacy: LayoutNode = { type: 'Panel', id: 'life-host-audit-root', props: { bare: true }, layout: { direction: 'column', gap: 8 }, children: [
    buildLifeStandardHud(view, config, descriptor, questDescriptor, profileDescriptor, resolveSkin, uiSkin),
    ...(worldInteraction ? [worldInteraction] : []),
    ...(drawer ? [drawer] : []),
    ...(questDrawer ? [questDrawer] : []),
    ...(profileDrawer?[profileDrawer]:[]),
  ] };
  return buildLifeHudOverlay(legacy, view, config, uiSkin, resolveSkin, viewport, localState);
}
