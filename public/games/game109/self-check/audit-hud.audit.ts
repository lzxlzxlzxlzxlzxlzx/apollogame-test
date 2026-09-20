// author: PE
// 审计入口：game109《种田》（暂名）**对局中的 HUD 条**（S5 条件②a 换皮后 · STARTER_THEME = apolloToon）。
// 用法：node tools/ui-audit.mjs public/games/game109/self-check/audit-hud.audit.ts --w 740 --h 140
//
// 【为什么入口放在这里，而不是 tools/audits/】
//   house 惯例是 tools/audits/*.audit.ts（game101/102/108 都在那），但 **S5 领工声明的边界栏没列 tools/**
//   （docs/design/game109/requests.md §0.17④），而 S5 复查清单第 1 条是「碰了声明外的文件=FAIL」。
//   放在 public/games/game109/self-check/ 三件事同时成立：在声明内 · 属 gameHash 的 EVIDENCE_DIRS
//   （整目录跳过 ⇒ 不动指纹）· 工具本就支持任意入口路径（tools/ui-audit.mjs 头注：tools/audits/* 只是
//   「现成示例入口」）。**这是刻意的边界选择，不是随手放错**。
//
// 【量的是哪一屏】
//   **中途的一屏**（读数有真值 + 背包有存量 + 工具有选中态）——比开局空屏更能暴露重叠与低对比：
//   开局态 `背包 胡萝卜 0 · 小麦 0 · 南瓜 0` 与 `当前工具：锄地` 是这一屏里最长的两条次级文字，
//   `▶ 浇水` 又是唯一带前缀的高亮键（宽度比其余 5 键都宽 → 最可能撞）。
//
// 【换皮后最该盯的一处】
//   语义底换成了 apolloToon 的 `raised`/`accent` 映射。读数用的 text/gold/jade/sub 四档语义色是
//   **按主题解析**的（skill 四关第 2 条：不塞 raw hex），所以底一变，对比度就得重量——这份入口就是那把尺。
import { mountUI } from '../../../../src/ui/components/index.js';
import { buildHud } from '../../../../games/game109/hud.js';
import { FLOW } from '../../../../games/game109/data.js';
import { STARTER_THEME } from '../../../../src/ui/starters/index.js';

// theme 与 games/game109/game109.ts:110 传给 mountUI 的是**同一个导出**（条件②a 换皮的那一颗）。
// handlers 交空表 + 不给 sink：审计只量几何与颜色，不点任何键（点了会落进 ActionSink 分支）。
mountUI(
  document.getElementById('root')!,
  buildHud({
    energy: 14,
    energyMax: 20,
    gold: 618,
    goldTarget: 1000,
    day: 4,
    tool: 2, // 浇水（下标见 data.ts TOOLS）→ 该键走 primary + `▶ ` 前缀，是动作条上最宽的一枚
    toolName: '浇水',
    bag: [5, 6, 12], // 按 CROPS 顺序：胡萝卜/小麦/南瓜
    flow: FLOW.PLAYING,
  }),
  {},
  STARTER_THEME,
);
