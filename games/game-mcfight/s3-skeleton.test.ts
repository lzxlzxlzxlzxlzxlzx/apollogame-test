// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { catalog, validateCatalog, requireId } from './content/catalog.js';
import { McFightSession } from './session.js';
import { readView, renderShop } from './render.js';
import { capabilities, buildUnitTemplate, bodyId, selectionAction, attackTemplates } from './world.js';
import { instantiate } from '@skills/tier3/prefab.js';
import { applyCommands } from '@net/commands.js';
import { analyzeSystemGraph } from '@assembly/system-graph.js';
import { validateReferences } from '@assembly/validate-references.js';
import type { EntityBlueprint } from '@assembly/demo.assembly.js';
import { ALL_CAPABILITIES } from '@assembly/capability-registry.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import type { Timer, Resource, GameFlow, State, Transform } from '@engine/protocol/components.js';
import { mount } from './s3-mount.js';

describe('S3 compiled skeleton', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('catalog IDs and all cross references resolve; authoring graph is frozen', () => {
    expect(validateCatalog(catalog)).toEqual([]);
    expect(Object.isFrozen(catalog.loadouts[0]!.parameters)).toBe(true);
    const broken = structuredClone(catalog);
    broken.units = [...broken.units, broken.units[0]!];
    broken.loadouts[0]!.templateId = 'missing';
    expect(validateCatalog(broken).join()).toMatch(/Duplicate ID/);
    expect(validateCatalog(broken).join()).toMatch(/Unresolved/);
  });
  it('creates three real bodies and loadouts; two shop ticks cannot start combat', () => {
    const session = new McFightSession(), w = session.engine.world;
    expect(validateReferences(w.snapshot() as unknown as Record<string, EntityBlueprint>)).toEqual([]);
    const trace = [];
    for (let tick = 1; tick <= 2; tick++) { w.tick(); trace.push({ tick, ...readView(session) }); }
    expect(session.phase).toBe('shop');
    expect(trace[1]!.units.map(unit => unit.id)).toEqual(['vindicator', 'skeleton', 'vex']);
    expect(trace.every(frame => frame.units.every(unit => unit.skills.every(skill => skill.phase === 'Ready' && skill.cd === 0)))).toBe(true);
    expect(w.query('Hitbox')).toHaveLength(0);
    expect(w.query('Launch')).toHaveLength(0);
    console.log('S3_TWO_TICKS', JSON.stringify(trace));
    session.dispose();
  });
  it('public input→keybind→effect changes session selection and rendered details', () => {
    const session = new McFightSession();
    session.input.enqueueAction(selectionAction('skeleton'));
    applyCommands(session.engine.world, session.input.commandsForTick(1)); session.engine.world.tick();
    expect(session.selectedUnitId).toBe('skeleton');
    const tree = renderShop(readView(session));
    expect(validateLayoutNode(tree)).toEqual([]);
    expect(tree.children!.find(node => node.id === 'details')!.children![0]!.props).toMatchObject({ text: '骷髅' });
    session.input.enqueueAction('mcfight.buy');
    applyCommands(session.engine.world, session.input.commandsForTick(2)); session.engine.world.tick();
    expect(session.phase).toBe('shop');
    expect(session.selectedUnitId).toBe('skeleton');
    session.dispose();
  });
  it('same template instances never share HP, cooldown, phase or target snapshots', () => {
    const session = new McFightSession(), w = session.engine.world;
    // R2 removes the historical second body-value table; isolation still means
    // the first instance retains its initial canonical HP after editing the second.
    const originalHp = w.getComponent<Resource>(bodyId('vindicator'), 'Resource')!.current;
    expect(originalHp).toBe(catalog.units[0]!.hp);
    instantiate(w, buildUnitTemplate(catalog.units[0]!), 'vindicator', 1, 40, 0);
    w.getComponent<Resource>(bodyId('vindicator', 1), 'Resource')!.current = 17;
    w.getComponent<Timer>('vindicator#1:axe', 'Timer')!.elapsed = 0;
    const flow = w.getComponent<GameFlow>('vindicator#1:axe', 'GameFlow')!;
    flow.targetSnapshot = { sourceId: bodyId('vindicator', 1), targetId: bodyId('vex') };
    flow.current = 'Recovery';
    expect(w.getComponent<Resource>(bodyId('vindicator'), 'Resource')!.current).toBe(originalHp);
    expect(w.getComponent<Timer>('vindicator#0:axe', 'Timer')!.elapsed).toBe(8);
    expect(w.getComponent<GameFlow>('vindicator#0:axe', 'GameFlow')!.targetSnapshot).toBeUndefined();
    expect(w.getComponent<GameFlow>('vindicator#0:axe', 'GameFlow')!.current).toBe('Ready');
    expect(catalog.loadouts[0]!.parameters.cd).toBe(8);
    session.dispose();
  });
  it('every skill assembles the declared effect geometry and presentation action', () => {
    const session = new McFightSession();
    for (const unit of catalog.units) {
      const art = requireId(catalog.presentations, unit.presentationProfileId);
      for (const id of unit.skillLoadoutIds) {
        const skill = requireId(catalog.loadouts, id), template = requireId(catalog.templates, skill.templateId);
        expect(template.action).toBe(art.action);
        const zone = attackTemplates()[`attack-${id}`]!.entities.zone!;
        expect(zone.Hitbox).toMatchObject({ amount: skill.parameters.damage, resource: template.resource });
        expect(zone.Shape).toEqual({ kind: 'circle', radius: skill.parameters.radius });
        expect(zone.Timer).toMatchObject({ duration: skill.parameters.life });
        if (template.hitForm === 'projectile') expect(zone.Launch).toEqual({ speed: skill.parameters.speed, toward: 'target', targetMask: 2 });
        const data = buildUnitTemplate(unit);
        expect(data.entities[`${id}-release`]!.Caster).toMatchObject({ at: template.releaseAt, template: `attack-${id}` });
        if (template.window) {
          expect(data.entities.body!.Steering).toMatchObject({ speed: skill.parameters.speed, haltStatusMask: template.window.airborneMask | template.sourceRejectStatusMask });
          expect(JSON.stringify(data.entities[id]!.GameFlow)).toContain(String(template.window.groundMask));
        }
        expect(session.engine.world.hasComponent(`${unit.id}#0:${id}`, 'GameFlow')).toBe(true);
      }
    }
    expect(catalog.presentations.every(art => art.clips.every(clip => clip.source === null && clip.status === 'missing'))).toBe(true);
    session.dispose();
  });
  it('full capability assembly is acyclic; optional order references resolve globally', () => {
    const graph = analyzeSystemGraph(capabilities);
    expect(graph.sccs).toEqual([]); expect(graph.duplicateIds).toEqual([]);
    const globalIds = new Set(ALL_CAPABILITIES.flatMap(cap => cap.systems.map(system => system.id)));
    expect(graph.danglingEdges.filter(edge => !globalIds.has(edge.ref))).toEqual([]);
    console.log('S3_ASSEMBLY_AUDIT', JSON.stringify(graph));
  });
  it('unmount stops the common loop, removes controls, clears instances and queued input; remount is fresh', () => {
    const frames = new Map<number, FrameRequestCallback>(); let next = 0;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++next, fn); return next; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const host = document.createElement('div'); document.body.append(host);
    const unmount = mount(host);
    expect(frames.size).toBe(1); expect(host.querySelector('[data-action]')).not.toBeNull();
    const button = host.querySelector<HTMLButtonElement>('[data-action="mcfight.select.skeleton"]')!;
    button.click();
    const [frameId, frame] = [...frames.entries()][0]!; frames.delete(frameId);
    frame(performance.now() + 110);
    expect(host.querySelector('#unit-name')!.textContent).toBe('骷髅');
    unmount(); expect(frames.size).toBe(0); expect(host.children).toHaveLength(0);
    const s = new McFightSession(); s.input.enqueueAction(selectionAction('vex')); s.dispose(); s.dispose();
    expect(s.input.commandsForTick(1)).toEqual([]); expect(s.engine.world.getAllEntities()).toEqual([]);
    const again = mount(host); expect(frames.size).toBe(1); expect(host.textContent).toContain('商店 / shop');
    again(); host.remove();
  });
});
