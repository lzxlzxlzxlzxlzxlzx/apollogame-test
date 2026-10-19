import { sha256Canonical } from './life-generation-bundle.js';

export const LIFE_GENERATION_GATE_SCHEMA = 'zerocraft.life-generation-gate.v1' as const;
export const LIFE_GENERATION_STAGES = ['brief', 'world', 'actors', 'plot', 'assets', 'host', 'bundle', 'playtest'] as const;
export const LIFE_GENERATION_SELF_CHECK_STATUSES = ['pass', 'fail'] as const;
export const LIFE_GENERATION_OWNER_DECISIONS = ['pending', 'approved', 'changes-requested'] as const;

export type LifeGenerationStage = typeof LIFE_GENERATION_STAGES[number];
export type LifeGenerationSelfCheckStatus = typeof LIFE_GENERATION_SELF_CHECK_STATUSES[number];
export type LifeGenerationOwnerDecision = typeof LIFE_GENERATION_OWNER_DECISIONS[number];
export type LifeGenerationGateDiagnosticSeverity = 'error' | 'warning';

export const LIFE_GENERATION_ARTIFACT_KINDS_BY_STAGE = {
  brief: ['game-card'],
  world: ['scene-warp-graph', 'collision-zone-map'],
  actors: ['inventory-review', 'npc-schedule', 'interaction-range-overlay', 'profile-review'],
  plot: ['quest-graph', 'condition-unlock-graph'],
  assets: ['asset-slot-sheet', 'asset-placement-preview'],
  host: ['host-identity-card', 'hud-viewport-preview'],
  bundle: ['bundle-validation-report', 'compiled-preview'],
  playtest: ['playable-preview', 'first-session-route', 'difference-report'],
} as const satisfies Readonly<Record<LifeGenerationStage, readonly string[]>>;

export type LifeGenerationVisualArtifactKind = typeof LIFE_GENERATION_ARTIFACT_KINDS_BY_STAGE[LifeGenerationStage][number];

export interface LifeGenerationGateDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly severity: LifeGenerationGateDiagnosticSeverity;
}

export interface LifeGenerationVisualArtifact {
  readonly kind: LifeGenerationVisualArtifactKind;
  readonly ref: string;
}

export interface LifeGenerationGateV1 {
  readonly schemaVersion: typeof LIFE_GENERATION_GATE_SCHEMA;
  readonly stage: LifeGenerationStage;
  readonly inputHash: string;
  readonly selfCheck: {
    readonly status: LifeGenerationSelfCheckStatus;
    readonly diagnostics: readonly LifeGenerationGateDiagnostic[];
  };
  readonly visualArtifacts: readonly LifeGenerationVisualArtifact[];
  readonly ownerDecision: LifeGenerationOwnerDecision;
}

export interface LifeGenerationGateValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly LifeGenerationGateDiagnostic[];
  readonly gate?: LifeGenerationGateV1;
}

export interface LifeGenerationGateSequenceValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly LifeGenerationGateDiagnostic[];
  readonly gates?: readonly LifeGenerationGateV1[];
}

export interface LifeGenerationGateAdvanceResult {
  readonly ok: boolean;
  readonly currentStage?: LifeGenerationStage;
  readonly unlockedStage?: LifeGenerationStage;
  readonly complete: boolean;
  readonly diagnostics: readonly LifeGenerationGateDiagnostic[];
}

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const DIAGNOSTIC_CODE = /^[a-z][a-z0-9._-]{0,63}$/;
const SAFE_ARTIFACT_REF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object'
  && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function pointerEscape(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function diagnostic(path: string, code: string, message: string): LifeGenerationGateDiagnostic {
  return { path, code, message, severity: 'error' };
}

function diagnosticOrder(a: LifeGenerationGateDiagnostic, b: LifeGenerationGateDiagnostic): number {
  return a.path.localeCompare(b.path) || a.code.localeCompare(b.code)
    || a.severity.localeCompare(b.severity) || a.message.localeCompare(b.message);
}

function stableDiagnostics(values: readonly LifeGenerationGateDiagnostic[]): LifeGenerationGateDiagnostic[] {
  const unique = new Map<string, LifeGenerationGateDiagnostic>();
  for (const value of values) {
    unique.set(`${value.path}\u0000${value.code}\u0000${value.severity}\u0000${value.message}`, {
      path: value.path,
      code: value.code,
      message: value.message,
      severity: value.severity,
    });
  }
  return [...unique.values()].sort(diagnosticOrder);
}

function stageOf(value: unknown): value is LifeGenerationStage {
  return typeof value === 'string' && (LIFE_GENERATION_STAGES as readonly string[]).includes(value);
}

function statusOf(value: unknown): value is LifeGenerationSelfCheckStatus {
  return typeof value === 'string' && (LIFE_GENERATION_SELF_CHECK_STATUSES as readonly string[]).includes(value);
}

function decisionOf(value: unknown): value is LifeGenerationOwnerDecision {
  return typeof value === 'string' && (LIFE_GENERATION_OWNER_DECISIONS as readonly string[]).includes(value);
}

function safeJsonIssue(value: unknown): string | undefined {
  const active = new Set<object>();
  const visit = (current: unknown, depth: number): string | undefined => {
    if (depth > 64) return 'stage input exceeds the maximum JSON depth of 64';
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return undefined;
    if (typeof current === 'number') return Number.isFinite(current) ? undefined : 'stage input numbers must be finite';
    if (Array.isArray(current)) {
      if (active.has(current)) return 'stage input must not contain cycles';
      active.add(current);
      for (const entry of current) {
        const issue = visit(entry, depth + 1);
        if (issue) { active.delete(current); return issue; }
      }
      active.delete(current);
      return undefined;
    }
    if (!record(current)) return 'stage input must contain JSON values only';
    if (active.has(current)) return 'stage input must not contain cycles';
    active.add(current);
    for (const key of Object.keys(current).sort()) {
      const issue = visit(current[key], depth + 1);
      if (issue) { active.delete(current); return issue; }
    }
    active.delete(current);
    return undefined;
  };
  return visit(value, 0);
}

function stageInputDeclaresProfile(value:unknown,seen=new Set<object>()):boolean{
  if(Array.isArray(value))return value.some((entry)=>stageInputDeclaresProfile(entry,seen));
  if(!record(value)||seen.has(value))return false;
  seen.add(value);
  const profile=value.profile;
  if(record(profile)&&typeof profile.titleKey==='string'&&Array.isArray(profile.attributes))return true;
  return Object.keys(value).some((key)=>stageInputDeclaresProfile(value[key],seen));
}

function hashStageInput(value: unknown): { hash?: string; issue?: LifeGenerationGateDiagnostic } {
  const message = safeJsonIssue(value);
  if (message) return { issue: diagnostic('/input', 'input_json', message) };
  try { return { hash: sha256Canonical(value) }; }
  catch { return { issue: diagnostic('/input', 'input_unreadable', 'stage input could not be canonically hashed') }; }
}

function readSelfCheckDiagnostics(raw: unknown, path: string, out: LifeGenerationGateDiagnostic[]): LifeGenerationGateDiagnostic[] {
  if (!Array.isArray(raw)) {
    out.push(diagnostic(path, 'diagnostics_type', 'selfCheck diagnostics must be an array'));
    return [];
  }
  const values: LifeGenerationGateDiagnostic[] = [];
  raw.forEach((entry, index) => {
    const entryPath = `${path}/${index}`;
    if (!record(entry) || !exactKeys(entry, ['path', 'code', 'message', 'severity'])) {
      out.push(diagnostic(entryPath, 'diagnostic_shape', 'diagnostic must use the closed path/code/message/severity shape'));
      return;
    }
    if (typeof entry.path !== 'string' || entry.path.length > 512 || CONTROL.test(entry.path)
      || (entry.path !== '' && !entry.path.startsWith('/'))) {
      out.push(diagnostic(`${entryPath}/path`, 'diagnostic_path', 'path must be an empty or absolute JSON pointer-like string'));
      return;
    }
    if (typeof entry.code !== 'string' || !DIAGNOSTIC_CODE.test(entry.code)) {
      out.push(diagnostic(`${entryPath}/code`, 'diagnostic_code', 'code must be a stable lowercase token'));
      return;
    }
    if (typeof entry.message !== 'string' || entry.message.trim() !== entry.message || entry.message.length === 0
      || entry.message.length > 1024 || CONTROL.test(entry.message)) {
      out.push(diagnostic(`${entryPath}/message`, 'diagnostic_message', 'message must be trimmed, non-empty, safe text up to 1024 characters'));
      return;
    }
    if (entry.severity !== 'error' && entry.severity !== 'warning') {
      out.push(diagnostic(`${entryPath}/severity`, 'diagnostic_severity', 'severity must be error|warning'));
      return;
    }
    values.push({ path: entry.path, code: entry.code, message: entry.message, severity: entry.severity });
  });
  return values;
}

function readArtifacts(raw: unknown, stage: LifeGenerationStage | undefined, path: string, out: LifeGenerationGateDiagnostic[]): LifeGenerationVisualArtifact[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    out.push(diagnostic(path, 'artifacts_required', 'each stage requires at least one visual artifact'));
    return [];
  }
  const values: LifeGenerationVisualArtifact[] = [];
  const allowed = stage ? LIFE_GENERATION_ARTIFACT_KINDS_BY_STAGE[stage] as readonly string[] : [];
  raw.forEach((entry, index) => {
    const entryPath = `${path}/${index}`;
    if (!record(entry) || !exactKeys(entry, ['kind', 'ref'])) {
      out.push(diagnostic(entryPath, 'artifact_shape', 'artifact must use the closed kind/ref shape'));
      return;
    }
    if (typeof entry.kind !== 'string' || !allowed.includes(entry.kind)) {
      out.push(diagnostic(`${entryPath}/kind`, 'artifact_kind', `kind must be allowed for stage ${stage ?? 'invalid'}`));
      return;
    }
    if (typeof entry.ref !== 'string' || !SAFE_ARTIFACT_REF.test(entry.ref)) {
      out.push(diagnostic(`${entryPath}/ref`, 'artifact_ref', 'ref must be an opaque safe id without paths, URLs or schemes'));
      return;
    }
    values.push({ kind: entry.kind as LifeGenerationVisualArtifactKind, ref: entry.ref });
  });
  return values;
}

function orderedArtifacts(values: readonly LifeGenerationVisualArtifact[]): LifeGenerationVisualArtifact[] {
  const unique = new Map<string, LifeGenerationVisualArtifact>();
  for (const value of values) unique.set(`${value.kind}\u0000${value.ref}`, { kind: value.kind, ref: value.ref });
  return [...unique.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.ref.localeCompare(b.ref));
}

function sameDiagnostics(a: readonly LifeGenerationGateDiagnostic[], b: readonly LifeGenerationGateDiagnostic[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameArtifacts(a: readonly LifeGenerationVisualArtifact[], b: readonly LifeGenerationVisualArtifact[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateGateShape(raw: unknown, expected?: { readonly input: unknown }): LifeGenerationGateValidationResult {
  const out: LifeGenerationGateDiagnostic[] = [];
  if (!record(raw) || !exactKeys(raw, ['schemaVersion', 'stage', 'inputHash', 'selfCheck', 'visualArtifacts', 'ownerDecision'])) {
    return { ok: false, diagnostics: [diagnostic('', 'gate_shape', 'gate must use the closed v1 root shape')] };
  }
  if (raw.schemaVersion !== LIFE_GENERATION_GATE_SCHEMA) out.push(diagnostic('/schemaVersion', 'schema_version', `must equal ${LIFE_GENERATION_GATE_SCHEMA}`));
  const stage = stageOf(raw.stage) ? raw.stage : undefined;
  if (!stage) out.push(diagnostic('/stage', 'stage', `stage must be ${LIFE_GENERATION_STAGES.join('|')}`));
  if (typeof raw.inputHash !== 'string' || !SHA256.test(raw.inputHash)) out.push(diagnostic('/inputHash', 'input_hash', 'inputHash must be sha256:<64 lowercase hex>'));
  if (!record(raw.selfCheck) || !exactKeys(raw.selfCheck, ['status', 'diagnostics'])) {
    out.push(diagnostic('/selfCheck', 'self_check_shape', 'selfCheck must use the closed status/diagnostics shape'));
  }
  const status = record(raw.selfCheck) && statusOf(raw.selfCheck.status) ? raw.selfCheck.status : undefined;
  if (record(raw.selfCheck) && !status) out.push(diagnostic('/selfCheck/status', 'self_check_status', 'status must be pass|fail'));
  const values = record(raw.selfCheck) ? readSelfCheckDiagnostics(raw.selfCheck.diagnostics, '/selfCheck/diagnostics', out) : [];
  const normalizedValues = stableDiagnostics(values);
  if (values.length > 0 && !sameDiagnostics(values, normalizedValues)) {
    out.push(diagnostic('/selfCheck/diagnostics', 'diagnostics_order', 'diagnostics must be unique and in stable path/code/severity/message order'));
  }
  const artifacts = readArtifacts(raw.visualArtifacts, stage, '/visualArtifacts', out);
  if (stage === 'actors' && !artifacts.some((artifact) => artifact.kind === 'inventory-review')) {
    out.push(diagnostic('/visualArtifacts', 'inventory_review_required', 'actors stage requires an inventory-review artifact'));
  }
  if (stage === 'actors' && expected && stageInputDeclaresProfile(expected.input) && !artifacts.some((artifact) => artifact.kind === 'profile-review')) {
    out.push(diagnostic('/visualArtifacts', 'profile_review_required', 'actors stage with a profile requires a profile-review artifact'));
  }
  const normalizedArtifacts = orderedArtifacts(artifacts);
  if (artifacts.length > 0 && !sameArtifacts(artifacts, normalizedArtifacts)) {
    out.push(diagnostic('/visualArtifacts', 'artifact_order', 'visualArtifacts must be unique and in stable kind/ref order'));
  }
  const ownerDecision = decisionOf(raw.ownerDecision) ? raw.ownerDecision : undefined;
  if (!ownerDecision) out.push(diagnostic('/ownerDecision', 'owner_decision', 'ownerDecision must be pending|approved|changes-requested'));
  const hasError = values.some((entry) => entry.severity === 'error');
  if (status === 'pass' && hasError) out.push(diagnostic('/selfCheck/status', 'self_check_error', 'pass is invalid when diagnostics contain an error'));
  if (ownerDecision === 'approved' && (status !== 'pass' || hasError)) {
    out.push(diagnostic('/ownerDecision', 'approval_invalid', 'approved requires selfCheck pass with zero error diagnostics'));
  }
  if (expected) {
    const hashed = hashStageInput(expected.input);
    if (hashed.issue) out.push({ ...hashed.issue, path: '/inputHash' });
    else if (raw.inputHash !== hashed.hash) out.push(diagnostic('/inputHash', 'stale_input_hash', 'gate inputHash does not match the current canonical stage input'));
  }
  const diagnostics = stableDiagnostics(out);
  if (diagnostics.length > 0 || !stage || !status || !ownerDecision) return { ok: false, diagnostics };
  return {
    ok: true,
    diagnostics: [],
    gate: {
      schemaVersion: LIFE_GENERATION_GATE_SCHEMA,
      stage,
      inputHash: raw.inputHash as string,
      selfCheck: { status, diagnostics: normalizedValues },
      visualArtifacts: normalizedArtifacts,
      ownerDecision,
    },
  };
}

/** Creates a pending-only review gate. Owner approval is intentionally not accepted by this API. */
export function createLifeGenerationGate(raw: unknown): LifeGenerationGateValidationResult {
  if (!record(raw) || !exactKeys(raw, ['stage', 'input', 'selfCheck', 'visualArtifacts'])) {
    return { ok: false, diagnostics: [diagnostic('', 'create_shape', 'create input must use only stage/input/selfCheck/visualArtifacts; ownerDecision is not accepted')] };
  }
  const stage = stageOf(raw.stage) ? raw.stage : undefined;
  const out: LifeGenerationGateDiagnostic[] = [];
  if (!stage) out.push(diagnostic('/stage', 'stage', `stage must be ${LIFE_GENERATION_STAGES.join('|')}`));
  if (!record(raw.selfCheck) || !exactKeys(raw.selfCheck, ['status', 'diagnostics'])) {
    out.push(diagnostic('/selfCheck', 'self_check_shape', 'selfCheck must use the closed status/diagnostics shape'));
  }
  const status = record(raw.selfCheck) && statusOf(raw.selfCheck.status) ? raw.selfCheck.status : undefined;
  if (record(raw.selfCheck) && !status) out.push(diagnostic('/selfCheck/status', 'self_check_status', 'status must be pass|fail'));
  const values = record(raw.selfCheck) ? readSelfCheckDiagnostics(raw.selfCheck.diagnostics, '/selfCheck/diagnostics', out) : [];
  const artifacts = readArtifacts(raw.visualArtifacts, stage, '/visualArtifacts', out);
  if (stage === 'actors' && !artifacts.some((artifact) => artifact.kind === 'inventory-review')) {
    out.push(diagnostic('/visualArtifacts', 'inventory_review_required', 'actors stage requires an inventory-review artifact'));
  }
  if (stage === 'actors' && stageInputDeclaresProfile(raw.input) && !artifacts.some((artifact) => artifact.kind === 'profile-review')) {
    out.push(diagnostic('/visualArtifacts', 'profile_review_required', 'actors stage with a profile requires a profile-review artifact'));
  }
  const hasError = values.some((entry) => entry.severity === 'error');
  if (status === 'pass' && hasError) out.push(diagnostic('/selfCheck/status', 'self_check_error', 'pass is invalid when diagnostics contain an error'));
  const hashed = hashStageInput(raw.input);
  if (hashed.issue) out.push(hashed.issue);
  const diagnostics = stableDiagnostics(out);
  if (diagnostics.length > 0 || !stage || !status || !hashed.hash) return { ok: false, diagnostics };
  const gate: LifeGenerationGateV1 = {
    schemaVersion: LIFE_GENERATION_GATE_SCHEMA,
    stage,
    inputHash: hashed.hash,
    selfCheck: { status, diagnostics: stableDiagnostics(values) },
    visualArtifacts: orderedArtifacts(artifacts),
    ownerDecision: 'pending',
  };
  return { ok: true, diagnostics: [], gate };
}

/** Strictly validates one persisted gate against the current raw content for that stage. */
export function validateLifeGenerationGate(rawGate: unknown, rawStageInput: unknown): LifeGenerationGateValidationResult {
  return validateGateShape(rawGate, { input: rawStageInput });
}

/** Strictly validates a complete gate prefix and each gate's corresponding current stage input. */
export function validateLifeGenerationGateSequence(rawGates: unknown, rawStageInputs: unknown): LifeGenerationGateSequenceValidationResult {
  const out: LifeGenerationGateDiagnostic[] = [];
  if (!Array.isArray(rawGates)) return { ok: false, diagnostics: [diagnostic('/gates', 'sequence_type', 'gates must be an array')] };
  if (rawGates.length > LIFE_GENERATION_STAGES.length) out.push(diagnostic('/gates', 'sequence_length', `gates cannot exceed ${LIFE_GENERATION_STAGES.length} stages`));
  if (!record(rawStageInputs)) return { ok: false, diagnostics: [diagnostic('/inputs', 'inputs_shape', 'stage inputs must be a plain object keyed by stage')] };
  const gates: LifeGenerationGateV1[] = [];
  const seen = new Set<string>();
  rawGates.forEach((raw, index) => {
    const rawStage = record(raw) && typeof raw.stage === 'string' ? raw.stage : '';
    if (rawStage && seen.has(rawStage)) out.push(diagnostic(`/gates/${index}/stage`, 'stage_duplicate', 'stage appears more than once'));
    seen.add(rawStage);
    if (rawStage !== LIFE_GENERATION_STAGES[index]) out.push(diagnostic(`/gates/${index}/stage`, 'stage_order', `stage at index ${index} must be ${LIFE_GENERATION_STAGES[index] ?? 'absent'}`));
    const checked = validateGateShape(raw, stageOf(rawStage) ? { input: rawStageInputs[rawStage] } : undefined);
    for (const issue of checked.diagnostics) out.push({ ...issue, path: `/gates/${index}${issue.path}` });
    if (checked.gate) gates.push(checked.gate);
  });
  const expectedKeys = rawGates.flatMap((raw) => record(raw) && stageOf(raw.stage) ? [raw.stage] : []).sort();
  const actualKeys = Object.keys(rawStageInputs).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    out.push(diagnostic('/inputs', 'input_stage_set', 'stage inputs must contain exactly one key for every gate stage'));
  }
  for (let index = 1; index < gates.length; index++) {
    const prior = gates[index - 1]!;
    if (prior.ownerDecision !== 'approved' || prior.selfCheck.status !== 'pass'
      || prior.selfCheck.diagnostics.some((entry) => entry.severity === 'error')) {
      out.push(diagnostic(`/gates/${index}/stage`, 'stage_locked', 'a later stage requires the immediately prior gate to be approved and passing'));
    }
  }
  const diagnostics = stableDiagnostics(out);
  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, diagnostics: [], gates };
}

/**
 * Read-only next-stage decision. It authenticates no human; the outer control plane owns authorization.
 * Only the last/current gate is re-hashed here, so content changes force that stage through both gates again.
 */
export function evaluateLifeGenerationGateAdvance(rawGates: unknown, rawCurrent: unknown): LifeGenerationGateAdvanceResult {
  const out: LifeGenerationGateDiagnostic[] = [];
  if (!Array.isArray(rawGates) || rawGates.length === 0) {
    return { ok: false, complete: false, diagnostics: [diagnostic('/gates', 'current_gate_required', 'at least the current stage gate is required')] };
  }
  if (!record(rawCurrent) || !exactKeys(rawCurrent, ['stage', 'input']) || !stageOf(rawCurrent.stage)) {
    return { ok: false, complete: false, diagnostics: [diagnostic('/current', 'current_shape', 'current must use the closed stage/input shape with a valid stage')] };
  }
  const currentIndex = LIFE_GENERATION_STAGES.indexOf(rawCurrent.stage);
  if (rawGates.length !== currentIndex + 1) out.push(diagnostic('/gates', 'current_sequence', 'gates must be the exact prefix ending at the current stage'));
  let currentGate: LifeGenerationGateV1 | undefined;
  rawGates.forEach((raw, index) => {
    const expectedStage = LIFE_GENERATION_STAGES[index];
    const stage = record(raw) ? raw.stage : undefined;
    if (stage !== expectedStage) out.push(diagnostic(`/gates/${index}/stage`, 'stage_order', `stage at index ${index} must be ${expectedStage ?? 'absent'}`));
    const checked = validateGateShape(raw, index === currentIndex ? { input: rawCurrent.input } : undefined);
    for (const issue of checked.diagnostics) out.push({ ...issue, path: `/gates/${index}${issue.path}` });
    if (index === currentIndex) currentGate = checked.gate;
    if (index < currentIndex && checked.gate
      && (checked.gate.ownerDecision !== 'approved' || checked.gate.selfCheck.status !== 'pass'
        || checked.gate.selfCheck.diagnostics.some((entry) => entry.severity === 'error'))) {
      out.push(diagnostic(`/gates/${index}`, 'prior_stage_blocked', 'every prior gate must be approved and passing'));
    }
  });
  if (!currentGate || currentGate.stage !== rawCurrent.stage) out.push(diagnostic('/current/stage', 'current_stage_mismatch', 'current stage must match the last gate'));
  else {
    if (currentGate.selfCheck.status !== 'pass') out.push(diagnostic(`/gates/${currentIndex}/selfCheck/status`, 'self_check_blocked', 'failed self-check cannot unlock another stage'));
    if (currentGate.ownerDecision !== 'approved') out.push(diagnostic(`/gates/${currentIndex}/ownerDecision`, 'owner_decision_blocked', 'only an approved owner decision unlocks the next stage'));
  }
  const diagnostics = stableDiagnostics(out);
  if (diagnostics.length > 0 || !currentGate) {
    return { ok: false, currentStage: rawCurrent.stage, complete: false, diagnostics };
  }
  const unlockedStage = LIFE_GENERATION_STAGES[currentIndex + 1];
  return {
    ok: true,
    currentStage: rawCurrent.stage,
    ...(unlockedStage ? { unlockedStage } : {}),
    complete: unlockedStage === undefined,
    diagnostics: [],
  };
}
