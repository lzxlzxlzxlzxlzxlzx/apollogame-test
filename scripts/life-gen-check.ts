// Authoring-only, read-only intake. It never materializes games, assets, or indexes.
// Usage: npm run life-gen-check -- <bundle.json> --diagnostics json [--packets|--inventory-review|--profile-review|--plan]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLifePromptPackets, checkLifeGenerationBundle, type LifeGenerationBundleV1 } from '../src/authoring/life-generation-bundle.js';
import { buildLifeInventoryReview } from '../src/authoring/life-inventory-review.js';
import { buildLifeProfileReview } from '../src/authoring/life-profile-review.js';

function main(): void {
  const args = process.argv.slice(2);
  const input = args.find((arg) => !arg.startsWith('--') && arg !== 'json');
  if (!input) {
    process.stderr.write('life-gen-check: missing <bundle.json>\n');
    process.exitCode = 2;
    return;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(input), 'utf8'));
  } catch (error) {
    process.stderr.write(`life-gen-check: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }
  const result = checkLifeGenerationBundle(raw);
  const output = {
    ...result,
    ...(args.includes('--packets') && result.ok ? { packets: buildLifePromptPackets(raw as LifeGenerationBundleV1) } : {}),
    ...(args.includes('--inventory-review') ? { inventoryReview: buildLifeInventoryReview(raw) } : {}),
    ...(args.includes('--profile-review') ? { profileReview: buildLifeProfileReview(raw) } : {}),
    ...(args.includes('--plan') ? { plan: result.plan } : {}),
  };
  process.stdout.write(`${JSON.stringify(output, null, args.includes('--diagnostics') ? 2 : 0)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main();

