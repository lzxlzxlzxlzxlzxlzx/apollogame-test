// Injected by vite.config.cartridge.ts at build time
declare const __TARGET_GAME__: string;

// 离线单文件卡带（scripts/package-web.mjs 注入到 <head>·在 bundle 之前执行）：
//   __APOLLO_INLINE_CART__ = 该卡带的 manifest 纯 JSON 对象（引擎经 parseManifest 直接跑，跳过 fetch）
//   __APOLLO_INLINE_META__ = 引导壳展示用的 { title, subtitle }（可选）
interface Window {
  __APOLLO_INLINE_CART__?: unknown;
  __APOLLO_INLINE_META__?: { title?: string; subtitle?: string };
  /** 嵌入式骰子卡带的可选初始请求；形状见 engine/host/dice-overlay。 */
  __APOLLO_DICE_REQUEST__?: unknown;
  // 只读调试口（REQ-RENDERCHECK R2b·dev 模式限定·launcher 域=Lead 自持）：给 UI 走查驱动器一个
  // 稳定读口——不必靠「猜选择器再重试」摸活体 DOM，直接问壳层「此刻挂载的游戏有哪些可点动作」。
  // 纯读 DOM 快照（data-action/data-arg/data-ui-id 三件已由 R2a 落）——不碰 sim、不碰确定性 hash。
  // 生产 build 不挂（见 src/launcher/game-runner.tsx 的 import.meta.env.DEV 门控）。
  __zcProbe?: {
    gameId: string;
    actions: () => Array<{ action: string; arg?: string; uiId?: string; disabled: boolean }>;
  };
}

// Vite ?raw 文本导入（如新手教程 html 内联进弹层 iframe srcdoc）
declare module '*.html?raw' {
  const content: string;
  export default content;
}

// Vite ?url 资产导入（自托管字体 woff2 等 → 打包发出 URL，不引用外部库）
declare module '*.woff2' {
  const src: string;
  export default src;
}
declare module '*.woff2?url' {
  const url: string;
  export default url;
}
