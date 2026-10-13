# Life 共享 Host 与 Web 启动器独立复查

日期：2026-10-10  
复查范围：`life-host-web-registration` 路线图里程碑  
复查人：Lead（非施工人）

## 结论

**通过，适合自动收束。** 后续 Life 游戏可通过固定同目录 JSON 文件被发现、严格验证并交给共享 `mountLifeGame`，无需复制 Little Valley 的浏览器宿主逻辑或建立游戏私有 loader。

## 独立实证

- 阅读 `life-launcher-entry.md`、`life-launcher-catalog-core.ts` 与 `life-game-runner.tsx`：启动器只扫描固定 eager 模块，任何路径、URL、模块名或身份不一致都会变成不可运行诊断卡；已验证 bundle 才能调用共享 Host。
- 独立运行 `npx vitest run src/launcher/life-launcher-catalog.test.ts src/launcher/life-launcher-integration.test.ts src/launcher/life-game-runner.test.tsx src/engine/host/life-game-host.test.ts`：4 文件、25 测试通过。
- 覆盖第二个虚构 Life 游戏的发现/运行、四份 JSON 的 identity 对齐、缺文件/错误 contract/重复 id 的 fail-closed、descriptor 派生存档槽、runner dispose，以及 Host 入口在接触 DOM 前拒绝错误 authoring 边界。

## 范围边界

现有 Little Valley 仍保留兼容内置入口；本里程碑证明的是新 Life 游戏的共享启动通路，而非第二款游戏内容已经生成或发行出口已经完成。
