# game-loot-chest｜需求与共享缺陷

## REQ-CHEST-PUI-01 · `Panel` action 样式拼接缺分号 · status: 待 PUI

- 实查：`src/ui/components/render.ts` 的 `renderPanel()` 组装 `${style}${cursor}`；`layoutStyle()` 返回值末尾无分号。
- 真浏览器证据：宝箱舞台实际 style 为 `height:310pxcursor:pointer`，`getBoundingClientRect().height === 0`。
- 影响面：任意“最后一个 layout 声明是尺寸/边距”且带 `Panel.props.action` 的 LayoutNode，都可能丢掉最后一条 CSS。
- 当前游戏规避：可点击 Panel 显式补 `layout.margin:0`，让被吞掉的是无副作用默认边距，高度仍为合法声明。
- 正式修复归属：PUI；应在 `renderPanel()` 的 style/cursor 拼接边界补分号，并加真实浏览器或字符串锚点测试。宝箱游戏不越权修改 `src/ui/**`。
