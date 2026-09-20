import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import type { Flag, InputQueue, Resource, State, Tag, Transform, DamageRequest } from '@engine/protocol/components.js';
import { dragPlaceCapability } from '@skills/tier2/drag-place.js';
import { seededShuffle } from '@skills/atoms/random/index.js';
import { S4_ACTIONS as A, S4_BALANCE_V1 as B, S4_ENEMY_PRESETS, S4_TICK_RATE, S4_UNIT_IDS, type S4UnitId } from './content/s4-balance.js';
import { assembleCombatWorld, buildCombatUnitTemplate, s4TeamMask, type CombatCatalog } from './s4-world.js';
import { s4Catalog } from './content/s4-catalog.js';
import { instantiate } from '@skills/tier3/prefab.js';

export interface S4UnitPlacement<U extends string=S4UnitId> { instanceId: string; unitId: U; team: 1 | 2; x: number; y: number }
export interface S4BattlePort { world: World; tick(): void; dispose(): void; bodyId(instanceId: string): string; damage?(): { player: number; enemy: number; playerHealing?: number; enemyHealing?: number } }
export type S4BattleFactory<U extends string=S4UnitId> = (units: S4UnitPlacement<U>[], seed: number) => S4BattlePort;
export interface SessionContent<U extends string> {
  units:Record<U,{name:string;price:number;hp:number;radius:number;armor:number;speed:number;role:string;skills:string[]}>;
  shopIds:readonly U[];initialGold:number;enemyPresets:Record<string,readonly U[]>;
}
export interface S4Config<U extends string=S4UnitId> { enemyPreset?: string; content?:SessionContent<U> }
export type S4Phase = 'shop' | 'deploy' | 'battle' | 'result';
export const S4_DEPLOYED = 4;
export const S4_BENCH = { minX: -19, maxX: 19, minY: 12, maxY: 16 };
const transform = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

/** Production bridge, shared by browser and acceptance. No damage/target/skill implementation here. */
export const createS4Battle: S4BattleFactory = (units, _seed) => {
  return createCatalogBattle(s4Catalog,'s4',units,_seed);
};
export function createCatalogBattle<U extends string>(catalog:CombatCatalog,scope:string,units:S4UnitPlacement<U>[],_seed:number):S4BattlePort {
  const engine = new Engine({ tickRate: S4_TICK_RATE }); assembleCombatWorld(engine,catalog,scope);
  const world = engine.world, bodies = new Map<string, string>();
  for (const u of units) {instantiate(world,buildCombatUnitTemplate(catalog,scope,u.unitId,u.team),u.instanceId,0,u.x,u.y);bodies.set(u.instanceId,`${u.instanceId}#0:body`);}
  world.getComponent<State>('session', 'State')!.current = 'battle';
  let player = 0, enemy = 0, playerHealing = 0, enemyHealing = 0;
  let pending: DamageRequest[] = [];
  world.setObserver({
    onSystemStart(system) {
      if (system.id !== 'damage-route') return;
      // Retain receipts only across this production system. The observer never
      // recalculates damage, applies HP, or uses a tick-wide net difference.
      pending = world.query('DamageRequest').map(([id]) => world.getComponent<DamageRequest>(id, 'DamageRequest')!);
    },
    onSystemEnd(system) {
      if (system.id !== 'damage-route') return;
      for (const hit of pending) {
        const amount = hit.appliedAmount ?? 0;
        if (hit.resource !== 'hp' || !Number.isFinite(amount)) continue;
        if (hit.sourceTags & s4TeamMask(1)) { player += Math.max(0, amount); playerHealing += Math.max(0, -amount); }
        else if (hit.sourceTags & s4TeamMask(2)) { enemy += Math.max(0, amount); enemyHealing += Math.max(0, -amount); }
      }
      pending = [];
    },
  });
  return { world, tick: () => world.tick(), bodyId: id => bodies.get(id) ?? '', damage: () => ({ player, enemy, playerHealing, enemyHealing }), dispose: () => { world.setObserver(undefined); engine.stop(); for (const id of world.getAllEntities()) world.destroyEntity(id); } };
}

/** Sole production authority for budget, roster, phase and round result (S3 architecture §3).
 * Geometry is exclusively drag-place; combat is exclusively the injected production assembly.
 * The public Engine supplies the only browser fixed clock. Its empty clock world calls tick;
 * result ticks never enter the combat world, including multiple steps in one render frame. */
export class S4Session<U extends string=S4UnitId> {
  readonly engine = new Engine({ tickRate: S4_TICK_RATE });
  phase: S4Phase = 'shop'; selectedUnitId: U;
  shopPage=0;
  gold: number = B.economy.initialGold; round = 1;
  outcome: 'none' | 'victory' | 'defeat' | 'draw' = 'none';
  battleTicks = 0; reward = 0; playerDamage = 0; enemyDamage = 0; playerHealing = 0; enemyHealing = 0;
  readonly results: Array<{ round: number; outcome: 'victory' | 'defeat' | 'draw'; reward: number; ticks: number; playerAlive: number; enemyAlive: number; playerDamage: number; enemyDamage: number; playerHealing: number; enemyHealing: number }> = [];
  dragging: string | null = null;
  readonly roster: Array<{ instanceId: string; unitId: U; seat: number }> = [];
  private serial: Partial<Record<U, number>> = {};
  private deployment = this.createDeployment();
  private battle?: S4BattlePort;
  private formation: S4UnitPlacement<U>[] = [];
  private readonly commands: Array<{ action: string; args: Record<string, unknown> }> = [];
  private disposed = false;
  readonly content:SessionContent<U>;
  constructor(readonly seed: number, private readonly createBattle: S4BattleFactory<U> = createS4Battle as unknown as S4BattleFactory<U>, readonly config: S4Config<U> = {}) {
    this.content=config.content??{units:B.units,shopIds:S4_UNIT_IDS,initialGold:B.economy.initialGold,enemyPresets:S4_ENEMY_PRESETS} as unknown as SessionContent<U>;
    if(!this.content.shopIds.length)throw Error('Empty runnable shop');
    this.selectedUnitId=this.content.shopIds[0]!;this.gold=this.content.initialGold;
    if (config.enemyPreset !== undefined && !Object.hasOwn(this.content.enemyPresets,config.enemyPreset)) throw new Error('Unknown enemyPreset');
    this.formation = this.generateEnemies();
    this.engine.world.setObserver({ onTickEnd: () => this.tick() });
  }
  get world(): World { return this.battle?.world ?? this.deployment; }
  private createDeployment(): World {
    const world = new World(); dragPlaceCapability.systems.forEach(s => world.addSystem(s));
    world.createEntity('deployment-phase'); world.addComponent('deployment-phase', { type: 'Flag', id: 'deploy', active: false } as Flag);
    world.createEntity('input'); world.addComponent('input', { type: 'InputQueue', actions: [] } as InputQueue);
    return world;
  }
  enqueueAction(action: string, value?: { arg?: string }): void {
    let args: Record<string, unknown> = {};
    if (value?.arg) { try { args = JSON.parse(value.arg) as Record<string, unknown>; } catch { return; } }
    this.commands.push({ action, args });
  }
  /** Adapter and UI consume the same queue, never duplicate economic/placement rules. */
  command(action: string, args: Record<string, unknown> = {}): void {
    this.commands.push({ action, args }); this.flushCommands();
  }
  private flushCommands(): void { for (const command of this.commands.splice(0)) this.apply(command.action, command.args); }
  private setPhase(phase: S4Phase): void { this.phase = phase; this.deployment.getComponent<Flag>('deployment-phase', 'Flag')!.active = phase === 'deploy'; }
  get deployed() { return this.roster.filter(r => ((this.deployment.getComponent<Tag>(r.instanceId, 'Tag')?.flags ?? 0) & S4_DEPLOYED) !== 0); }
  get canEnterDeploy(): boolean { return this.phase === 'shop' && this.roster.length > 0; }
  get startReason(): string {
    if (this.phase !== 'deploy') return '请先进入部署';
    if (this.dragging) return '请先完成拖放';
    if (!this.deployed.length) return '请至少部署一个单位';
    if (!this.deployed.every(r => this.deployment.hasComponent(r.instanceId, 'Transform') && this.deployment.hasComponent(r.instanceId, 'Shape') && this.deployment.hasComponent(r.instanceId, 'Draggable') && (this.deployment.getComponent<Tag>(r.instanceId, 'Tag')!.flags & 1) !== 0)) return '单位引用已失效';
    if (!this.formation.length) return '敌方阵容尚未生成';
    return '';
  }
  get canStartBattle(): boolean { return !this.startReason; }
  get enemyUnits(): S4UnitPlacement<U>[] { return this.formation.map(u => ({ ...u })); }
  private generateEnemies(): S4UnitPlacement<U>[] {
    const preset = this.config.enemyPreset && this.config.enemyPreset !== 'standard-round1' ? this.config.enemyPreset : this.round === 1 ? 'standard-round1' : 'standard-later';
    const ids = this.content.enemyPresets[preset];
    if(!ids)throw Error(`Unknown enemy preset: ${preset}`);
    // Shared seeded shuffle; generated once per round, never reads the player army.
    const slots = [{ x: 7, y: -5 }, { x: 7, y: 5 }, { x: 12, y: -3 }, { x: 12, y: 3 }];
    const shuffled = seededShuffle(slots, this.seed + this.round - 1);
    return ids.map((unitId, i) => ({ instanceId: `enemy-${unitId}-${i + 1}`, unitId, team: 2, ...shuffled[i]! }));
  }
  placement(instanceId: string): Transform | undefined { return this.deployment.getComponent<Transform>(instanceId, 'Transform'); }
  private apply(action: string, args: Record<string, unknown>): void {
    if (this.disposed) return;
    if(action==='mcfight.catalog-page'&&this.phase==='shop'&&Number.isInteger(args.page)){
      this.shopPage=Math.max(0,Math.min(Math.ceil(this.content.shopIds.length/6)-1,args.page as number));return;
    }
    const unitId = args.unitId as U, instanceId = String(args.instanceId ?? '');
    if (action === A.select && this.phase === 'shop' && this.content.shopIds.includes(unitId)) { this.selectedUnitId = unitId; return; }
    if (action === A.buy && this.phase === 'shop' && this.content.shopIds.includes(unitId)) {
      const def = this.content.units[unitId]; if (this.gold < def.price || this.roster.length >= B.economy.rosterCap) return;
      const seat = [0, 1, 2, 3, 4, 5].find(s => !this.roster.some(r => r.seat === s))!;
      const id = `player-${unitId}-${this.serial[unitId] = (this.serial[unitId] ?? 0) + 1}`;
      this.gold -= def.price; this.roster.push({ instanceId: id, unitId, seat });
      const x = -15 + seat * 6, y = 14;
      this.deployment.createEntity(id);
      const components: Record<string, object> = { Transform: transform(x, y), Shape: { kind: 'circle', radius: def.radius }, Tag: { flags: 1 }, Resource: { id: 'hp', current: def.hp, max: def.hp, min: 0 }, Draggable: { onlyFlag: 'deploy', freePlacement: { bounds: B.battlefield.player, teamMask: 1, deployedMask: S4_DEPLOYED, bench: { ...S4_BENCH, x, y } } } };
      Object.entries(components).forEach(([type, data]) => this.deployment.addComponent(id, { type, ...data } as Component)); return;
    }
    if (action === A.sell && (this.phase === 'shop' || this.phase === 'deploy') && !this.dragging) {
      const index = this.roster.findIndex(r => r.instanceId === instanceId); if (index < 0) return;
      this.gold += this.content.units[this.roster[index]!.unitId].price * B.economy.refund; this.roster.splice(index, 1); this.deployment.destroyEntity(instanceId); return;
    }
    if (action === A.deploy && this.canEnterDeploy) { this.setPhase('deploy'); return; }
    if (action === A.back && this.phase === 'deploy' && !this.dragging) { this.setPhase('shop'); return; }
    if ([A.place, A.move, A.withdraw].includes(action as typeof A.place) && this.phase === 'deploy') {
      const r = this.roster.find(r => r.instanceId === instanceId), t = this.placement(instanceId); if (!r || !t) return;
      const x = action === A.withdraw ? -15 + r.seat * 6 : args.x, y = action === A.withdraw ? 14 : args.y;
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
      this.deployment.getComponent<InputQueue>('input', 'InputQueue')!.actions = [{ source: 'player', key: 'drag', phase: 'drag', x: t.x, y: t.y, values: [x, y] }];
      this.deployment.tick(); this.deployment.getComponent<InputQueue>('input', 'InputQueue')!.actions = []; return;
    }
    if (action === A.start && this.canStartBattle) {
      const units: S4UnitPlacement<U>[] = this.deployed.map(r => ({ instanceId: r.instanceId, unitId: r.unitId, team: 1, x: this.placement(r.instanceId)!.x, y: this.placement(r.instanceId)!.y }));
      this.battle = this.createBattle([...units, ...this.enemyUnits], this.seed + this.round - 1);
      this.setPhase('battle'); this.battleTicks = 0; this.playerDamage = this.enemyDamage = this.playerHealing = this.enemyHealing = 0; return;
    }
    if (action === A.continue && this.phase === 'result') {
      this.battle?.dispose(); this.battle = undefined;
      for (const id of this.deployment.getAllEntities()) this.deployment.destroyEntity(id);
      this.deployment = this.createDeployment(); this.roster.length = 0; this.serial = {}; this.round++;
      this.formation = this.generateEnemies();
      this.outcome = 'none'; this.reward = 0; this.battleTicks = 0; this.playerDamage = this.enemyDamage = this.playerHealing = this.enemyHealing = 0; this.setPhase('shop');
    }
  }
  unitsInBattle(team: 1 | 2) {
    if (!this.battle) return [];
    return this.world.query('Resource', 'Tag').flatMap(([id]) => {
      const hp = this.world.getComponent<Resource>(id, 'Resource')!, tag = this.world.getComponent<Tag>(id, 'Tag')!;
      return hp.id === 'hp' && hp.current > 0 && (tag.flags & s4TeamMask(team)) !== 0 ? [{ id, current: hp.current, max: hp.max ?? hp.current }] : [];
    });
  }
  tick(): void {
    if (this.disposed) return; this.flushCommands();
    if (this.phase !== 'battle' || !this.battle) return;
    this.battle.tick(); this.battleTicks++;
    const damage = this.battle.damage?.(); if (damage) { this.playerDamage = damage.player; this.enemyDamage = damage.enemy; this.playerHealing = damage.playerHealing ?? 0; this.enemyHealing = damage.enemyHealing ?? 0; }
    const p = this.unitsInBattle(1), e = this.unitsInBattle(2);
    if (p.length && e.length && this.battleTicks < B.battlefield.timeoutSeconds * S4_TICK_RATE) return;
    let comparison = p.length === 0 || e.length === 0 ? p.length - e.length : 0;
    if (p.length && e.length) {
      const ratio = (units: typeof p) => units.reduce((n, u) => n + u.current, 0) / units.reduce((n, u) => n + u.max, 0);
      comparison = ratio(p) - ratio(e) || p.length - e.length;
    }
    this.outcome = comparison > 0 ? 'victory' : comparison < 0 ? 'defeat' : 'draw';
    this.reward = B.economy.rewards[this.outcome]; this.gold += this.reward; this.setPhase('result');
    this.results.push({ round: this.round, outcome: this.outcome, reward: this.reward, ticks: this.battleTicks, playerAlive: p.length, enemyAlive: e.length, playerDamage: this.playerDamage, enemyDamage: this.enemyDamage, playerHealing: this.playerHealing, enemyHealing: this.enemyHealing });
  }
  dispose(): void { this.disposed = true; this.engine.stop(); this.engine.world.setObserver(undefined); this.battle?.dispose(); this.commands.length = 0; for (const id of this.deployment.getAllEntities()) this.deployment.destroyEntity(id); }
}
