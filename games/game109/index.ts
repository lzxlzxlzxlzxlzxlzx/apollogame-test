// game109 · 种田（暂名）—— 卡带 launcher 契约：mount(container) → cleanup。
// 玩法=数据（blueprint 组件 + 引擎能力）；本目录零专属系统代码。
//
// 两个入口都指向同一个 mount（launcher 的 loaders 记录按 game-103 先例直接 import 宿主模块）：
//   import('@games/game109/game109.js')  → { mount }
//   import('@games/game109/index.js')    → { mount }（本文件透传）
export { mount } from './game109.js';
export { buildBlueprint, tileId, VIEW } from './blueprint.js';
// 数据表（S4/S5 的 HUD/验收剧本会直接读；S3 只有测试读它们）。
export { ACTIONS, BALANCE, CROPS, CROP_BY_ID, FARM, GROW_PHASE_FLAG, RES, SIGNALS, TILE_FLAG, TILE_FSM, TILE_STATE, TOOLS } from './data.js';
export type { CropDef, ToolDef } from './data.js';
// 主题（几何/皮肤槽清单）。
export { ALL_SKIN_KEYS, FIELD_H, FIELD_W, HUD_H, SCENE_SKIN, TILE_BIT } from './theme.js';
// HUD（S3 点击门的活体控件：纯 LayoutNode 数据 + 只读投影；宿主 mount 里 mountUI 用）。
export { HUD_ID, buildHud, readHudView } from './hud.js';
export type { HudView } from './hud.js';
