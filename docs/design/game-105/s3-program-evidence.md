# game-105 S3 程序证据：独立发行版 M1

日期：2026-09-02

## 本版范围

- 依据 `s3-standalone-release.md`，默认入口是无 Host、无网络、无模型凭据的独立版。
- AI 使用可见的本地动作和本地模板回应；物理塔、镜头、悬停、`Joint3D` 抽拉、取消和重开均在游戏本地完成。
- 保留未来 M2 的 Host 接缝，但只有宿主明确传入 `enableHostAdapter: true` 时才允许调用回复解析或结算回调。独立版默认不会触发该路径。

## 实现核对

- `games/game-105/local-ai-observation.ts:createLocalAIObservation` 输出受字段限制的只读观察数据，不读取 Cannon 私有状态或 `Transform3D`。
- `games/game-105/tower-action-executor.ts:TowerActionExecutor` 是玩家和 AI 共用的镜头、悬停、抓取、渐进抽拉、释放、取消与重开执行器；二者使用相同 `Joint3D` 物理路径。
- `games/game-105/ai-turn-director.ts:AITurnDirector` 以观察、悬停、抓取、渐进拖拽、释放的顺序完成可见 AI 回合。
- `games/game-105/game-105.ts:isHostAdapterEnabled` 为 M2 接缝增加显式 opt-in。没有该标志时，AI 回复走本地模板，终局不会向 Host 回传。
- `games/game-105/tower-blueprint.ts` 保持 54 块塔、45 度失稳阈值、30 帧稳定窗口、900 帧不稳定兜底和桌面碰撞分层。

## 已运行验证

```powershell
npx tsc --noEmit
npx vitest run games/game-105/local-ai-observation.test.ts games/game-105/ai-turn-director.test.ts games/game-105/game-105-host-seam.test.ts games/game-105/tower-blueprint.test.ts games/game-105/tower-lifecycle.test.ts games/game-105/tower-session.test.ts --silent
node scripts/game-pipeline.mjs gate game-105 S3
```

- TypeScript 类型检查通过。
- S3 专项回归 `35/35` 通过，覆盖纯数据观察非法状态、AI/玩家共用执行器、取消/倒塌/重开清理、桌面碰撞及 Host 默认禁用。
- S3 机器门通过：Chrome 渲染探针、点击探针均通过，且为零 console error。当前门禁输出与截图位于 `public/games/game-105/probe/`。

## 独立版运行结论

- 未提供 Host 时，启动可使用默认角色、固定种子与本地模板；不读取 API Key，不发起网络请求。
- AI 的镜头、悬停、抓取、拖拽、释放都由本地 `AITurnDirector` 驱动，可由本地验收和浏览器走查复现。
- `Esc`、倒塌和重开均会取消未完成动作并释放关节、选中态和悬停态；重开重新创建完整初始塔。

## 移交与限制

- S3 机器验证已由程序完成；独立复查和 owner 签核必须由非施工者按当前指纹重新执行。
- M2 的真实模型、Storyteller、Host 协议和外部结果回传保留为历史/未来设计，不是本独立发行版 S3 的验收依据。
