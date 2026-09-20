// author: PE
// 审计入口·**对照组**：game109 对局 HUD 条 · 换皮**前**的主题（`SHELL`）。
//
// 【为什么要有这一份】
//   S5 条件②a 把 `games/game109/game109.ts:110` 的主题从 `SHELL` 换成了 `STARTER_THEME`。
//   换完四关实测：**4 条硬性低对比**（体力 1.45 / 第N天 2.65 / 背包 2.77 / 当前工具 2.77）。
//   但「换皮后是红的」这句话只有在**知道换皮前是什么数**时才成立——不然可能是这屏本来就红、
//   与换皮无关。本入口就是那个对照臂：**同一份 view、同一个 mountUI 调用、同一个审计命令，
//   只把 theme 换成换皮前的 `SHELL`**。两臂一比，红是不是这次换皮引入的，一望即知。
//
//   与 `audit-hud.audit.ts` 的关系：那两份文件的 view 字面量必须**逐字相同**（含注释里的选值理由）。
//   改其中一份的数值 = 对照失效，必须同步改另一份。
//
// 用法：node tools/ui-audit.mjs public/games/game109/self-check/audit-hud-shell.audit.ts --w 740 --h 140
import { mountUI } from '../../../../src/ui/components/index.js';
import { buildHud } from '../../../../games/game109/hud.js';
import { FLOW } from '../../../../games/game109/data.js';
import { SHELL } from '../../../../src/ui/shell-theme.js'; // ← 换皮前的旧主题（仅作对照，不是出厂值）

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
  SHELL,
);
