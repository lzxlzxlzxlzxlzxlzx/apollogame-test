import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { EntityBlueprint } from '@assembly/demo.assembly.js';
import type { PrefabTemplate, FlowState, FlowAction } from '@engine/protocol/components.js';
import { instantiate, prefabCapability } from '@skills/tier3/prefab.js';
import { flowCapability } from '@skills/tier3/flow.js';
import { aggroCapability } from '@skills/tier3/aggro.js';
import { casterCapability } from '@skills/tier3/caster.js';
import { timerCapability } from '@skills/atoms/timer/index.js';
import { eventWhenCapability } from '@skills/tier2/event-when.js';
import { effectApplyCapability } from '@skills/tier2/effect-apply.js';
import { motionApplyCapability } from '@skills/tier1/motion-apply.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { triggerZoneCapability, ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
import { hitboxCapability } from '@skills/tier2/hitbox.js';
import { overTimeCapability } from '@skills/tier2/over-time.js';
import { resourceCapability } from '@skills/atoms/resource/index.js';
import { mortalCapability } from '@skills/tier2/mortal.js';
import { destroyCapability } from '@skills/atoms/destroy/index.js';
import { hierarchyResolveCapability } from '@skills/tier1/hierarchy-resolve.js';
import { hierarchyCascadeCapability } from '@skills/tier1/hierarchy-cascade.js';
import { launchCapability } from '@skills/tier2/launch.js';
import { lifetimeCapability } from '@skills/tier1/lifetime.js';
import { steeringCapability } from '@skills/tier2/steering.js';
import { keybindCapability } from '@skills/tier2/keybind.js';
import { knockbackCapability } from '@skills/tier2/knockback.js';
import { mcfightB3Capability } from '@skills/tier3/mcfight-b3.js';
import { volleyEmitterCapability } from '@skills/tier3/volley-emitter.js';
import { catalog, requireId, validateCatalog, type UnitDefinition } from './content/catalog.js';

export const capabilities = [timerCapability, flowCapability, aggroCapability, casterCapability, prefabCapability,
  eventWhenCapability, effectApplyCapability, motionApplyCapability, overlapDetectCapability, triggerZoneCapability,
  hitboxCapability, overTimeCapability, resourceCapability, mortalCapability, destroyCapability, hierarchyResolveCapability,
  hierarchyCascadeCapability, launchCapability, lifetimeCapability, steeringCapability, keybindCapability, knockbackCapability];
capabilities.push(volleyEmitterCapability, mcfightB3Capability);
export const transform = (x = 0, y = 0) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
export const selectionAction = (id: string) => `mcfight.select.${id}`;
export const bodyId = (unit: string, sequence = 0) => `${unit}#${sequence}:body`;

/** Translation only: public Flow/conditions select; public caster/hitbox resolve. */
export function buildUnitTemplate(unit: UnitDefinition): PrefabTemplate {
  const decision = requireId(catalog.decisions, unit.decisionProfileId);
  const candidates = decision.candidates.map(id => requireId(catalog.loadouts, id));
  const targetReject = candidates.map(l => requireId(catalog.templates, l.templateId).rejectStatusMask).reduce((a, b) => a & b);
  const entities: Record<string, EntityBlueprint> = {
    body: { Transform: transform(), Shape: { kind: 'circle', radius: unit.radius }, Tag: { flags: unit.tags },
      Status: { flags: unit.initialStatus }, Resource: { id: 'hp', current: unit.hp, min: 0, max: unit.hp },
      Perception: { targetTag: 2, sightRadius: Math.max(...candidates.map(l => l.parameters.range)), targetCheck: { aliveResource: 'hp', rejectStatusMask: targetReject } },
      Mortal: { resource: 'hp', atOrBelow: 0 }, State: { fsmId: '@local:body', current: 'Free', previous: 'Free' } },
  };
  // Candidate order is the creation/Flow traversal order. Idle fallback has no transition.
  for (const loadoutId of decision.candidates) {
    const loadout = requireId(catalog.loadouts, loadoutId);
    const template = requireId(catalog.templates, loadout.templateId), p = loadout.parameters;
    const ref = `@local:${loadoutId}`, [ready, windup, active, recovery] = template.phases;
    const state = (value: string): FlowAction => ({ kind: 'set-state', targetId: ref, value });
    const window = (open: boolean): FlowAction[] => template.window ? [
      { kind: 'set-status', targetEntity: '@local:body', targetId: String(template.window.airborneMask), value: !open },
      { kind: 'set-status', targetEntity: '@local:body', targetId: String(template.window.groundMask), value: open },
    ] : [];
    const sourceCheck = { aliveResource: template.resource, rejectStatusMask: template.sourceRejectStatusMask };
    const cancel = { whenEntities: [{ entityId: '@local:body', check: sourceCheck, not: true }], to: recovery, clearTarget: true, do: [state(recovery), ...window(false)] };
    const states: FlowState[] = [
      { id: ready, transitions: [{ when: { kind: 'and', of: [
        { kind: 'state', fsmId: 'mcfight.phase', equals: 'battle' },
        { kind: 'state', fsmId: '@local:body', equals: 'Free' },
        { kind: 'timer', id: ref, cmp: 'gte', value: p.cd },
      ] }, whenEntities: [{ entityId: '@local:body', check: sourceCheck }],
        captureTarget: { sourceEntity: '@local:body', check: { aliveResource: template.resource, rejectStatusMask: template.rejectStatusMask, range: { originEntity: '@local:body', max: p.range } } },
        to: windup, do: [state(windup), { kind: 'set-state', targetId: '@local:body', value: loadoutId }, ...window(true)] }] },
      { id: windup, transitions: [cancel, { after: p.windup, to: active, do: [state(active)] }] },
      { id: active, transitions: [cancel, { after: 0, to: recovery, do: [state(recovery)] }] },
      { id: recovery, transitions: [{ after: p.recovery, to: ready, clearTarget: true, do: [state(ready), { kind: 'set-state', targetId: '@local:body', value: 'Free' }, ...window(false)] }] },
    ];
    entities[loadoutId] = {
      Transform: transform(), Hierarchy: { parentId: '@local:body', localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 },
      Timer: { id: ref, elapsed: p.cd, duration: p.cd, loop: false },
      State: { fsmId: ref, current: ready, previous: ready }, GameFlow: { id: ref, current: ready, entered: false, states },
    };
    entities[`${loadoutId}-start`] = { Hierarchy: { parentId: '@local:body' },
      EventWhen: { signal: `${ref}-start`, mode: 'edge', when: { kind: 'state', fsmId: ref, equals: windup } },
      Effect: { onSignal: `${ref}-start`, kind: 'reset-timer', targetEntity: ref, value: p.cd } };
    entities[`${loadoutId}-release`] = { Hierarchy: { parentId: '@local:body' },
      EventWhen: { signal: `${ref}-release`, mode: 'edge', when: { kind: 'state', fsmId: ref, equals: active } },
      Caster: { onSignal: `${ref}-release`, template: `attack-${loadoutId}`, originEntity: '@local:body',
        at: template.releaseAt,
        ...(template.targetPolicy === 'captured-entity' ? { targetFlow: ref, sourceCheck, targetCheck: { aliveResource: template.resource } } : {}) } };
    if (template.window) {
      entities.body!.Steering = { mode: 'seek', speed: p.speed, stopRange: 0, haltStatusMask: template.window.airborneMask | template.sourceRejectStatusMask };
    }
  }
  return { entities };
}
export function attackTemplates(): Record<string, PrefabTemplate> {
  return Object.fromEntries(catalog.loadouts.map(loadout => {
    const p = loadout.parameters, template = requireId(catalog.templates, loadout.templateId);
    return [`attack-${loadout.id}`, { entities: { zone: {
      Transform: transform(), Shape: { kind: 'circle', radius: p.radius }, Tag: { flags: ZONE_FLAG },
      Timer: { id: 'life', elapsed: 0, duration: p.life, loop: false },
      Hitbox: { resource: template.resource, amount: p.damage, targetMask: 2, consumeOnHit: true },
      ...(template.hitForm === 'projectile' ? { Launch: { speed: p.speed, toward: 'target', targetMask: 2 } } : {}),
    } } }];
  }));
}
export function assembleWorld(engine: Engine): void {
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(errors.join('\n'));
  const entities: Record<string, EntityBlueprint> = {
    session: { State: { fsmId: 'mcfight.phase', current: 'shop', previous: 'shop' } },
    selection: { State: { fsmId: 'mcfight.selection', current: catalog.units[0]!.id, previous: catalog.units[0]!.id } },
    library: { PrefabLibrary: { seq: 0, templates: attackTemplates() } },
  };
  for (const unit of catalog.units) {
    entities[`select-${unit.id}`] = {
      KeyBinding: { key: selectionAction(unit.id), signal: selectionAction(unit.id), phase: 'action' },
      Effect: { onSignal: selectionAction(unit.id), kind: 'set-state', targetId: 'mcfight.selection', value: unit.id },
    };
  }
  engine.load({ capabilities, entities });
  catalog.units.forEach((unit, i) => instantiate(engine.world, buildUnitTemplate(unit), unit.id, 0, i * 10, 0));
}


