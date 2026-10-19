# Review 单 · `SIMLIFE-DEMO-14` JSON 卡带迁移与 AI 创作入口

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-DEMO-14` |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | **独立复查通过**（`review_eng11`；blocker / major / minor = 0 / 0 / 0） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | `games/game-simlife/{little-valley.life.json,life-demo-package.ts,life-demo-package-json.test.ts}`、`src/assembly/{life-package-validate.ts,life-package.test.ts}`、设计文档与工单台账 |

## 一、做了什么

1. 把 Little Valley 的完整 `LifeGamePackage` 迁移为单一原生 JSON：`little-valley.life.json`。世界、场景、36×26 地图 RLE、碰撞、目录、相机、移动、里程碑、对话、warp 与视觉 key 均直接写在数据中。
2. `life-demo-package.ts` 仅保留 JSON import、`LifeGamePackage` type import 与零逻辑类型边界；旧 `Grid` / `grid` / `rect` / `rle` 地图生成代码全部移除，运行时不再存在第二份 package 来源。
3. raw JSON 测试直接经过既有 `validateLifeGamePackage` / `compileAndParseLifeGamePackage` 严格链；同时覆盖 camera 未知字段与非法 zone action 的 fail-closed 行为。
4. 新增 `life-json-authoring.md`，向模型作者写明唯一输入、关键闭集、RLE 总长、`art:` key、禁止派生运行态与最小验证清单；不新增生成器、AI 服务或自由代码 DSL。
5. 修正 capability plan：JSON 是唯一 authored source；动态交互 UI 只消费 `LifeActivityContext.affordances`，不重判 inventory、package、resource、crop 或 warp 状态。
6. 首轮独立复查发现旧 validator 只对 camera/follow 做未知字段检查；root、scene 与 access requirement 会静默吞掉 callback。现已补齐 `LifeGamePackage` v1 所有声明对象的闭集 shape pass（dialogue `graph` 仍按协议保留为其专属数据图），未知字段在 compile 前按 JSON path fail-closed；这属于既有 validator 契约修复，不新增 capability/system。

## 二、复查请逐条核

| # | 核什么 | 独立验证建议 | 施工方自验 |
|---|---|---|---|
| 1 | JSON 是唯一运行时数据源 | 检查 JSON import 与 `LITTLE_VALLEY_PACKAGE` 对象身份 | `toBe(rawPackage)`，通过 |
| 2 | TS 零 authored 逻辑 | 搜 `Grid` / `grid(` / `rect(` / `rle(` 与 package 字面量 | TS 仅 4 行 import/type edge/export |
| 3 | 世界语义等价 | 断言 meta、相机、2 scene、36×26 RLE、zone、镇长、资源、矿洞门、里程碑、对话门 | 全部通过 |
| 4 | 严格失败 | 分别给 root、scene、warp access gate 加 callback；给 zone 加非法 teleport action | validator 返回精确路径；compiler 均抛错 |
| 5 | 无路径逃生 | 递归扫描 raw JSON 所有字符串与所有 `*skinKey` | 无 data/HTTP/file URL、相对/绝对路径或文件扩展名；全部视觉引用保持 `art:` key |
| 6 | 现有解释链 | 跑 game-simlife + Life assembly compiler/validator | 5 文件 / 46 测试全绿 |
| 7 | 文档与能力声明 | 对照 authoring guide 与 capability plan | 唯一 JSON 输入、affordances-only 已写明 |
| 8 | 反向证明 | 临时禁用 closed-shape pass；另对 JSON mine gate 做首轮 sabotage | 闭集锚点准确 1 红（8 路径全消失）；恢复后 1 绿；mine gate 亦准确 1 红后恢复 |

## 三、门禁与证据

- game-simlife + Life package/compiler：**5 文件 / 47 测试全绿**。
- 点名 JSON migration 测试：**2 文件 / 15 测试全绿**。
- ESLint（迁移 TS / 测试）PASS；component manifest `194/194` PASS；game-skill-audit / RATCHET PASS；docs-ref guard PASS。
- 真实 Little Valley compile 能力子图：112 个注册系统、23 个共装系统，无 duplicate、dangling 或 cycle，PASS。
- JSON 解析统计：43,383 字符 / 43,603 UTF-8 bytes、2 scenes、36×26；ground RLE 121 runs、collision RLE 67 runs；纯 JSON 解析 PASS。
- 全量 `tsc --noEmit` / `npm run build` 仍仅被既有 `game-dice` Label size、`game-theft` Label font 与 launcher mount 签名错误阻断；输出没有本单文件。

## 四、撤修验红

- 锚点：`life-demo-package-json.test.ts` 的 `preserves the authored world and gameplay semantics exactly`。
- 撤修：临时将 raw JSON 的矿洞 gate `requires.equals` 从 `true` 改为 `false`。
- 结果：点名用例准确 **1 红**，实际 false、期望 true；同回合恢复 JSON 后该用例 **1 绿**；闭集修复前的阶段性回归为 5 文件 / 46 测试全绿。
- 首轮独立复查 major 修复后的第二锚点：临时禁用 `validateClosedPackageShape(raw, issue)`，运行 `rejects unknown fields throughout the closed Life package schema`；用例准确 **1 红**，8 个预期 unknown path 实际全空。精确恢复闭集 pass 后该锚点 **1 绿**，最终回归更新为 5 文件 / 47 测试全绿。

## 五、边界与已知项

- 除补齐既有 Life validator 的 schema-v1 闭集行为外，没有改 capability、system、协议、`src/ui/**` 或美术；没有新增生成器、AI 服务、自由代码解释器或派生运行态字段。
- 临时机械导出脚本已删除，仓内没有迁移临时文件；最终 authored source 只有 raw JSON。
- 没有修改数据库，没有启动/重启服务，也没有执行任何 Git / GitHub 操作。

## 六、独立复查结论

- 首轮结论：**FAIL（blocker 0 / major 1 / minor 2）**。major 为 root / scene / access gate 未 fail-closed；minor 为 UTF-8 字节数误报、路径扫描覆盖不足。三项均已修复并新增反向证明。
- 最终复核：**PASS，建议策划验收**；blocker / major / minor = 0 / 0 / 0。独立重放 camera、非法 action、root、scene、access callback 六探针，前五项均由 validator 与 compiler fail-closed；通用协议的 `foo.png` 仍是兼容 opaque key，Little Valley 则由递归路径扫描与 22 个 `art:` skin key 断言收紧。
- 独立复跑 Review 点名集合 **5 文件 / 47 测试**、JSON 点名 **2 文件 / 15 测试**，全部通过；ESLint、component manifest `194/194`、game-skill-audit / RATCHET、docs-ref guard 全部 PASS。
- 独立真实 compile capability 列表未漂移；system graph 为 112 registered / 187 explicit edges / subset 23，无 duplicate、dangling 或 cycle。
- 独立撤修临时禁用唯一 closed-shape 调用，unknown-fields 锚点准确 1 红 / 9 skipped；精确恢复后 1 绿 / 9 skipped，再跑 5 文件 / 47 测试全绿。临时 probe 全清，closed-shape 调用恰好一处，无 sabotage marker。
