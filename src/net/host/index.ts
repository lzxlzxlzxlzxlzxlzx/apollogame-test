// net/host —— **浏览器宿主胶水**（P3a 宿主拆分·REQ-P3TAIL M1）。
//
// 这一半天生要 `window` / `document` / `navigator` / `KeyboardEvent`：键盘源、指针源、手柄源、
// 轮替操控、双标签页 demo。它们**不是 sim**，不该被 `src/net/index.js` 混在一起再导出——
// 混在一起时，任何想在 Node / Worker 里跑 sim 的消费方都会顺着桶文件把整个 DOM 类型图拖进来
// （P3a 的验收原文：「sim 在 Node/Worker 里 import 不带 dom lib 也过 tsc」）。
//
// 分开之后：**sim 面从 `@net/index.js` 取，宿主面从 `@net/host/index.js` 取**，
// 机器判据 = `tsconfig.sim.json`（sim 面不带 dom lib 必须编译过）+ `scripts/sim-dom-fence.mjs`。
export { QueuedInputSource, PointerInputSource, canvasPointerToScreen, synthesizeDrag } from './queued-input.js';
export { KeyboardInputSource, DEFAULT_KEYMAP } from './local-input.js';
export type { KeyMap, KeyBinding } from './local-input.js';
export { GamepadInputSource, DEFAULT_PAD_MAP } from './gamepad-input.js';
export type { PadButtonMap, PadButtonBinding, GamepadLike } from './gamepad-input.js';
export { SwitchableInputSource } from './switchable-input.js';
