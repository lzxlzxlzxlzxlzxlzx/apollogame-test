// scripts/lib/golden-ledger.mjs —— 标准照台账 IO（REQ-RENDERCHECK R3·纯 fs·零依赖·不起浏览器）
//
//  独立出这个小模块只为一件事：断开循环 import——golden-shot.mjs 要用 game-pipeline.mjs 的
//  detectForm/gameHash（游戏形态判定/内容指纹，同一份真相不能各写一套），game-pipeline.mjs 的
//  S5/S8 门又要读 golden-shot 这边「这游戏有没有 blessed 基准」（`blessedStates`）——两边互相要
//  对方的东西会成环。ledger 读写本身不依赖 game-pipeline.mjs 的任何逻辑（纯 fs+JSON），故下沉
//  到这个第三方模块：golden-shot.mjs 与 game-pipeline.mjs 都从这里单向 import，零循环。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const goldenDir = (root, slug) => join(root, 'public', 'games', slug, 'golden');
export const ledgerPath = (root, slug) => join(goldenDir(root, slug), 'golden-ledger.json');
export const shotPath = (root, slug, state) => join(goldenDir(root, slug), `${state}.png`);
export const diffShotPath = (root, slug, state) => join(goldenDir(root, slug), `${state}-diff.png`);

export function readLedger(root, slug) {
  try {
    const j = JSON.parse(readFileSync(ledgerPath(root, slug), 'utf8'));
    return { version: 1, slug, states: {}, history: [], ...j };
  } catch {
    return { version: 1, slug, states: {}, history: [] };
  }
}

export function writeLedger(root, slug, ledger) {
  mkdirSync(goldenDir(root, slug), { recursive: true });
  writeFileSync(ledgerPath(root, slug), JSON.stringify(ledger, null, 2) + '\n');
}

/**
 * 当前可参与像素比对的 blessed state。`s4-structure-*` 是不可变的结构合同，
 * 不能作为 S5 视觉换皮的像素基准，否则合法的颜色、字体和纹样变更也会被误报。
 */
export function blessedStates(root, slug, { prefix } = {}) {
  const ledger = readLedger(root, slug);
  return Object.keys(ledger.states || {}).filter(
    (s) => ledger.states[s]?.status === 'blessed'
      && !s.startsWith('s4-structure-')
      && (!prefix || s.startsWith(prefix)),
  );
}
