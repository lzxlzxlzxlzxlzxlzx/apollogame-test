// author: PE
// 审计入口：game109《种田》（暂名）**通关结算屏**（`flow === FLOW.WON` 换屏后的那一屏）。
// 用法：node tools/ui-audit.mjs public/games/game109/self-check/audit-result.audit.ts --w 740 --h 200
//
// 【为什么换屏要单独一份入口】
//   `buildHud` 在 `flow === 'won'` 时**顶掉**读数与动作条、只交一个结算面板（hud.ts:174）。
//   两条分支的节点树不相交 ⇒ 量了 HUD 条不等于量了结算屏。结算面板是本作唯一的终端屏，
//   而它的底色语义槽（`bg: 'raised'` + `accent: true`）**恰恰是换主题后最可能翻车的一处**：
//   对局条是「暗底 + 亮字」，面板是「抬升底 + 金/玉字」，apolloToon 的 raised 若偏亮，
//   金玉档就会糊——这跟 game108 实测过的「亮底放 dim 灰字」是同一个病。
//
// 【数值取的是实测最优那一局的终局】
//   1026 金 / 7 天（data.ts:191-192 记的实测最优：12 南瓜 + 6 小麦 + 5 胡萝卜）。
//   取真值而非「刚好 1000」是因为结算行会渲染 `最终金币 1026 / 1000`——四位数 + 分数线，
//   是这条 Label 最宽的形态（位数撑宽是 skill 四关第 1 条点名的经典坑）。
//
// 【入口位置的边界理由】见 audit-hud.audit.ts 同一段（声明边界内 · EVIDENCE_DIRS 内 · 不动指纹）。
import { mountUI } from '../../../../src/ui/components/index.js';
import { buildHud } from '../../../../games/game109/hud.js';
import { FLOW } from '../../../../games/game109/data.js';
import { STARTER_THEME } from '../../../../src/ui/starters/index.js';

mountUI(
  document.getElementById('root')!,
  buildHud({
    energy: 9, // 终局最后一拍剩的体力（凑真值：不加也行，结算屏不读它，留着是为「同一份 view 直出」）
    energyMax: 20,
    gold: 1026, // 实测最优终局金币（> goldTarget 1000 ⇒ 真到线）
    goldTarget: 1000,
    day: 7,
    tool: 3, // 收获（结算屏不读，同上）
    toolName: '收获',
    bag: [5, 6, 12],
    flow: FLOW.WON, // ← 这一行的唯一作用就是触发换屏
  }),
  {},
  STARTER_THEME,
);
