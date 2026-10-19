import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import {
  canonicalLifeGenerationJson,
  checkLifeGenerationBundle,
} from '@zerocraft/engine/authoring/life-generation-bundle.js';
import { littleValleyGenerationBundle } from './life-generation-bundle.fixture.js';
import {
  createLifeGenerationGate,
  evaluateLifeGenerationGateAdvance,
  LIFE_GENERATION_ARTIFACT_KINDS_BY_STAGE,
  LIFE_GENERATION_GATE_SCHEMA,
  LIFE_GENERATION_STAGES,
  validateLifeGenerationGate,
  validateLifeGenerationGateSequence,
  type LifeGenerationGateDiagnostic,
  type LifeGenerationGateV1,
  type LifeGenerationStage,
  type LifeGenerationVisualArtifact,
} from '@zerocraft/engine/authoring/life-generation-gate.js';

const input = (stage: LifeGenerationStage): unknown => ({ stage, payload: { z: 2, a: `${stage}-content` } });
const artifact = (stage: LifeGenerationStage): LifeGenerationVisualArtifact => ({
  kind: LIFE_GENERATION_ARTIFACT_KINDS_BY_STAGE[stage][0],
  ref: `${stage}-preview`,
});
const create = (
  stage: LifeGenerationStage,
  status: 'pass' | 'fail' = 'pass',
  diagnostics: readonly LifeGenerationGateDiagnostic[] = [],
): LifeGenerationGateV1 => {
  const result = createLifeGenerationGate({ stage, input: input(stage), selfCheck: { status, diagnostics }, visualArtifacts: [artifact(stage)] });
  expect(result.ok, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
  return result.gate!;
};
const decide = (gate: LifeGenerationGateV1, ownerDecision: LifeGenerationGateV1['ownerDecision']): LifeGenerationGateV1 => ({ ...gate, ownerDecision });
const approvedPrefix = (last: number): LifeGenerationGateV1[] => LIFE_GENERATION_STAGES.slice(0, last + 1).map((stage) => decide(create(stage), 'approved'));

describe('Life generation stage gate v1', () => {
  it('creates a stable pending-only closed gate with canonical bundle hashing', () => {
    const warning: LifeGenerationGateDiagnostic = { path: '/b', code: 'later', message: 'warning B', severity: 'warning' };
    const earlier: LifeGenerationGateDiagnostic = { path: '/a', code: 'earlier', message: 'warning A', severity: 'warning' };
    const first = createLifeGenerationGate({
      stage: 'world',
      input: { z: 1, nested: { b: 2, a: 3 } },
      selfCheck: { status: 'pass', diagnostics: [warning, earlier] },
      visualArtifacts: [{ kind: 'scene-warp-graph', ref: 'z-preview' }, { kind: 'collision-zone-map', ref: 'a-preview' }],
    });
    const reordered = createLifeGenerationGate({
      visualArtifacts: [{ ref: 'a-preview', kind: 'collision-zone-map' }, { ref: 'z-preview', kind: 'scene-warp-graph' }],
      selfCheck: { diagnostics: [earlier, warning], status: 'pass' },
      input: { nested: { a: 3, b: 2 }, z: 1 },
      stage: 'world',
    });
    expect(first.ok).toBe(true);
    expect(first.gate).toMatchObject({ schemaVersion: LIFE_GENERATION_GATE_SCHEMA, stage: 'world', ownerDecision: 'pending' });
    expect(JSON.stringify(first.gate)).toBe(JSON.stringify(reordered.gate));
    expect(JSON.parse(JSON.stringify(first.gate))).toEqual(first.gate);
    expect(first.gate!.selfCheck.diagnostics.map((entry) => entry.path)).toEqual(['/a', '/b']);
    expect(first.gate!.visualArtifacts.map((entry) => entry.kind)).toEqual(['collision-zone-map', 'scene-warp-graph']);
    const injected = createLifeGenerationGate({
      stage: 'brief', input: {}, selfCheck: { status: 'pass', diagnostics: [] }, visualArtifacts: [artifact('brief')], ownerDecision: 'approved',
    });
    expect(injected.ok).toBe(false);
    expect(injected.diagnostics.map((entry) => entry.code)).toContain('create_shape');
  });

  it('unlocks exactly one adjacent stage across Brief through Playtest', () => {
    for (let index = 0; index < LIFE_GENERATION_STAGES.length; index++) {
      const stage = LIFE_GENERATION_STAGES[index]!;
      const result = evaluateLifeGenerationGateAdvance(approvedPrefix(index), { stage, input: input(stage) });
      expect(result.ok, `${stage}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
      expect(result.unlockedStage).toBe(LIFE_GENERATION_STAGES[index + 1]);
      expect(result.complete).toBe(index === LIFE_GENERATION_STAGES.length - 1);
    }
  });

  it('blocks pending, failed and changes-requested gates', () => {
    const error: LifeGenerationGateDiagnostic = { path: '/world', code: 'world_invalid', message: 'world invalid', severity: 'error' };
    const cases: Array<[string, LifeGenerationGateV1]> = [
      ['pending', create('brief')],
      ['fail', create('brief', 'fail', [error])],
      ['changes-requested', decide(create('brief'), 'changes-requested')],
    ];
    for (const [label, gate] of cases) {
      const result = evaluateLifeGenerationGateAdvance([gate], { stage: 'brief', input: input('brief') });
      expect(result.ok, label).toBe(false);
      expect(result.unlockedStage, label).toBeUndefined();
    }
  });

  it('marks an old gate stale after any current stage content change', () => {
    const gate = decide(create('world'), 'approved');
    const result = evaluateLifeGenerationGateAdvance(
      [decide(create('brief'), 'approved'), gate],
      { stage: 'world', input: { stage: 'world', payload: { z: 2, a: 'changed' } } },
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'stale_input_hash' }));
  });

  it('requires the inventory review checkpoint before Actors can reach owner review', () => {
    const missing = createLifeGenerationGate({
      stage: 'actors', input: input('actors'), selfCheck: { status: 'pass', diagnostics: [] },
      visualArtifacts: [{ kind: 'npc-schedule', ref: 'actors-schedule' }],
    });
    expect(missing.ok).toBe(false);
    expect(missing.diagnostics).toContainEqual(expect.objectContaining({ code: 'inventory_review_required' }));
    expect(create('actors').visualArtifacts).toContainEqual({ kind: 'inventory-review', ref: 'actors-preview' });
  });

  it('requires profile-review only when the Actors input declares a profile',()=>{
    const stageInput={lifePackage:{profile:{titleKey:'Profile',attributes:[]}}};
    const missing=createLifeGenerationGate({stage:'actors',input:stageInput,selfCheck:{status:'pass',diagnostics:[]},visualArtifacts:[{kind:'inventory-review',ref:'inventory'}]});
    expect(missing.diagnostics).toContainEqual(expect.objectContaining({code:'profile_review_required'}));
    const present=createLifeGenerationGate({stage:'actors',input:stageInput,selfCheck:{status:'pass',diagnostics:[]},visualArtifacts:[{kind:'inventory-review',ref:'inventory'},{kind:'profile-review',ref:'profile'}]});
    expect(present.ok).toBe(true);
    const absent=createLifeGenerationGate({stage:'actors',input:{lifePackage:{}},selfCheck:{status:'pass',diagnostics:[]},visualArtifacts:[{kind:'inventory-review',ref:'inventory'}]});
    expect(absent.ok).toBe(true);
  });

  it('rejects forged approval for a failed or error-bearing gate', () => {
    const error: LifeGenerationGateDiagnostic = { path: '/plot', code: 'plot_invalid', message: 'plot invalid', severity: 'error' };
    const failed = decide(create('plot', 'fail', [error]), 'approved');
    expect(validateLifeGenerationGate(failed, input('plot')).diagnostics.map((entry) => entry.code)).toContain('approval_invalid');
    const forged = structuredClone(create('plot')) as LifeGenerationGateV1;
    (forged.selfCheck as unknown as { diagnostics: LifeGenerationGateDiagnostic[] }).diagnostics.push(error);
    (forged as { ownerDecision: string }).ownerDecision = 'approved';
    expect(validateLifeGenerationGate(forged, input('plot')).diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining(['self_check_error', 'approval_invalid']));
  });

  it('fails closed on skipped, duplicate, unordered or unknown sequence data', () => {
    const brief = decide(create('brief'), 'approved');
    const world = decide(create('world'), 'approved');
    const actors = decide(create('actors'), 'approved');
    const cases: unknown[][] = [
      [brief, actors],
      [brief, brief],
      [world, brief],
      [{ ...brief, extra: true }],
    ];
    for (const gates of cases) {
      const inputs = Object.fromEntries(gates.flatMap((gate) => typeof gate === 'object' && gate !== null && 'stage' in gate
        ? [[String((gate as { stage: unknown }).stage), input(String((gate as { stage: unknown }).stage) as LifeGenerationStage)]] : []));
      expect(validateLifeGenerationGateSequence(gates, inputs).ok).toBe(false);
    }
  });

  it('rejects unsafe artifacts, illegal or forged hashes and non-stable persisted diagnostics', () => {
    const safe = create('assets');
    const unknownSelfCheck = structuredClone(safe) as unknown as { selfCheck: Record<string, unknown> };
    unknownSelfCheck.selfCheck.extra = true;
    expect(validateLifeGenerationGate(unknownSelfCheck, input('assets')).diagnostics.map((entry) => entry.code)).toContain('self_check_shape');
    const unknownArtifact = structuredClone(safe) as unknown as { visualArtifacts: Array<Record<string, unknown>> };
    unknownArtifact.visualArtifacts[0]!.extra = true;
    expect(validateLifeGenerationGate(unknownArtifact, input('assets')).diagnostics.map((entry) => entry.code)).toContain('artifact_shape');
    const unsafe = structuredClone(safe) as LifeGenerationGateV1;
    (unsafe.visualArtifacts[0] as { ref: string }).ref = '../asset.png';
    expect(validateLifeGenerationGate(unsafe, input('assets')).diagnostics.map((entry) => entry.code)).toContain('artifact_ref');
    const illegal = { ...safe, inputHash: 'sha256:ABC' };
    expect(validateLifeGenerationGate(illegal, input('assets')).diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining(['input_hash', 'stale_input_hash']));
    const forged = { ...safe, inputHash: `sha256:${'0'.repeat(64)}` };
    expect(validateLifeGenerationGate(forged, input('assets')).diagnostics.map((entry) => entry.code)).toContain('stale_input_hash');
    const unordered = createLifeGenerationGate({
      stage: 'assets', input: input('assets'), selfCheck: { status: 'pass', diagnostics: [
        { path: '/z', code: 'z', message: 'z', severity: 'warning' },
        { path: '/a', code: 'a', message: 'a', severity: 'warning' },
      ] }, visualArtifacts: [artifact('assets')],
    }).gate!;
    const changed = structuredClone(unordered) as LifeGenerationGateV1;
    (changed.selfCheck as unknown as { diagnostics: LifeGenerationGateDiagnostic[] }).diagnostics.reverse();
    expect(validateLifeGenerationGate(changed, input('assets')).diagnostics.map((entry) => entry.code)).toContain('diagnostics_order');
  });

  it('preserves warnings without allowing them to hide errors', () => {
    const warning: LifeGenerationGateDiagnostic = { path: '/host/theme', code: 'fallback', message: 'starter fallback', severity: 'warning' };
    expect(create('host', 'pass', [warning]).selfCheck.diagnostics).toEqual([warning]);
    const error: LifeGenerationGateDiagnostic = { path: '/host/save', code: 'identity', message: 'identity mismatch', severity: 'error' };
    const result = createLifeGenerationGate({
      stage: 'host', input: input('host'), selfCheck: { status: 'pass', diagnostics: [warning, error] }, visualArtifacts: [artifact('host')],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((entry) => entry.code)).toContain('self_check_error');
  });

  it('strictly validates a stable approved sequence and its exact input set', () => {
    const gates = approvedPrefix(3);
    const inputs = Object.fromEntries(LIFE_GENERATION_STAGES.slice(0, 4).map((stage) => [stage, input(stage)]));
    expect(validateLifeGenerationGateSequence(gates, inputs)).toMatchObject({ ok: true, diagnostics: [] });
    expect(validateLifeGenerationGateSequence(gates, { ...inputs, assets: input('assets') }).diagnostics.map((entry) => entry.code)).toContain('input_stage_set');
    expect(validateLifeGenerationGateSequence([gates[0]], { brief: undefined }).diagnostics.map((entry) => entry.code)).toContain('input_json');
  });

  it('coexists read-only with the bundle checker and never enters runtime payloads', () => {
    const bundle = littleValleyGenerationBundle();
    const before = canonicalLifeGenerationJson(bundle);
    const checkedBefore = checkLifeGenerationBundle(bundle);
    const gateResult = createLifeGenerationGate({
      stage: 'bundle', input: bundle, selfCheck: { status: checkedBefore.ok ? 'pass' : 'fail', diagnostics: [] }, visualArtifacts: [artifact('bundle')],
    });
    const checkedAfter = checkLifeGenerationBundle(bundle);
    expect(gateResult.ok).toBe(true);
    expect(canonicalLifeGenerationJson(bundle)).toBe(before);
    expect(checkedAfter).toEqual(checkedBefore);
    const parsed = compileAndParseLifeGamePackage(bundle.game.lifePackage);
    const engine = new Engine(); engine.load(parsed.blueprint); engine.world.tick(); engine.world.tick();
    const snapshot = canonicalLifeGenerationJson(engine.world.snapshot());
    expect(snapshot).not.toContain(LIFE_GENERATION_GATE_SCHEMA);
    expect(snapshot).not.toContain(gateResult.gate!.inputHash);
  });
});
