// P3a 机器围栏的「平台中性全局」（REQ-P3TAIL M1）。
//
// 围栏要量的是「sim 面还碰不碰 **DOM**」，不是「sim 面用不用 console」。
// `console` / `structuredClone` / `performance` / `queueMicrotask` 在浏览器、Node、Worker 里**都有**——
// 它们出现在 `lib.dom.d.ts` 只是历史归类，不代表依赖浏览器。把它们声明在这里，
// 围栏的报错就只剩**真正的 DOM 专有物**（window / document / HTMLElement / KeyboardEvent…），
// 那才是 P3a 要拆掉的东西。
//
// ⚠ 这里只许加「三种宿主都有」的东西。想往下加之前先问：Worker 里有吗？Node 里有吗？
// 有一个没有就不该加——那正是围栏该拦住的。
declare const console: {
  log(...a: unknown[]): void; info(...a: unknown[]): void;
  warn(...a: unknown[]): void; error(...a: unknown[]): void; debug(...a: unknown[]): void;
};
declare function structuredClone<T>(value: T): T;
declare const performance: { now(): number };
declare function queueMicrotask(cb: () => void): void;
declare function setTimeout(cb: (...a: unknown[]) => void, ms?: number): number;
declare function clearTimeout(id: number | undefined): void;
declare function setInterval(cb: (...a: unknown[]) => void, ms?: number): number;
declare function clearInterval(id: number | undefined): void;
declare class TextEncoder { encode(s?: string): Uint8Array }
declare class TextDecoder { decode(b?: ArrayBufferView | ArrayBuffer): string }
