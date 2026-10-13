import { run } from './life-asset-generate.mjs';

run(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`life-asset-generate: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
