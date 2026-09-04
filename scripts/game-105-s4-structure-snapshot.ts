import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { TOWER_BLOCKS } from '../games/game-105/tower-blueprint.js';
import { hud } from '../games/game-105/game-105.js';
import { TowerGameSession } from '../games/game-105/tower-session.js';

const EVIDENCE_DIRS = new Set(['mock', 'probe', 'golden', 'self-check', 'review']);
const EVIDENCE_FILES = new Set([
  's1-s2-program-evidence.md',
  's3-program-evidence.md',
  's4-program-evidence.md',
]);

function currentGameHash(root: string): string {
  const files: string[] = [];
  const walk = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (!EVIDENCE_DIRS.has(name)) walk(path);
        continue;
      }
      if (
        name !== 'pipeline.json'
        && name !== 'requests.md'
        && name !== 'capability-gaps.json'
        && !EVIDENCE_FILES.has(name)
      ) files.push(path);
    }
  };
  for (const path of [join(root, 'library', 'game-105'), join(root, 'public', 'games', 'game-105'), join(root, 'games', 'game-105'), join(root, 'docs', 'design', 'game-105')]) walk(path);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(root, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

type StructureNode = {
  id: string;
  parent: string | null;
  index: number;
  visible: true;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  action?: string;
  arg?: string;
};

function project(node: LayoutNode, parent: string | null = null, index = 0, out: StructureNode[] = []): StructureNode[] {
  const layout = node.layout ?? {};
  const props = node.props as { action?: string; actionArg?: string } | undefined;
  out.push({
    id: node.id,
    parent,
    index,
    visible: true,
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    action: props?.action,
    arg: props?.actionArg,
  });
  node.children?.forEach((child, childIndex) => project(child, node.id, childIndex, out));
  return out;
}

function settle(session: TowerGameSession): void {
  for (let frame = 0; frame < 30; frame += 1) session.observePhysics(true);
}

function playerInteraction(): TowerGameSession {
  const session = new TowerGameSession();
  settle(session);
  session.beginPull(TOWER_BLOCKS[0]!, 'player');
  session.release(2.1 * .93);
  settle(session);
  return session;
}

function aftershock(): TowerGameSession {
  const session = new TowerGameSession();
  const linked = TOWER_BLOCKS.slice(1, 5);
  settle(session);
  session.beginPull(TOWER_BLOCKS[0]!, 'player');
  session.observeTowerBlockDistances([TOWER_BLOCKS[0]!, ...linked].map((block) => ({ block, distance: 2.1 * .93 })));
  session.release(2.1 * .93);
  settle(session);
  return session;
}

function playerWrap(): TowerGameSession {
  const session = new TowerGameSession();
  settle(session);
  session.beginPull(TOWER_BLOCKS[0]!, 'player');
  session.observePhysics(false, TOWER_BLOCKS.slice(0, 3).map((block) => block.id));
  return session;
}

const root = process.cwd();
const hash = currentGameHash(root);
const states = {
  opening: new TowerGameSession(),
  'player-interaction': playerInteraction(),
  aftershock: aftershock(),
  'player-wrap': playerWrap(),
};
settle(states.opening);

const snapshot = {
  schemaVersion: 1,
  stage: 'S4',
  slug: 'game-105',
  gameHash: hash,
  projection: 'LayoutNode id, parent, sibling index, visibility, anchors, dimensions, action and action argument only; paint is excluded.',
  states: Object.fromEntries(Object.entries(states).map(([name, session]) => [name, project(hud(session, 0))])),
};
const output = join(root, 'docs', 'design', 'game-105', 'self-check', `S4-structure-${hash}.json`);
writeFileSync(output, JSON.stringify(snapshot, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, output, gameHash: hash, states: Object.keys(snapshot.states) }));
