import { composeLifeGenerationBundle } from '../src/authoring/life-bundle-compose.js';
import { basename, dirname, isAbsolute, parse, resolve } from 'node:path';

function usage(): never {
  process.stderr.write('Usage: life-bundle-compose <slice-manifest.json> --source-root <absolute-design-root> [--plan|--write-candidate]\n');
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) usage();
const positionals = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--source-root');
const count = (flag: string): number => args.filter((arg) => arg === flag).length;
if (positionals.length !== 1 || count('--source-root') !== 1 || count('--plan') > 1 || count('--write-candidate') > 1) usage();
if (args.includes('--plan') && args.includes('--write-candidate')) usage();
const known = new Set(['--source-root', '--plan', '--write-candidate']);
for (const arg of args) if (arg.startsWith('--') && !known.has(arg)) usage();
const rootIndex = args.indexOf('--source-root');
const sourceRoot = args[rootIndex + 1];
if (!sourceRoot || sourceRoot.startsWith('--')) usage();
const manifestArgument = positionals[0]!;
const manifestSegments = manifestArgument.split(/[\\/]/u);
if (isAbsolute(manifestArgument) || manifestSegments.includes('..') || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(manifestArgument)) usage();
const manifestFile = parse(manifestArgument).base === manifestArgument
  ? manifestArgument
  : dirname(resolve(manifestArgument)) === resolve(sourceRoot)
    ? basename(manifestArgument)
    : usage();

const result = composeLifeGenerationBundle({
  manifestFile,
  sourceRoot,
  writeCandidate: args.includes('--write-candidate'),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.ok ? 0 : 1);
