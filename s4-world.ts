import type { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { IWorld } from '@engine/core/types.js';
import type { EntityBlueprint } from '@assembly/demo.assembly.js';
import type { PrefabTemplate, FlowAction, FlowState } from '@engine/protocol/components.js';
import { instantiate } from '@skills/tier3/prefab.js';
import { ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
import { modifierStackCapability } from '@skills/tier2/modifier-stack.js';
import { damageRoutingCapability } from '@skills/tier2/damage-routing.js';
import { statBindCapability } from '@skills/tier2/stat-bind.js';
import { capabilities, transform } from './world.js';
import { s4Catalog } from './content/s4-catalog.js';
import type { S4SkillTemplate } from './content/s4-catalog.js';
import { speedPerTick, type S4UnitId } from './content/s4-balance.js';

export const s4Capabilities = [...capabilities, modifierStackCapability, statBindCapability, damageRoutingCapability];
/** Bit zero belongs to trigger-zone. Team identities must never occupy it. */
export const s4TeamMask = (team: 1 | 2): number => team === 1 ? 2 : 4;
export const S4_COMBAT_PENDING = s4Catalog.templates.filter(t => t.blockedBy).map(t => ({ skill: t.id, reason: t.blockedBy! }));
const AIR = 4, GROUND = 8, CONTROL = 16, ACTION = 64, CONTACT_CLOSED = 128;
const ref = (id: string) => `@local:${id}`;
const parent = () => ({ parentId: ref('body'), localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 });
export interface CombatCatalog {
  units: readonly { id:string; hp:number; speed:number; radius:number; armor?:number; toughness?:number; traitFlags?:number; decisionProfileId:string }[];
  decisions: readonly { id:string; candidates:readonly string[] }[];
  templates: readonly (Omit<S4SkillTemplate,'id'|'form'> & { id:string; form:S4SkillTemplate['form']|'devour';maxTargetHp?:number;damageType?:'normal'|'true'; armorPiercing?:boolean; projectile?:boolean; volleyCount?:number; volleyIntervalTicks?:number; volleySpread?:{kind:'none'}|{kind:'seeded-uniform';halfAngleRadians:number}; shape?:'cone'; coneRadius?:number; coneAngleRadians?:number; pulseCount?:number; pulseIntervalTicks?:number; lockAimOnStart?:boolean })[];
}

/** Data translation for the currently expressible subset. Pending templates stay
 * explicit in S4_COMBAT_PENDING and are not represented as successful skills. */
export function buildS4UnitTemplate(unitId: S4UnitId, team: 1 | 2): PrefabTemplate {
  return buildCombatUnitTemplate(s4Catalog,'s4',unitId,team);
}
/** Shared data translation: restoration and the accepted S4 scope use the same systems. */
export function buildCombatUnitTemplate(catalog:CombatCatalog,scope:string,unitId:string,team:1|2):PrefabTemplate {
  const unit = catalog.units.find(u => u.id === unitId);
  if(!unit)throw Error(`Unit is not runnable in ${scope}: ${unitId}`);
  const enemy = s4TeamMask(team === 1 ? 2 : 1), ally = s4TeamMask(team);
  const candidateIds = catalog.decisions.find(d => d.id === unit.decisionProfileId)!.candidates;
  const candidates = candidateIds.map(id => catalog.templates.find(t => t.id === id)!).filter(t => !t.blockedBy);
  const flying = candidates.some(t => t.form === 'dive');
  const perceptionReject=candidates.some(t=>t.form==='devour')?0:flying?0:AIR;
  const entities: Record<string, EntityBlueprint> = {
    body: { Transform: transform(), Shape: { kind: 'circle', radius: unit.radius }, Tag: { flags: ally | (unit.traitFlags??0) },
      DamageReceiver: { resource: 'hp', ...(unit.toughness===undefined?{}:{armor:unit.armor,toughness:unit.toughness}) },
      Resource: { id: 'hp', current: unit.hp, min: 0, max: unit.hp }, Mortal: { resource: 'hp', atOrBelow: 0 },
      Status: { flags: (flying ? AIR : GROUND) | CONTACT_CLOSED }, State: { fsmId: ref('body'), current: 'Free', previous: 'Free' },
      Perception: { targetTag: enemy, sightRadius: 60, targetCheck: { aliveResource: 'hp', rejectStatusMask: perceptionReject } },
      Steering: { mode: 'seek', speed: speedPerTick(unit.speed), stopRange: Math.min(...candidates.filter(t => t.form !== 'heal').map(t => t.range)), haltStatusMask: CONTROL | ACTION,
        separation: { radius: unit.radius * 2, weight: speedPerTick(unit.speed) * .3, tagMask: ally } } },
  };
  for (const skill of candidates) {
    const key = ref(skill.id), dive = skill.form === 'dive', charge = skill.form === 'charge', heal = skill.form === 'heal',devour=skill.form==='devour';
    const channeledCone = skill.shape === 'cone' && (skill.pulseCount ?? 0) > 0;
    const phase = (value: string): FlowAction => ({ kind: 'set-state', targetId: key, value });
    const lock = (value: boolean): FlowAction => ({ kind: 'set-status', targetEntity: ref('body'), targetId: String(ACTION), value });
    const window = (open: boolean): FlowAction[] => dive ? [
      { kind: 'set-status', targetEntity: ref('body'), targetId: String(AIR), value: !open },
      { kind: 'set-status', targetEntity: ref('body'), targetId: String(GROUND), value: open },
    ] : [];
    const sourceCheck = { aliveResource: 'hp', rejectStatusMask: CONTROL };
    const startCheck = { ...sourceCheck, ...(heal ? { resource: { id: 'hp', max: unit.hp * skill.hpThreshold! },
      neighborhood: { radius: skill.safeRadius!, tagMask: enemy, aliveResource: 'hp', count: { max: 0 } } } : {}) };
    const cancel = { whenEntities: [{ entityId: ref('body'), check: sourceCheck, not: true }], to: 'Recovery', clearTarget: true,
      do: [phase('Recovery'), lock(true), ...window(false)] };
    const lostTarget = { ...cancel, whenEntities: [{ targetFlow: key, check: { aliveResource: 'hp' }, not: true }] };
    const states: FlowState[] = [
      { id: 'Ready', transitions: [{ when: { kind: 'and', of: [
        { kind: 'state', fsmId: 'mcfight.phase', equals: 'battle' },
        { kind: 'state', fsmId: ref('body'), equals: 'Free' },
        { kind: 'timer', id: key, cmp: 'gte', value: skill.cd },
      ] }, whenEntities: [{ entityId: ref('body'), check: startCheck }],
      captureTarget: { sourceEntity: ref('body'), captureAim: skill.form === 'beam' || skill.form === 'projectile' || channeledCone, projectileRangeMultiplier: skill.form === 'projectile' ? 1.15 : undefined, check: { aliveResource: 'hp', tagMask: enemy, rejectStatusMask: dive ? 0 : AIR, range: { originEntity: ref('body'), max: skill.range, ...(skill.form === 'projectile' ? { includeTargetRadius: true } : {}), ...(skill.minRange === undefined ? {} : { min: skill.minRange }) } } },
      to: 'Windup', do: [phase('Windup'), { kind: 'set-state', targetId: ref('body'), value: skill.id }, lock(!dive), ...window(true)] }] },
      { id: 'Windup', transitions: [cancel, lostTarget, { after: Math.max(0, skill.windup - 1), to: 'Active', do: [phase('Active')] }] },
      { id: 'Active', transitions: [cancel, lostTarget, { after: dive ? skill.life : 1, to: 'Recovery', do: [phase('Recovery'), lock(true)] }] },
      { id: 'Recovery', transitions: [{ after: Math.max(0, skill.recovery - 1), to: 'Ready', clearTarget: true,
        do: [phase('Ready'), { kind: 'set-state', targetId: ref('body'), value: 'Free' }, lock(false), ...window(false)] }] },
    ];
    if (heal) {
      delete states[0]!.transitions![0]!.captureTarget;
      states[1]!.transitions = [cancel, states[1]!.transitions!.at(-1)!];
      states[2]!.transitions = [cancel, states[2]!.transitions!.at(-1)!];
    }
    if(devour){
      const start=states[0]!.transitions![0]!;
      start.captureTarget!.check.rejectStatusMask=0;
      start.captureTarget!.check.resource={id:'hp',field:'max',max:skill.maxTargetHp!};
      start.captureTarget!.destroyOnCapture=true;
      start.to='Recovery';start.do=[phase('Recovery'),{kind:'set-state',targetId:ref('body'),value:skill.id},lock(true)];
      states.splice(1,2); // No attack area or later release: successful capture deletes now.
    }
    if (charge) {
      const contact = (open: boolean): FlowAction => ({ kind: 'set-status', targetEntity: ref('body'), targetId: String(CONTACT_CLOSED), value: !open });
      states[1]!.transitions!.at(-1)!.do = [phase('Active'), lock(false), contact(true)];
      const finish = [phase('Recovery'), lock(true), contact(false)];
      states[2]!.transitions = [cancel, lostTarget,
        { whenEntities: [{ targetFlow: key, check: { range: { originEntity: ref('body'), max: skill.radius } } }], to: 'Recovery', do: finish },
        { after: skill.life, to: 'Recovery', do: finish }];
      const gate = { kind: 'state' as const, fsmId: key, equals: 'Active' };
      for (const [field, baseline, active] of [['speed', speedPerTick(unit.speed), skill.speed!], ['stopRange', entities.body!.Steering!.stopRange as number, skill.radius]] as const) {
        const target = ref(`${skill.id}-${field}`);
        entities[`${skill.id}-${field}-base`] = { Hierarchy: parent(), ModifierSource: { id: target, target, op: 'add', value: baseline } };
        entities[`${skill.id}-${field}-active`] = { Hierarchy: parent(), ModifierSource: { id: ref(`${skill.id}-${field}-active`), target, op: 'add', value: active - baseline, gate } };
      }
      entities.body!.StatBind = { bindings: ['speed', 'stopRange'].map(field => ({ source: 'ModifierTotals', key: ref(`${skill.id}-${field}`), component: 'Steering', field })) };
    }
    if (dive) {
      // Reuse S2's intent -> next-boundary status -> steering contract. The
      // original short probe closes on Rise entry; S4 instead closes at its end.
      const start = states[0]!.transitions![0]!;
      start.to = 'Prepare';
      start.do = [phase('Prepare'), { kind: 'set-state', targetId: ref('body'), value: skill.id }, lock(false), ...window(true)];
      const finish: FlowAction[] = [phase('Ready'), { kind: 'set-state', targetId: ref('body'), value: 'Free' }];
      const abort = { ...cancel, to: 'Abort', do: [phase('Abort'), lock(true), ...window(false)] };
      const targetGone = { whenEntities: [{ targetFlow: key, check: { aliveResource: 'hp' }, not: true }], to: 'Abort', clearTarget: true, do: abort.do };
      states.splice(1, states.length - 1,
        { id: 'Prepare', transitions: [abort, targetGone, { to: 'Windup', do: [phase('Windup')] }] },
        { id: 'Windup', transitions: [abort, targetGone, { after: skill.windup - 1, to: 'Active', do: [phase('Active')] }] },
        { id: 'Active', transitions: [abort, targetGone, { after: skill.life - 2, to: 'RisePrepare', do: [phase('RisePrepare'), lock(true)] }] },
        { id: 'RisePrepare', transitions: [abort, { to: 'Recovery', do: [phase('Recovery')] }] },
        { id: 'Recovery', transitions: [abort, { after: skill.recovery - 2, to: 'ClosePrepare', do: [phase('ClosePrepare'), lock(false), ...window(false)] }] },
        { id: 'ClosePrepare', transitions: [{ to: 'Ready', clearTarget: true, do: finish }] },
        { id: 'Abort', transitions: [{ after: skill.recovery - 1, to: 'Ready', clearTarget: true, do: [...finish, lock(false)] }] },
      );
      // Existing stat-bind commits for next decision tick, alongside the window.
      // Outside a cast stop at launch range; during descent seek the real target.
      const stop = ref(`${skill.id}-stop-base`);
      entities[`${skill.id}-stop-base`] = { Hierarchy: parent(), ModifierSource: { id: stop, target: stop, op: 'add', value: skill.range } };
      entities[`${skill.id}-stop-active`] = { Hierarchy: parent(), ModifierSource: { id: ref(`${skill.id}-stop-active`), target: stop, op: 'add', value: unit.radius - skill.range,
        gate: { kind: 'and', of: [{ kind: 'not', of: { kind: 'state', fsmId: ref('body'), equals: 'Free' } }, { kind: 'not', of: { kind: 'state', fsmId: key, equals: 'ClosePrepare' } }] } } };
      entities.body!.StatBind = { bindings: [{ source: 'ModifierTotals', key: stop, component: 'Steering', field: 'stopRange' }] };
    }
    if (channeledCone) {
      // Every segment is a normal production Caster/Prefab release. The Flow
      // only schedules them, so geometry and damage remain shared data.
      const pulses = skill.pulseCount!;
      const interval = skill.pulseIntervalTicks!;
      const windup = states[1]!;
      const release = windup.transitions!.at(-1)!;
      release.to = 'Pulse1';
      release.do = [phase('Pulse1')];
      const coneStates: FlowState[] = [states[0]!, windup];
      for (let index = 0; index < pulses; index++) {
        const stateId = `Pulse${index + 1}`;
        const next = index + 1 < pulses ? `Pulse${index + 2}` : 'Recovery';
        coneStates.push({ id: stateId, transitions: [cancel, lostTarget, {
          after: index + 1 < pulses ? Math.max(0, interval - 1) : 0,
          to: next, do: next === 'Recovery' ? [phase('Recovery'), lock(true)] : [phase(next)],
        }] });
      }
      coneStates.push(states[3]!);
      states.splice(0, states.length, ...coneStates);
      for (let index = 0; index < pulses; index++) {
        const stateId = `Pulse${index + 1}`;
        const pulseId = `${skill.id}-pulse-${index + 1}`;
        entities[pulseId] = { Hierarchy: parent(),
          EventWhen: { signal: `${key}-pulse-${index + 1}`, mode: 'edge', when: { kind: 'state', fsmId: key, equals: stateId } },
          Caster: { onSignal: `${key}-pulse-${index + 1}`, template: `${scope}-${team}-${skill.id}`, at: 'self', originEntity: ref('body'),
            targetFlow: key, sourceCheck, targetCheck: { aliveResource: 'hp' }, useCapturedAim: true, releasePhase: 'resolve' },
        };
      }
    }
    entities[skill.id] = { Transform: transform(), Hierarchy: parent(), Timer: { id: key, elapsed: skill.cd, duration: skill.cd, loop: false },
      State: { fsmId: key, current: 'Ready', previous: 'Ready' }, GameFlow: { id: key, current: 'Ready', entered: false, states } };
    entities[`${skill.id}-start`] = { Hierarchy: parent(), EventWhen: { signal: `${key}-start`, mode: 'edge', when: { kind: 'state', fsmId: key, equals: devour?'Recovery':dive ? 'Prepare' : 'Windup' } },
      Effect: { onSignal: `${key}-start`, kind: 'reset-timer', targetEntity: key, value: skill.cd } };
    if(devour)continue;
    if(channeledCone) continue;
    const committed = skill.form === 'melee';
    const target = committed || skill.releaseAt === 'target';
    entities[`${skill.id}-release`] = { Hierarchy: parent(), EventWhen: { signal: `${key}-release`, mode: 'edge', when: { kind: 'state', fsmId: key, equals: 'Active' } },
      Caster: { onSignal: `${key}-release`, template: `${scope}-${team}-${skill.id}`, at: target ? 'target' : 'self', originEntity: ref('body'),
        ...(skill.volleyCount ? { volleyCount: skill.volleyCount, volleyIntervalTicks: skill.volleyIntervalTicks ?? 0, volleySpeed: skill.speed, volleyMaxDistance: skill.range * 1.15, volleySpread: skill.volleySpread ?? { kind: 'none' } } : {}),
        releasePhase: 'resolve', sourceCheck,
        ...(heal ? { onlyHitTarget: true } : { targetFlow: key, targetCheck: { aliveResource: 'hp' }, alignToTarget: committed,
          onlyHitTarget: committed || dive || charge,
          useCapturedAim: skill.form === 'beam' || skill.form === 'projectile',
          ...(skill.form === 'projectile' ? { projectile: true } : {}),
          followSource: dive || charge }) } };
  }
  return { entities };
}

export function assembleS4World(engine: Engine): void {
  assembleCombatWorld(engine,s4Catalog,'s4');
}
export function assembleCombatWorld(engine:Engine,catalog:CombatCatalog,scope:string):void {
  const templates: Record<string, PrefabTemplate> = {};
  for (const team of [1, 2] as const) for (const skill of catalog.templates.filter(t => !t.blockedBy&&t.form!=='devour')) {
    templates[`${scope}-${team}-${skill.id}`] = { entities: { zone: {
      Transform: transform(), Shape: skill.form === 'beam' ? { kind: 'capsule', radius: skill.radius, length: skill.range - 2 * skill.radius } : skill.shape === 'cone' ? { kind: 'cone', radius: skill.coneRadius!, angle: skill.coneAngleRadians! } : { kind: 'circle', radius: skill.radius }, Tag: { flags: ZONE_FLAG },
      Timer: { id: 'life', elapsed: 0, duration: skill.life, loop: false },
      Hitbox: { resource: 'hp', amount: skill.damage, targetMask: s4TeamMask(skill.form === 'heal' ? team : team === 1 ? 2 : 1), consumeOnHit: true, ...(skill.form === 'projectile' ? { singleImpact: true } : {}),
        ...(skill.onHitStatus ? { onHitStatus: [{ id: skill.onHitStatus, duration: skill.onHitStatus === 'burn' ? 200 : skill.onHitStatus === 'wither' ? 80 : 100, ...(skill.onHitStatus === 'burn' ? { damagePerTick: 1, period: 20 } : skill.onHitStatus === 'wither' ? { damagePerTick: 3, period: 20 } : { multiplier: .7 }) }] } : {}),
        ...(skill.damageType?{damageType:skill.damageType}:{}),...(skill.armorPiercing?{armorPiercing:true}:{}),
        sourceCheck: { aliveResource: 'hp', rejectStatusMask: CONTROL | (skill.form === 'charge' ? CONTACT_CLOSED : 0) },
        ...(['area', 'beam', 'charge'].includes(skill.form) ? { requireMask: GROUND } : {}) },
      ...(skill.form === 'projectile' ? { Launch: { speed: skill.speed, toward: 'dir', dirX: 1, dirY: 0 } } : {}),
    } } };
  }
  engine.load({ capabilities: s4Capabilities, entities: {
    session: { State: { fsmId: 'mcfight.phase', current: 'shop', previous: 'shop' } },
    library: { PrefabLibrary: { seq: 0, templates } },
    modifiers: { ModifierTotals: { totals: {} } },
  } });
}
export function spawnS4Unit(world: IWorld, unitId: S4UnitId, instanceId: string, team: 1 | 2, x: number, y: number): string {
  instantiate(world, buildS4UnitTemplate(unitId, team), instanceId, 0, x, y);
  return `${instanceId}#0:body`;
}
