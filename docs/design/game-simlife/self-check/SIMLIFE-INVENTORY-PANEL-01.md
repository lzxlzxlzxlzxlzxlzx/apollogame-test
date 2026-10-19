# SIMLIFE-INVENTORY-PANEL-01｜施工自检

日期：2026-10-14  
施工者：BDM程序  
结论：施工范围完成，进入独立复查；未代签复查或 Owner 人门。

## 实现证据

- `LifeHostDescriptor v1` 新增可选 `inventoryPanel`：默认缺省兼容；`enabled/columns/titleLabelKey` 严格闭集，列数限制为 1–8，非法类型、未知字段与非 plain object 均给出稳定 path 诊断。
- presenter 从编译后的 `LifeItemCatalog` 与玩家 `Inventory` 生成目录稳定序的 `inventoryItems {id,title,kind,count,skinKey}` 及容量投影；旧 `inventory` 栈摘要保持原状，读取前后 World snapshot 一致。
- 共享 Host 用既有 LayoutNode `Drawer/Panel/Button/Image/Label` 组合顶栏入口与右侧不透明抽屉；已加载 `skinKey` 解析为图片，未加载/未批准图使用通用占位，不新增 `src/ui/**` 控件或自由 DOM/CSS。
- `I` 切换、Escape 关闭、指针开关均走 render-local host effect；开关期间 held movement 不被清空，未向 World、network、snapshot、hash 或 save 写入状态。
- 魔王城候选与正式 `life-host.json` opt-in 三列“魔王行囊”；未修改玩法 JSON、存档协议或素材台账。严格 `life-materialize --plan-update` 无冲突，确认执行结果 `writesPerformed:false`，证明四文件已是 canonical 目标；files hash 为 `sha256:d6dd2f2d371ebb1b1725c38b9f05c97a13e1a117c023ec6d25c614327c7e11a1`。

## 门禁证据

- 定向 Vitest：8 files / 116 tests PASS（descriptor、presenter/input/HUD/host、save、package compile、launcher、Little Valley interaction）。
- `npm.cmd exec tsc -- --noEmit`：PASS。
- `npm.cmd run lint --if-present`：PASS。
- `validateLayoutNode`：抽屉树零 issue；包含图片槽与通用占位断言。
- `tools/ui-audit.mjs tools/audits/life-inventory-panel-dark.audit.ts`：暗色 forest 主题，重叠 0、硬失败 0、对比警告 0、border-image 问题 0。
- `tools/ui-audit.mjs tools/audits/life-inventory-panel-light.audit.ts`：亮色 `STARTER_THEME`，重叠 0、硬失败 0、对比警告 0、border-image 问题 0。
- 撤修验红：将 presenter 目录顺序临时反转后，锚点 `projects held item metadata in catalog order without mutating World state` 精确失败；恢复后 `life-host.test.ts` 26/26 PASS。
- 全库 `node scripts/scoped-gate.mjs --run` 已真实执行；在 `depcruise` 被共享工作树既存 33 条依赖违规阻断（包括既存 Life host/game-simlife 分层路径），发生在 tsc/vitest/build 前。本单未新增依赖方向，也未越界修改这些共享红项；本单独立门禁如上全绿。

## 边界复核

- 无远程 Git/数据库写入，无整套 ZeroCraft 启动。
- 无游戏私有 TypeScript、无素材生成/审批/登记、无 Owner 人门代签。
- formal descriptor 更新通过受控 materializer 的 plan/update 哈希门复验，结果幂等零写入。
