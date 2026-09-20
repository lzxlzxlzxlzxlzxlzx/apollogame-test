import { s4Units } from './runtime-selection.js';
/** Compile-time authoring data. Numbers are S3 fixtures, not balance values. */
export const FLIGHT = 16, GROUND_WINDOW = 8, HARD_CONTROL = 32;
export type HitForm = 'committed-melee' | 'projectile' | 'dive-contact';
export interface SkillTemplate {
  id: string; hitForm: HitForm; action: string; rejectStatusMask: number;
  sourceRejectStatusMask: number; resource: string;
  targetPolicy: 'captured-entity' | 'nearest-at-launch' | 'contact';
  releaseAt: 'self' | 'target'; actionLock: 'exclusive'; interruption: 'cancel-no-refund';
  window?: { airborneMask: number; groundMask: number };
  phases: readonly ['Ready', 'Windup', 'Active', 'Recovery'];
  overrides: readonly (keyof SkillLoadout['parameters'])[];
}
export interface SkillLoadout {
  id: string; templateId: string;
  parameters: { damage: number; cd: number; range: number; radius: number; windup: number; recovery: number; speed: number; life: number };
}
export interface UnitDefinition {
  id: string; textId: string; hp: number; tags: number; initialStatus: number;
  radius: number; skillLoadoutIds: readonly string[]; decisionProfileId: string;
  presentationProfileId: string; shopId: string;
}
export interface PresentationProfile {
  id: string; action: string; root: 'feet' | 'body'; facing: 'right'; mirror: boolean;
  scale: number; scaleRange: readonly [number, number];
  clips: readonly { semantic: string; slot: string; status: 'missing'; source: null }[];
}
export interface Catalog {
  game: { id: string; title: string; notice: string; parameters: string };
  texts: readonly { id: string; name: string; description: string; placeholder: string }[];
  units: readonly UnitDefinition[]; templates: readonly SkillTemplate[]; loadouts: readonly SkillLoadout[];
  decisions: readonly { id: string; candidates: readonly string[]; fallback: 'idle' }[];
  presentations: readonly PresentationProfile[];
  shop: readonly { id: string; label: string }[];
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const overrides = ['damage', 'cd', 'range', 'radius', 'windup', 'recovery', 'speed', 'life'] as const;
const phases = ['Ready', 'Windup', 'Active', 'Recovery'] as const;
const clips = (prefix: string, names: string[]) => names.map(semantic => ({ semantic, slot: `${prefix}/${semantic}`, status: 'missing' as const, source: null }));
export const catalog: Catalog = freeze({
  game: { id: 'game-mcfight', title: 'MC Fight', notice: 'S3 开发骨架 · 仅浏览单位，购买、部署、战斗与结算尚未开放。动作素材缺失，当前为文字与几何占位。', parameters: 'S3 fixture · 实验参数，非正式平衡值' },
  texts: [
    { id: 'vindicator-text', name: '卫道士', description: '地面单体近战 · 共享近战模板 · 斧劈', placeholder: '🪓' },
    { id: 'skeleton-text', name: '骷髅', description: '地面远程 · 飞行弹丸模板 · 持弓', placeholder: '🏹' },
    { id: 'vex-text', name: '恼鬼', description: '飞行近战 · 俯冲接触与地面窗口', placeholder: '◇' },
  ],
  // Historical S3 selection view; body facts come from the same R2 catalog.
  units: (['vindicator','skeleton','vex'] as const).map(id => ({
    id, textId: `${id}-text`, hp: s4Units[id].hp, tags: 1,
    initialStatus: id === 'vex' ? FLIGHT : 0, radius: s4Units[id].radius,
    skillLoadoutIds: [id === 'vindicator' ? 'axe' : id === 'skeleton' ? 'arrow' : 'dive'],
    decisionProfileId: id === 'vindicator' ? 'axe-first' : id === 'skeleton' ? 'arrow-first' : 'dive-first',
    presentationProfileId: id === 'vindicator' ? 'axe-art' : id === 'skeleton' ? 'bow-art' : 'dive-art',
    shopId: id === 'vindicator' ? 'ground-melee' : id === 'skeleton' ? 'ground-ranged' : 'flying-melee',
  })),
  templates: [
    { id: 'melee', hitForm: 'committed-melee', action: 'slash', rejectStatusMask: FLIGHT, sourceRejectStatusMask: HARD_CONTROL, resource: 'hp', targetPolicy: 'captured-entity', releaseAt: 'target', actionLock: 'exclusive', interruption: 'cancel-no-refund', phases, overrides },
    { id: 'projectile', hitForm: 'projectile', action: 'shoot', rejectStatusMask: 0, sourceRejectStatusMask: HARD_CONTROL, resource: 'hp', targetPolicy: 'nearest-at-launch', releaseAt: 'self', actionLock: 'exclusive', interruption: 'cancel-no-refund', phases, overrides },
    { id: 'dive', hitForm: 'dive-contact', action: 'dive', rejectStatusMask: 0, sourceRejectStatusMask: HARD_CONTROL, resource: 'hp', targetPolicy: 'contact', releaseAt: 'self', actionLock: 'exclusive', interruption: 'cancel-no-refund', window: { airborneMask: FLIGHT, groundMask: GROUND_WINDOW }, phases, overrides },
  ],
  loadouts: [
    { id: 'axe', templateId: 'melee', parameters: { damage: 7, cd: 8, range: 3, radius: 1, windup: 1, recovery: 1, speed: 0, life: 2 } },
    { id: 'arrow', templateId: 'projectile', parameters: { damage: 5, cd: 19, range: 30, radius: .2, windup: 1, recovery: 1, speed: 1, life: 40 } },
    { id: 'dive', templateId: 'dive', parameters: { damage: 5, cd: 12, range: 12, radius: 1, windup: 2, recovery: 2, speed: 2, life: 2 } },
  ],
  decisions: [
    { id: 'axe-first', candidates: ['axe'], fallback: 'idle' },
    { id: 'arrow-first', candidates: ['arrow'], fallback: 'idle' },
    { id: 'dive-first', candidates: ['dive'], fallback: 'idle' },
  ],
  presentations: [
    { id: 'axe-art', action: 'slash', root: 'feet', facing: 'right', mirror: true, scale: 1, scaleRange: [.8, 1.2], clips: clips('vindicator', ['idle', 'windup', 'release', 'recovery']) },
    { id: 'bow-art', action: 'shoot', root: 'feet', facing: 'right', mirror: true, scale: 1, scaleRange: [.8, 1.2], clips: clips('skeleton', ['idle', 'windup', 'release', 'recovery']) },
    { id: 'dive-art', action: 'dive', root: 'body', facing: 'right', mirror: true, scale: 1, scaleRange: [.8, 1.2], clips: clips('vex', ['hover', 'prepare', 'descend', 'contact', 'rise', 'hover-recover']) },
  ],
  shop: [{ id: 'ground-melee', label: '地面 / 近战' }, { id: 'ground-ranged', label: '地面 / 远程' }, { id: 'flying-melee', label: '飞行 / 近战' }],
});
export function requireId<T extends { id: string }>(items: readonly T[], id: string): T {
  const item = items.find(entry => entry.id === id);
  if (!item) throw new Error(`Unresolved catalog reference: ${id}`);
  return item;
}
export function validateCatalog(c: Catalog): string[] {
  const errors: string[] = [];
  for (const [name, entries] of Object.entries(c)) {
    if (!Array.isArray(entries)) continue;
    const ids = entries.map((entry: { id: string }) => entry.id);
    if (new Set(ids).size !== ids.length) errors.push(`Duplicate ID in ${name}`);
  }
  try {
    for (const loadout of c.loadouts) {
      const template = requireId(c.templates, loadout.templateId);
      if (template.actionLock !== 'exclusive' || template.interruption !== 'cancel-no-refund') errors.push(`Unsupported lock/cancel policy ${template.id}`);
      if ((template.targetPolicy === 'captured-entity') !== (template.releaseAt === 'target')) errors.push(`Invalid target policy ${template.id}`);
      for (const [key, value] of Object.entries(loadout.parameters)) {
        if (!template.overrides.includes(key as keyof SkillLoadout['parameters']) || !Number.isFinite(value) || value < 0) errors.push(`Invalid parameter ${loadout.id}.${key}`);
      }
      if (loadout.parameters.radius <= 0 || loadout.parameters.cd <= 0) errors.push(`Invalid geometry/CD ${loadout.id}`);
    }
    for (const unit of c.units) {
      requireId(c.texts, unit.textId); requireId(c.shop, unit.shopId);
      const decision = requireId(c.decisions, unit.decisionProfileId);
      const art = requireId(c.presentations, unit.presentationProfileId);
      if (unit.hp <= 0 || unit.radius <= 0) errors.push(`Invalid body ${unit.id}`);
      if (decision.fallback !== 'idle' || decision.candidates.length !== unit.skillLoadoutIds.length || new Set(decision.candidates).size !== decision.candidates.length) errors.push(`Invalid decision ${unit.id}`);
      for (const id of decision.candidates) {
        if (!unit.skillLoadoutIds.includes(id)) errors.push(`Unowned skill ${id}`);
        const template = requireId(c.templates, requireId(c.loadouts, id).templateId);
        if (template.action !== art.action) errors.push(`Missing action binding ${unit.id}/${template.action}`);
      }
      unit.skillLoadoutIds.forEach(id => requireId(c.loadouts, id));
      if (art.scale < art.scaleRange[0] || art.scale > art.scaleRange[1]) errors.push(`Invalid scale ${art.id}`);
      if (art.clips.some(clip => clip.status !== 'missing' || clip.source !== null)) errors.push(`Unreviewed material ${art.id}`);
    }
  } catch (error) { errors.push(String(error)); }
  return errors;
}
