import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LifeMaterializationError,
  applyLifeAuthoringMaterialization,
  buildLifeAuthoringMaterializationPlan,
  buildLifeFormalUpdatePlan,
  promoteLifeAuthoringMaterialization,
  updateLifeAuthoringMaterialization,
} from '../src/authoring/life-materializer.js';

interface Arguments {
  readonly bundlePath: string;
  readonly hostPath: string;
  readonly entryPath: string;
  readonly mode: 'plan' | 'plan-update' | 'apply-authoring' | 'promote' | 'update';
  readonly ownerConfirm?: string;
  readonly currentFilesHash?: string;
  readonly targetRoot?: string;
  readonly workspaceRoot?: string;
}

function usage(message: string): never {
  throw new Error(`${message}\nUsage: life-materialize <bundle.json> --host <life-host.json> --entry <life-launcher.json> [--plan | --plan-update --workspace-root <absolute workspace> | --apply-authoring --owner-confirm <sha256:...> --target-root <absolute scratch root> | --promote --owner-confirm <sha256:...> --workspace-root <absolute workspace> | --update --owner-confirm <new sha256:...> --current-files-hash <old sha256:...> --workspace-root <absolute workspace>]`);
}

function parseArguments(argv: readonly string[]): Arguments {
  const positional: string[] = [];
  const values = new Map<string, string>();
  let plan = false;
  let apply = false;
  let promote = false;
  let planUpdate = false;
  let update = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--plan') { if (plan) usage('duplicate option --plan'); plan = true; continue; }
    if (arg === '--apply-authoring') { if (apply) usage('duplicate option --apply-authoring'); apply = true; continue; }
    if (arg === '--promote') { if (promote) usage('duplicate option --promote'); promote = true; continue; }
    if (arg === '--plan-update') { if (planUpdate) usage('duplicate option --plan-update'); planUpdate = true; continue; }
    if (arg === '--update') { if (update) usage('duplicate option --update'); update = true; continue; }
    if (['--host', '--entry', '--owner-confirm', '--current-files-hash', '--target-root', '--workspace-root'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) usage(`missing value for ${arg}`);
      if (values.has(arg)) usage(`duplicate option ${arg}`);
      values.set(arg, value);
      continue;
    }
    if (arg.startsWith('--')) usage(`unknown option ${arg}`);
    positional.push(arg);
  }
  if (positional.length !== 1) usage('exactly one bundle path is required');
  if (!values.get('--host') || !values.get('--entry')) usage('--host and --entry are required');
  if ([plan, planUpdate, apply, promote, update].filter(Boolean).length > 1) usage('--plan, --plan-update, --apply-authoring, --promote, and --update are mutually exclusive');
  const mode = update ? 'update' : promote ? 'promote' : apply ? 'apply-authoring' : planUpdate ? 'plan-update' : 'plan';
  if (mode === 'apply-authoring' && (!values.get('--owner-confirm') || !values.get('--target-root'))) usage('apply-authoring requires --owner-confirm and --target-root');
  if (mode === 'promote' && (!values.get('--owner-confirm') || !values.get('--workspace-root'))) usage('promote requires --owner-confirm and --workspace-root');
  if (mode === 'plan-update' && !values.get('--workspace-root')) usage('plan-update requires --workspace-root');
  if (mode === 'update' && (!values.get('--owner-confirm') || !values.get('--current-files-hash') || !values.get('--workspace-root'))) usage('update requires --owner-confirm, --current-files-hash, and --workspace-root');
  if (mode !== 'apply-authoring' && values.has('--target-root')) usage('--target-root is only valid with --apply-authoring');
  if (!['plan-update', 'promote', 'update'].includes(mode) && values.has('--workspace-root')) usage('--workspace-root is only valid with --plan-update, --promote, or --update');
  if (!['apply-authoring', 'promote', 'update'].includes(mode) && values.has('--owner-confirm')) usage('--owner-confirm is only valid with --apply-authoring, --promote, or --update');
  if (mode !== 'update' && values.has('--current-files-hash')) usage('--current-files-hash is only valid with --update');
  return {
    bundlePath: positional[0]!, hostPath: values.get('--host')!, entryPath: values.get('--entry')!, mode,
    ...(values.get('--owner-confirm') ? { ownerConfirm: values.get('--owner-confirm') } : {}),
    ...(values.get('--current-files-hash') ? { currentFilesHash: values.get('--current-files-hash') } : {}),
    ...(values.get('--target-root') ? { targetRoot: values.get('--target-root') } : {}),
    ...(values.get('--workspace-root') ? { workspaceRoot: values.get('--workspace-root') } : {}),
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown;
}

function main(): void {
  try {
    const args = parseArguments(process.argv.slice(2));
    const inputs = { bundle: readJson(args.bundlePath), descriptor: readJson(args.hostPath), entry: readJson(args.entryPath) };
    const output = args.mode === 'plan'
      ? buildLifeAuthoringMaterializationPlan(inputs)
      : args.mode === 'plan-update'
        ? buildLifeFormalUpdatePlan(inputs, { workspaceRoot: args.workspaceRoot! })
        : args.mode === 'apply-authoring'
          ? applyLifeAuthoringMaterialization(inputs, { targetRoot: args.targetRoot!, ownerConfirm: args.ownerConfirm! })
          : args.mode === 'promote'
            ? promoteLifeAuthoringMaterialization(inputs, { workspaceRoot: args.workspaceRoot!, ownerConfirm: args.ownerConfirm! })
            : updateLifeAuthoringMaterialization(inputs, { workspaceRoot: args.workspaceRoot!, ownerConfirm: args.ownerConfirm!, currentFilesHash: args.currentFilesHash! });
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    if (error instanceof LifeMaterializationError) {
      process.stderr.write(`${JSON.stringify({ ok: false, diagnostics: error.diagnostics }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`life-materialize: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

main();
