# SIMLIFE-DEMON-PLAYTEST-01 施工自检

状态：**PASS（试玩准备面）；owner 真机目击 pending**。

## 判断与范围

生产代码 zero-code：当前 launcher catalog、共享 `mountLifeGame` 与 `loadGameArtInto` 已完整表达正式魔王城的启动和素材加载，不应新增游戏私有入口、UI 或 host 分叉。本单只新增一份正式数据契约测试和人类可复现试玩说明。

## 实查结果

- `src/launcher/life-launcher-catalog.ts` 只用四个 fixed eager glob 发现正式四文件；运行时 ID 为 `life:game-demon-castle`。
- `src/launcher/life-game-runner.tsx` 只接收已发现 bundle，并调用共享 `mountLifeGame`。
- `src/engine/host/life-game-host.ts` 在 mount 前严格解析 descriptor/package/slots，随后以 descriptor 的 `artSlug` 调用共享 loader。
- `gameArtIndexUrl('game-demon-castle')` 固定得到 `/games/game-demon-castle/art/index.json`。
- 正式 index 与 slots 各 26 项，全部闭合、approved、文件存在、bytes hash 匹配。

## 施工文件

- `src/authoring/demon-castle-playtest-contract.test.ts`（原位于正式四文件目录；SIMLIFE-VIEWPORT-01 为恢复 materializer exact-four 合同而迁出，测试语义不变）
- `docs/design/game-demon-castle/playtest.md`
- 本自检、对应独立 Review 导航、SimLife 项目路线图事实

## 验证

```text
npm.cmd exec -- vitest run \
  src/authoring/demon-castle-playtest-contract.test.ts \
  src/launcher/life-launcher-catalog.test.ts \
  src/launcher/life-launcher-integration.test.ts \
  src/launcher/life-game-runner.test.tsx \
  src/assets/game-art-load.test.ts \
  src/engine/host/life-game-host.test.ts
```

结果：**6 files / 35 tests PASS**。

- `npm.cmd exec -- eslint src/authoring/demon-castle-playtest-contract.test.ts`：PASS。
- `npm.cmd exec -- vite build`：PASS（765 modules；仅既有 chunk-size warning）。
- `npm.cmd exec -- tsc --noEmit`：全库仍有既有 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher/game-runner.tsx` 错误；本单新增测试零命中。
- 新测试以正式四文件实际 production catalog mount 一次共享 Host，并断言 teardown 后容器为空。
- 资产测试逐项重算 26 个 served PNG 的 SHA-256，而非只看台账字段。
- 完整路径测试经真实 input command/system 流水线完成 4 月木/3 影矿、三建设点、两格月铃成长/收获、三旗标和三剧情节点，未直接写材料、建设或剧情结果。
- 端口 5173 探测为 `NO_LISTENER_5173`；未启动服务、未运行浏览器、未生成虚假截图。
- 未执行 Git/GitHub、数据库、正式物化或持久化清理。
- 施工说明已按共享 HUD 的真实可见面修正：不要求不存在的地点/互动摘要；场景由批准素材、合法入口和 affordance 共同确认；已完成项目以 build 菜单项消失证明不可重复。
- 非施工人 `review_eng11` 独立复跑并逐项审计后判定 PASS：Critical 0 / Major 0 / Minor 0；owner 真机门未代签。

## 剩余人门

owner 必须按 `playtest.md` 在全新隐私窗口完成六步，覆盖三建设点、实际批准素材、首章反馈和刷新恢复。owner 未目击前不得把路线图 owner gate 标为通过。
