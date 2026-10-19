# GAL-ENG-HOST-EXIT-01 · 受控宿主退出共享能力合同（2026-10-14）

状态：**Owner 选通用端口 A、桌面壳时序 B；H1 独立局部 PASS，H2 与 H3 桌面消费后置 `web-desktop-release`**（证据：[H1 施工](review/REQ-GAL-HOST-EXIT-01-H1.md)、[独立复查](review/REQ-GAL-HOST-EXIT-01-H1-independent.md)、[H2 预检](self-check/REQ-GAL-HOST-EXIT-01-H2-preflight-2026-10-14.md)）。浏览器预览只展示反馈；不得把退出 IPC 接到现有卡带或工作台壳。该判词不批准远程发布、素材或项目控制台 Owner 人门。

## 实查与归属

- 定稿 `gal-ui-complete-v2.md` 要求 `exitGame` 六项确认之一：浏览器原型反馈，桌面宿主真正退出。`src/services/gal-profile/gal-confirmation-policy.ts` 已有 `exitGame` 纯确认政策，`GalProfile` V6 已持久化该独立开关；这不是“退出能力”。
- `src/services/gal-ui/gal-ui-structure.ts` 的首页退出目前 disabled + `gal.unavailable`；`GalSliceHost` 的确认闭集仅 `new-game/save-empty/overwrite/load/return-title`，没有退出意图/端口。`mountGalBrowserGame` 只注入存储、音频、时钟和素材；其 `close()` 是卸载/关数据库连接，不等于关闭应用。
- `src/services/platform/platform-port.ts` 仅有成就、统计、排行、富状态、存储提交，没有宿主退出。`electron/main.cjs` 与 `electron/platform-main.cjs` 的 `app.quit()` 属窗口生命周期代码；当前未见 GAL 专用发行入口把它安全注入 `GalSliceHost`。不得直接从渲染器调用 `window.close()`、`process.exit()`，也不得把现有预览/通用工作台的关闭能力误认为已接上 GAL。
- 共享端口/策略与合成边界归 **LEAD／共享引擎宿主负责人**；桌面 preload/IPC/main 适配归 **PS／桌面宿主负责人**；只有前两段独立复查放行后，`src/services/gal-ui/**` 的闭集消费归 **GAL 主程**。复查人不得与各段施工人相同。`src/ui/**` 仍归 PUI，不由此票越界。

## 写死的最小接口与安全语义

1. 共享层提供**显式注入、可选、无默认全局探测**的 `HostExitPort`（名称可按既有命名收敛）：单一 `requestExit()` 意图，返回闭集 `accepted | unavailable | rejected` 或等价的可判别结果。`accepted` 仅在桌面宿主确认接收退出请求时产生；拒绝/失败必须可反馈，不能先把 UI 标为“已退出”。端口仅在表现/宿主层，绝不进 World、快照、Replay/hash 或作品 `GalPackage`。
2. 桌面适配必须经受限 preload 白名单和单一 IPC 命令送到拥有该游戏窗口的主进程；主进程校验调用来源/窗口归属，不接受任意目标窗口 ID、路径、命令或脚本。只作用于当前明确的桌面游戏宿主；不得关闭整个 ZeroCraft 工作台、其他游戏或用户浏览器。适配器先返回“已接收”再按宿主生命周期执行真正退出，清理其拥有的资源；不可把 `close()` 清库连接或浏览器 `window.close()` 当退出结果。
3. GAL 只增加具名 `gal.home.exit` → 宿主待决 `exit-game` 意图。`requiresGalConfirmation('exitGame', currentProfile.preferences)` 为唯一政策：开时显示确认，取消/Escape/遮罩只清待决意图且端口调用为 0；关时跳过弹窗但仍执行**同一个合法请求**，不得绕过端口或把关闭提示解释为“禁止退出”。重复点击/并发确认至多请求一次；拒绝、抛错或端口缺失保持当前页面/World/手动槽，给诚实反馈，可再试。
4. 浏览器预览使用**显式预览模式**：走同一 `exitGame` 确认政策，接受后只显示“预览不会关闭浏览器，桌面版由宿主处理”之类反馈，**绝不**调用原生退出或 `window.close()`。无预览模式且未注入桌面端口时 fail closed：不可谎称退出成功。实际产品选择是否隐藏/禁用入口，由可观测 capability 状态决定，不从 `window` 对象猜环境。
5. 退出前不隐式保存剧情，不清除 Profile/存档，不修改剧情状态；当前已提交的 Profile/槽写入不得因为退出请求被伪装为成功。入口/端口可用性与确认结果应有宿主级审计 trace（请求、拒绝、接受），不得写敏感存档内容或靠墙钟进入确定性 World。

## 依赖顺序与验收

| 段 | 负责人与依赖 | 必须证明 |
| --- | --- | --- |
| H1 共享端口 | LEAD／共享引擎宿主负责人先领锁；不占 PUI 域 | 缺端口/拒绝/抛错/重复请求的闭集结果与幂等；默认无退出能力，其他游戏默认行为不漂；`tsc`/定点测试/唯一锚点撤修验红。 |
| H2 桌面适配 | PS／桌面宿主负责人；Owner B 后置到 `web-desktop-release`，先有独立 GAL-only 壳与窗口归属再领锁 | 隔离 mock Electron 或短时桌面探针证明白名单 IPC 来源校验、只退出所属窗口/应用、恰好一次、失败仍活；无主工作台常驻启动、无真实账号/发布。 |
| H3 GAL 消费 | GAL 主程；浏览器预览可先做，桌面消费待 H2 独立 PASS | 真浏览器预览确认开/关、取消/Escape、接受仅反馈；后续隔离桌面端口假件确认开/关各恰一次，缺/拒/错不假报；Profile 旧档/跨包、读档/回滚/重开不串确认政策，World/hash、手动槽不变；1440×900 V2 入口及确认同画布、深亮 UI 审计。 |

全量门禁与独立复查分别量各段退出码、撤修验红及 stderr 告警；局部 PASS 不等于桌面发行包、S5/S6 或项目人门通过。当前 5173 主工作台不得由 agent 启动；需要实际桌面发行/上架时另按 Owner 本机操作与 PS 发布门办理。
