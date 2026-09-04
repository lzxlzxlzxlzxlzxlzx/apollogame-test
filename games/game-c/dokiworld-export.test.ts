import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — 导出工具是 .mjs 无类型声明（纯 Node 工具·非引擎源）；本测只读其数据形。
import dokiworld from '../../tools/export-targets/dokiworld.mjs';

// DokiWorld 卡带导出锚点守卫（owner 2026-07-23：game-c 导出失败「back_to_story 锚点漂移」）。
// 根因：REQ-C-114 顶菜单给 back_to_story 加了 showMenu/showHelp 复位，dokiworld.mjs 的 patch `find` 锚点
//   未同步 → 导出期「anchor matched 0×（need 1）」失败（tools/export-game.mjs 设计为漂移即响亮失败）。
// 本守卫把「每条 game-c patch 锚点在当前源里恰好命中 1 次」钉进门禁——以后改 game-c.ts 若漂了锚点，
//   门禁当场红（而非 owner 导出时才炸）。改了 game-c.ts 的 mount host 签名 / SessionOut 闸 / back_to_story
//   → 必须同步更新 dokiworld.mjs 对应 find/replace，本测即绿。
describe('game-c · DokiWorld 卡带导出锚点守卫（防源漂移·owner 2026-07-23）', () => {
  it('game-c 在受支持导出清单内', () => {
    expect(dokiworld.supportedGames).toContain('game-c');
  });

  it('每条 game-c patch 的 find 锚点在当前源里恰好命中 1 次（漂移即红·替代 owner 导出踩雷）', () => {
    const patches = dokiworld.patchGame({ gameId: 'game-c' }) as Array<{ file: string; find: string; replace: string }>;
    expect(patches.length).toBeGreaterThan(0);
    for (const p of patches) {
      // patch.file 是**导出后**路径（src/games/…·export-game.mjs 把 games/<g>/** 拷进 <out>/src/games/<g>/**·
      //   REQ-SPLIT-引擎内容分离迁出后 src/ 与 games/ 为顶层兄弟）；仓库源去掉 `src/` 段即得真实仓库路径。
      const repoFile = p.file.replace(/^src\//, '');
      const src = readFileSync(repoFile, 'utf8').replace(/\r\n/g, '\n');
      const hits = src.split(p.find).length - 1;
      expect(hits, `锚点应命中 1 次（实 ${hits}）· ${repoFile} · find 头: ${p.find.slice(0, 60)}`).toBe(1);
      // replace 必须真改动（否则 patch 空转）——且 replace 不得等于 find（防复制粘贴漏改）。
      expect(p.replace).not.toBe(p.find);
    }
  });
});
