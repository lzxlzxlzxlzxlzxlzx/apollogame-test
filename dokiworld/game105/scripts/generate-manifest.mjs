import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(root, 'src');
const defaultOutput = resolve(root, 'manifest.json');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

export const manifest = {
  schemaVersion: 2,
  version: packageJson.version,
  id: 'game-105-heart-tower',
  kind: 'game',
  status: 'active',
  entry: 'index.html',
  launchRequirements: { minPlayers: 2 },
  context: {
    requiredScopes: [],
    optionalScopes: ['character.identity', 'character.avatar', 'player_persona'],
  },
  locales: {
    en: {
      name: 'Heart Tower',
      description: 'A romantic real-physics tower game with in-host dialogue continuation.',
      aliases: ['Heart Tower', 'Heart Stack', `Heart Tower v${packageJson.version}`],
    },
    'zh-cn': {
      name: '心动叠叠塔',
      description: '真实物理叠叠塔小游戏，支持宿主续聊与结果回传。',
      aliases: ['心动叠叠塔', '心动塔', `心动叠叠塔v${packageJson.version}`],
    },
  },
  selection: {
    activationPolicy: 'explicit-or-contextual',
    promptHint: {
      en: 'Use when the current character invites the player to a short tower game.',
      'zh-cn': '当前角色明确提出一起玩一局心动叠叠塔时使用。',
    },
    avoidHint: {
      en: 'Do not launch for ordinary mentions of stacking or towers in casual dialogue.',
      'zh-cn': '普通对话里只是提到塔、积木或叠叠乐时不要拉起。',
    },
  },
  runtime: {
    protocol: 'dokiworld.app',
    protocolVersion: 2,
    input: { contract: 'doki.game.heart-tower-input', version: 1 },
    outputs: [{ contract: 'doki.game.result', version: 1 }],
    extensions: ['character', 'dialogue', 'persona', 'progress', 'resize', 'resume'],
  },
  result: {
    metrics: [
      'winner',
      'rounds',
      'playerDraws',
      'aiDraws',
      'completedInteractions',
      'linkedExtractions',
      'heartDelta',
      'relationshipSignal',
      'memoryCandidate',
      'memorySummary',
      'replyMode',
      'aiPenaltyCompleted',
    ],
  },
};

export function generateManifest(output = defaultOutput) {
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return output;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  console.log(`Generated ${generateManifest()}`);
}
