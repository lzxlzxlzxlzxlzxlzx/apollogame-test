# game-dice → DokiWorlds SDK 0.1.0 接入评判

> 评判日期：2026-09-24  
> 游戏 App ID：`game-physics-dice`  
> 目标：未来放入 `C:\Users\24652\Desktop\projects\dokiworlds\frontend\public\apps\game-physics-dice\`

## 结论

**当前不能开始“完整输入输出接入测试”；可以准备并执行静态目录发现、页面渲染和最小握手测试。**

这不是骰子玩法未完成，而是新 SDK 0.1.0 尚未向 App 公开初始化 `input.data`。把当前 dist 直接复制过去会同时遇到 SDK API、manifest 和业务输入三类不兼容。

资产字节闭包需要单独裁定：**当前 game-dice 的 dist 已把运行所需美术和字体全部带入包内，可以离开 ApolloGame 源目录加载；但它依赖 game-dice 专用构建脚本兜底，并非引擎通用能力，且导出的索引仍有本机 provenance 路径，尚不满足干净发布包标准。**

## 1. 已具备的条件

- App ID `game-physics-dice` 符合目录命名规则，并与当前代码常量一致。
- 现有包装已产出 `index.html`、JS 与本地资产，具备向自包含静态目录迁移的基础。
- 现有输入契约为 `doki.game.dice-input/1`，输出为 `doki.game.result/1`，定义明确。
- 游戏已有独立预览输入，能够用于“只证明画面和 3D 骰子正常”的静态 smoke；但该预览不能算宿主输入测试。
- 真实物理结果已经能投影为版本化游戏结果数据，玩法侧不需要因新 SDK 重写。

## 2. 当前阻塞

### B1｜SDK 输入不可读（完整接入硬阻塞）

`games/game-dice/game-dice.ts` 依赖旧版：

- `@dokiworld/app-sdk`
- `@dokiworld/app-sdk/game-result`
- `connect({ onInit, onPrepareExit, onError })`

新 `dokiworlds-app-sdk@0.1.0` 只有 `connect()`，没有 `onInit`，客户端也没有其他公开方法读取初始化输入。骰子游戏必须从输入拿到 1–3 个骰子的面数、修正值和难度；没有该输入就不能证明真实调用链。

上游缺口两路：

- A（推荐）：SDK 增加受控 init payload API；通用于所有需要宿主参数的 App，安全边界集中在 SDK。
- B：game-dice 自己监听原始 `postMessage`。代价是复制协议和安全校验、形成平行实现；违反 SDK 接入原则，**wontfix**。

在上游 A 未落地前，不得宣称 game-dice 完整 SDK 接入通过。

### B2｜当前包装仍面向旧 SDK

现有 `dokiworld/game-physics-dice/package.json` 没有声明新 SDK 依赖；游戏源码 imports 和类型都指向旧包。必须等 B1 的最终 API 固定后再写 adapter，避免对临时接口二次返工。

### B3｜本地 manifest 不匹配

现有文件叫 `app.manifest.json`，而 DokiWorlds 当前本地 loader 查找的是 `manifest.json`。当前 loader 只消费：

- `entry`
- `locales.en.name`
- `runtime.input.contract/version`

旧 schemaVersion/kind/inputs/outputs 字段不会承担当前目录发现和直接启动输入的职责。需要生成一个新本地 `manifest.json`，不能只改文件名后假定全部语义被消费。

### B4｜APPS 直接启动不提供骰局数据

APPS 面板使用 manifest 的 contract/version，但固定 `data: {}`。`game-dice` 的校验要求 1–3 个 d4/d6/d8/d20，空对象必然失败。

因此完整测试必须由：

- 支持配置 data 的测试宿主；或
- 一个父测试 App 调用 `apps.launch` 传入真实骰局；

并且仍以 B1 的 SDK init 输入 API 为前提。把预览默认骰局当成输入成功属于伪通过。

### B5｜dist 泄漏绝对本机来源路径（已修，待独立复查）

只读审计发现现有：

`dist/games/game-dice/art/index.json`

仍包含 `C:/Users/24652/Downloads/De-20.stl` 和
`C:/Users/24652/Desktop/projects/games/dokiworlds-apps` 等来源/恢复元数据。虽然运行时资产文件已经复制进 dist，绝对本机路径仍违反对外包红线，也会暴露无意义的开发机信息。

已由共享 `scripts/app-asset-closure.mjs` 在导出 portable index 时移除本机绝对 provenance 路径；不手改 dist。2026-09-24 重建后绝对路径泄漏 0，闭包缺失 0，哈希不一致 0。

### 当前资产闭包实测

- dist 资产索引：10 条（8 张 PNG、2 个 STL）；缺失文件 0。
- `SHA256SUMS.txt`：21 条；哈希不一致 0。
- bundle 内 `/games/game-dice/art/`、`/ui-fonts/` 站点根绝对运行引用 0。
- 所需 CJK 字体已复制到 `dist/ui-fonts/`。
- bundle 中仅发现 W3C XHTML namespace 和 JCGT 参考资料两个 URL 字面量，不是美术/模型/字体的网络加载地址。

因此“包移走后真实骰子和画框是否仍有文件可加载”的答案是肯定的；“是否已经由统一引擎机制保证所有游戏都如此”的答案是否定的。

## 3. 分层准入表

| 层级 | 当前能否开始 | 通过标准 |
|---|---|---|
| L0 构建产物自包含 | 本地验证通过，待独立复查 | `index.html` 与全部相对资源在目标目录内，无旧 CDN/绝对本机路径；闭包报告 10 个资产文件 + 7 个字体文件，缺失 0 |
| L1 catalog 发现 | 可以准备 | 目录为 `game-physics-dice`，存在入口与最小 `manifest.json`，APPS 列表可见 |
| L2 iframe 页面与 3D 骰子 smoke | 可以 | 同源 sandbox 内无白屏；真实 3D 模型、贴图、物理动画可见；预览值明确标注为 preview |
| L3 `dokiworld.app/2` 握手 | adapter 迁移后可测 | `runId` 建立，无重复连接、origin 或 dispose 错误 |
| L4 宿主输入 | **不可，B1 阻塞** | 宿主传入指定骰池，App 读取并严格校验，画面与输入一致 |
| L5 完成输出 | 部分可测 | 固定预览可验证 `complete` ack；真实结果回传必须和 L4 一起过 |
| L6 端到端接入 | **不可** | 输入→物理掷骰→结果 envelope→宿主 accepted 全链真实通过 |

## 4. B1 解除后的施工单

1. 在 `dokiworld/game-physics-dice` 声明并锁定 `dokiworlds-app-sdk@0.1.x` 的实际来源；浏览器 bundle 内嵌 SDK。
2. 新建薄 adapter，消费 SDK 公开 init payload；严格校验 `doki.game.dice-input/1`，复用 `normalizeDiceInput`，不得把校验复制到 UI。
3. 用普通 `AppContract` 构造 `doki.game.result/1` 输出；移除旧 `game-result` 子路径依赖，但保持现有 result 字段与测试口径。
4. `connect`、init、complete ack、dispose 各自只发生一次；完成确认前不能卸载 iframe。
5. 生成本地 `manifest.json`，至少包含 entry、英文显示名和输入 contract/version；不要依赖 loader 当前不读取的字段。
6. 构建到临时输出后核对自包含性，再由 owner 把确认后的目录复制到 DokiWorlds `frontend/public/apps/game-physics-dice/`。
7. L0→L6 逐层验证；L2 使用 preview 必须显式标注，L4/L6 必须使用宿主真实输入。

## 5. 必测样例

- `{ dice:[{sides:6}] }`
- 三骰混合：d4+d8+d20，带 modifier
- 带 difficulty，分别命中 win/loss
- 非法 contract、非法 version、空 dice、4 个骰子、非法 sides
- 宿主关闭为 cancelled；完成 accepted/rejected；ack 超时；重复 complete
- 同输入同 seed/受控随机源的结果映射稳定
- 3D 资产加载失败时可诊断降级，但不得静默变回假骰子

## 6. 当前允许做的下一步

在不伪造完整接入的前提下，可以先完成：

- 新目录布局和最小 manifest 的构建设计；
- 静态资源相对路径/自包含审计；
- 新旧 SDK adapter 的编译隔离设计；
- L0–L2 的验收脚本与证据模板；
- 向 DokiWorlds SDK 提交 B1 的 API 需求规格与测试用例。

不能先做：App 私自读原始消息、把默认预览当宿主输入、跳过 output ack、声称 APPS 中能打开即“接入完成”。
