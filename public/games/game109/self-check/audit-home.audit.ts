// author: PE
// 审计入口：game109《种田》（暂名）**主菜单屏**（S7 换屏·D-13 · `buildStarterHome` 的产物 · STARTER_THEME）。
// 用法：node tools/ui-audit.mjs public/games/game109/self-check/audit-home.audit.ts --w 720 --h 910
//
// 【为什么新增这一臂】
//   S7 起本关**多了一屏**：装载后的首屏不再是 HUD 条，而是这棵 `Screen#starter-home` 全屏树。
//   既有三臂（audit-hud 量对局条 · audit-hud-shell 量壳屏 · audit-result 量结算面板）**没有一个量得到它**
//   ——新屏面不量 = 这屏的对比度/重叠/华丽度零机器守卫。⑨那批布局数字（标题卡与动作条的间距、
//   hero 键的倒角 clip-path 是否压字）在**起手包首次被本关使用**的语境下尤其没有先例。
//
// 【入口放在这里，不是 tools/audits/】
//   同 `audit-hud.audit.ts` 头注：S7 领工声明 §(n) 的边界栏没列 tools/**，而
//   `public/games/game109/self-check/**` 在栏内、且是 gameHash 的 EVIDENCE_DIRS（整目录跳过 ⇒ 不动指纹）。
//
// 【为什么用 720×910】
//   主菜单屏挂在与场景同尺的 `overlayHost`（`inset:0`·宿主骨架的 scene 是 `width:720px;height:910px`
//   + `scale(k)` 等比信箱）⇒ **720×910 正是它在 scale=1 时占的那个盒子**。换个尺寸量的是别的东西。
import { mountUI } from '../../../../src/ui/components/index.js';
import { buildHome } from '../../../../games/game109/hud.js';
import { STARTER_THEME } from '../../../../src/ui/starters/index.js';

// 「开始」键挂的是宿主局部 handler（`HUD_ACTION.start`·世界里没有消费者）⇒ 审计交**空表**即可：
// 审计只量几何与颜色，不点任何键（点了空表会落进 ActionSink 分支，与真机路径不同）。
mountUI(document.getElementById('root')!, buildHome(), {}, STARTER_THEME);
