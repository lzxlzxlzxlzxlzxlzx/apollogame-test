// engine/math —— 底层数学库桶（scalar / vec2 / grid / geom2 / ease / hash / tick）。sim 面零 trig 零 hypot；纯函数、逐位可复现。
// 直接 import 子模块也行（`@engine/math/vec2.js`）；桶只做再导出，无副作用。
export * from './scalar.js';
export * from './vec2.js';
export * as grid from './grid.js';
export * as geom2 from './geom2.js';
export * as ease from './ease.js';
export * as hash from './hash.js';
export * as tick from './tick.js';
