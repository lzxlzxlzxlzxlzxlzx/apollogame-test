# S6 非施工者独立核证（2026-10-14）

判词：**CONCERNS（局部实现通过，S6 未释放）**。本单是额外对抗性复核；按 `review-gates.md`，S6 正式复核仍是美术平台 Owner 逐行 ☑，不能以本单替代。复查时 `game-pipeline.mjs board --json` 的游戏指纹为 `9b4433773168759c`，S6 台账 7 行、写回 7、平台复核 0；S2–S5 的机器/复查证据因游戏文件变化而过期。

## 独立复跑

- `npx vitest run games/game-potion-brewing`：4 个文件、17/17 通过，退出码 0。首轮 Windows 沙箱 `realpath EPERM` 导致未收集任何用例；同一命令在允许本地依赖解析的环境中重跑通过，不能把首轮计为测试失败或绿灯。
- `npx tsc --noEmit`：退出码 0。此前并行 `src/assembly/cart-presentation.ts` 类型错误在本次复跑时已不复现；此项只证明当前时刻类型检查，不代替 S8 全库门。
- `node scripts/ledger-audit.mjs game-potion-brewing --strict --json`：7/7 可消费、0 孤儿，PASS；`art-ledger-guard`：0 黑户、0 死账、0 缺 provenance，PASS；`align-count --game game-potion-brewing --stage S6`：8 ✅、1 ⚠（已写明 Owner 平台复核去向）、0 ❌，退出码 0。
- `node tools/ui-audit.mjs games/game-potion-brewing/{screen,screen-result,screen-exit}.audit.ts --w 1440 --h 900` 分别执行：三屏重叠 0、硬低对比 0、border-image 前提 0。非阻断警告：审计器报 house 主题“否”，结算与退出屏各仅命中 1 处华丽件；`POTION_THEME` 实际扩展 `apolloBrocade`，故这个静态分类须与实拍并看，不能当作缺主题的证明。

## 实拍与失效路径

- 独立查看 1440×900 定稿 `ui-refs/29-transparent-fixed-recipe.png`、`31-transparent-success.png` 与 `self-check/shots/S6-01-start.png`、`S6-05-success.png`：斜俯视实体锅、五种可辨材料、卷轴/木架装饰和大框药瓶均可见。成功框的皮色与按钮造型并非像素相同，但主要层级与尺寸相近。仍有造型差别：正式搅拌棒是较平直的杆，定稿原型为有圆头、斜入锅的杆；此项须纳入 Owner 的 S6 视觉判断，不应由复查者默许为“完全 1:1”。
- 隔离短时浏览器用本地 Vite 端口 5701，**只**将 `/games/game-potion-brewing/art/index.json` 路由为 404：请求确实拦截 1 次，画布仍挂载，月露草选择控件可点击，`pageerror` 0。未连接/写入远程数据库。该探针首次清理调用误传了包装对象而非 `dev.proc`，断言已输出但进程未自退；随后用 Ctrl-C 结束，确认本地 5701 无监听。故它只支持“索引 404 时不崩且基本交互仍可达”，不声称整个无图通关链已复核。

## 锚点撤修验红、告警边界

- 对 `games/game-potion-brewing/art.test.ts` 的精确锚点 `expect(existsSync(\`public${entry.path}\`)).toBe(true)` 断言命中 1 次；在**内存隔离副本**把 `potion/ingredient/moon-herb` 的路径改为不存在的 `ingredient-missing.svg`，文件存在性从 7/7 变为 6/7，说明新增点名断言会抓到缺图。没有改共享工作树。此为断言级红检，不冒充真实 Vitest 撤代码全跑。
- `game-skill-audit` PASS、棘轮 PASS，但报 `game-potion-brewing.ts:126` 一处 `performance.now()` 建议项；用于 render-only 拖拽影像，不应混同确定性 sim 时钟。
- `asset-reconcile.mjs game-potion-brewing --json` 的参数解析仅接受 `^game-?[a-z0-9]+$`，本多连字符 slug 没有被选中，实际执行了全库扫描并报别的项目 FAIL。因此**不能**拿其全库 FAIL 认定本游戏资产断链；本游戏 7 个路径由 `art.test.ts` 点名检查，但独立资产三方对账仍缺适配此 slug 的专用结果。

## 未释放条件

1. Owner 在美术平台对 `art-01` 至 `art-07` 七行逐项复核；Agent 不代按、不代签。
2. 在最终游戏指纹上重核过期的 S2–S5 机器/独立复查证据，按流程板真实状态推进；本单不将旧绿追认为新绿。
3. Owner 真机判断上述搅拌棒造型与结算皮色差异是否接受；如判不可接受，先按原型优先纪律处理，而非静默降格。
