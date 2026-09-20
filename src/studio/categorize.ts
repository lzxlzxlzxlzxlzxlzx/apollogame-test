import type { InspectedEntity } from './inspect.js';
import type { CapabilityDefinition, FieldType } from '@engine/core/define-capability.js';

// ═══════════════════════════════════════════════════════════════
//  分类导航 (Categorize) · 纯逻辑核心
//
//  ⛔ 编辑器是引擎侧工具(像透视器本身)：本模块只产生「视图」——不改任何
//  游戏数据、不进 world/snapshot/hash。确定性：同输入同输出，可单测。
//
//  痛点：透视器把蓝图摊平成上百实体的扁平列表，复杂游戏(game-f)没法看。
//  这里按「域」给每个实体派一个领域标签(单位/棋盘/经济/UI…)，让"只看所有
//  单位 / 所有经济"成为一次点击。域规则是**数据表**(DOMAIN_RULES，按组件
//  类型签名匹配，首个命中胜)——组件类型是引擎级词汇，跨所有游戏通用，可审计
//  可扩展，不写游戏专属分支。
// ═══════════════════════════════════════════════════════════════

/** 一条域规则：实体含 anyOf 里任一组件类型即归此域。规则有序，首个命中胜。 */
export interface DomainRule {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  /** 命中任一组件类型即归此域；空 = 兜底(misc)。 */
  readonly anyOf: readonly string[];
  readonly hint: string;
}

// 顺序 = 优先级（特异性高的在前：一个棋子同时有 Hitbox 和 Text，先判为"单位"而非"文字"）。
export const DOMAIN_RULES: readonly DomainRule[] = [
  { id: 'unit', label: '单位/棋子', icon: '⚔', anyOf: ['Hitbox', 'Perception', 'Steering', 'Mortal', 'GridMover'], hint: '会战斗/索敌/走位的角色' },
  { id: 'spawn', label: '模板/生成', icon: '✦', anyOf: ['PrefabTemplate', 'PrefabLibrary', 'Caster', 'SpawnRequest', 'MergeRule'], hint: '棋子模板、召唤、合成' },
  { id: 'card', label: '牌库/商店', icon: '🂠', anyOf: ['CardPile', 'Card', 'PokerHand', 'PlayedHand'], hint: '抽牌/商店/手牌/牌型' },
  { id: 'board', label: '棋盘/地形', icon: '▦', anyOf: ['HexBoard', 'Tilemap', 'BoardCell', 'Zone'], hint: '棋盘、瓦片地图、占位区' },
  { id: 'slot', label: '席位/拖放', icon: '⇄', anyOf: ['Tray', 'TraySeat', 'DropZone', 'Draggable'], hint: '备战席、拖拽、投放区' },
  { id: 'flow', label: '流程/逻辑', icon: '⮕', anyOf: ['GameFlow', 'FlowState', 'EventWhen', 'Effect', 'CraftRecipe'], hint: '回合流程、事件→效果链、配方' },
  { id: 'gauge', label: 'HUD/数值条', icon: '▭', anyOf: ['Gauge', 'TextBinding'], hint: '血条/蓝条、绑定数字读出' },
  { id: 'visual', label: '外观/皮肤', icon: '🎨', anyOf: ['SpriteBinding'], hint: '随资源变样子（生长阶/升级外观/血量变色）' },
  { id: 'text', label: '文字/名牌', icon: 'T', anyOf: ['Text'], hint: '头顶名字、标题、说明文字' },
  { id: 'camera', label: '相机', icon: '🎥', anyOf: ['Camera', 'CameraTarget'], hint: '视口跟随' },
  { id: 'fx', label: '特效/动画', icon: '✶', anyOf: ['Tween', 'AnimState', 'Frame'], hint: '补间、序列帧、状态动画' },
  { id: 'economy', label: '资源/经济', icon: '◈', anyOf: ['Resource'], hint: '金币、计数器等纯资源' },
  { id: 'misc', label: '其他', icon: '·', anyOf: [], hint: '未归入上述域(纯 Transform/Shape/Sprite 等)' },
];

const MISC_RULE = DOMAIN_RULES[DOMAIN_RULES.length - 1];

/** 实体归属的域（首个 anyOf 命中其组件类型的规则；都不中→misc）。 */
export function entityDomain(ent: InspectedEntity): DomainRule {
  const types = new Set(ent.components.map((c) => c.type));
  for (const rule of DOMAIN_RULES) {
    if (rule.anyOf.some((t) => types.has(t))) return rule;
  }
  return MISC_RULE;
}

export interface DomainGroup {
  readonly rule: DomainRule;
  readonly entities: readonly InspectedEntity[];
}

/** 按域分组（保留 DOMAIN_RULES 的顺序；空域不产出）。 */
export function groupByDomain(entities: readonly InspectedEntity[]): DomainGroup[] {
  const byId = new Map<string, InspectedEntity[]>();
  for (const ent of entities) {
    const d = entityDomain(ent);
    let arr = byId.get(d.id);
    if (!arr) byId.set(d.id, (arr = []));
    arr.push(ent);
  }
  return DOMAIN_RULES.filter((r) => byId.has(r.id)).map((rule) => ({ rule, entities: byId.get(rule.id)! }));
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  }
  return String(v);
}

/** 全文过滤：实体 id / 组件类型 / 字段名 / 字段值 任一含查询词（空格分词，全部命中）。 */
export function filterEntities(entities: readonly InspectedEntity[], query: string): InspectedEntity[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...entities];
  return entities.filter((ent) => {
    const hay = (
      ent.id +
      ' ' +
      ent.components
        .map((c) => c.type + ' ' + c.fields.map((f) => f.key + ' ' + stringifyValue(f.value)).join(' '))
        .join(' ')
    ).toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

// ── 可配置项清单 ("能配啥" · 引擎自描述的 schema 参考) ──
// 答用户："我不知道配置哪些东西"。每个启用能力 → 它提供的组件 → 每个字段(类型+人话)。
// 全部来自引擎自描述(defineCapability.components.provides)，不臆造、不另立 schema。

export interface KnobField {
  readonly key: string;
  readonly type: FieldType;
  readonly describe: string;
}
export interface KnobComponent {
  readonly type: string;
  readonly category: string;
  readonly describe: string;
  readonly fields: readonly KnobField[];
}
export interface CapabilityKnobs {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly components: readonly KnobComponent[];
}

/** 从启用的能力提取"可配置项清单"：能力→组件→字段(类型+说明)。无组件的能力略过。 */
export function capabilityKnobs(caps: readonly CapabilityDefinition[]): CapabilityKnobs[] {
  return caps
    .map((cap) => ({
      id: cap.id,
      name: cap.describe?.name ?? cap.id,
      summary: cap.describe?.summary ?? '',
      components: Object.entries(cap.components?.provides ?? {}).map(([type, schema]) => ({
        type,
        category: schema.category,
        describe: schema.describe,
        fields: Object.entries(schema.fields).map(([key, f]) => ({ key, type: f.type, describe: f.describe })),
      })),
    }))
    .filter((k) => k.components.length > 0);
}
