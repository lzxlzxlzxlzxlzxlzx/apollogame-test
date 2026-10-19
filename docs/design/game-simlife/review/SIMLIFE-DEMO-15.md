# Review 单 · `SIMLIFE-DEMO-15` 小山谷快照存档接线

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-DEMO-15` |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | **独立复查通过**（`review_eng11`；blocker / major / minor = 0 / 0 / 0） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | `games/game-simlife/{save.ts,save.test.ts,game-simlife.ts}`、capability plan、工单台账与 S4 对齐证据 |

## 一、实现边界

1. `LifeDemoSaveAdapter` 只消费 `SaveSystem` / `StoragePort`；稳定 slot 为 `little-valley-v1`，版本标签为 `little-valley:life-package-1:snapshot-v1`，未另造存档协议或 gameplay system。
2. 恢复先在隔离 `World` 内完成 list/version/hash/load 校验，成功后才一次性替换可玩世界；missing / incompatible / corrupt / rejected 均保留 fresh fallback，不暴露半恢复状态。
3. 存储快照保持原生 `WorldSnapshot` 形状，只做 JSON 可持久化归一化并排除 render-local `WorldUI2D`；`SaveSystem` 继续唯一负责 snapshot/order/hash 与宿主时间戳。
4. 恢复边界清空 `LifeContinuousMotion` held intent、`Velocity` 以及瞬时 `LifeMoveRequest` / `LifeWarpRequest`；菜单/controller 本就在 World 外，由 fresh host 重建。
5. `LifeDemoAutosave` 观察持久化投影签名并合并并发保存：农务、作物、资源、日历、旗标、里程碑、对话、资源值与场景切换会提交；Transform/Camera/Velocity/输入/UI 等逐帧变化不会写盘。
6. `mount()` 在启动 loop 与键盘输入前等待恢复；退出时 drain 已排队的保存。游戏 sim 路径没有 `Date.now` 或 `localStorage`。

## 二、复查请逐条核

| # | 核什么 | 独立验证建议 | 施工方自验 |
|---:|---|---|---|
| 1 | 真 SaveSystem 接线 | 检查 adapter 不直写 StoragePort payload，slot/version 固定 | 通过 |
| 2 | 完整恢复 | 用同一 MemoryStoragePort 经 fresh runtime 恢复 farm/dialogue flag/warp，并比较 snapshot order/hash | 通过 |
| 3 | 安全失败 | missing、版本错、坏 JSON/hash、save reject 均不抛且保持 fresh world | 通过 |
| 4 | 低频自动存档 | 连续移动 tick 写入 0 次；一次翻土离散提交合并为 1 次 | 通过 |
| 5 | 宿主时间 | 固定 `Date.now=12345` 只验证 SaveSystem 元数据；游戏代码零墙钟调用 | 通过 |
| 6 | 恢复输入安全 | held direction=false、速度=0、瞬时请求删除，下一 tick 不误走 | 通过 |
| 7 | UI 非权威 | 注入 `WorldUI2D` 后存档 payload 不含该组件，恢复后由表现层重建 | 通过 |
| 8 | 反向证明 | 临时撤掉 `snapshotOrder` 恢复，实体 `10` / `2` 锚点应准确转红 | 准确 1 红，恢复后全绿 |

## 三、门禁与证据

- game-simlife + Life assembly + storage：**8 文件 / 65 测试全绿**；其中 DEMO-15 点名 **5/5**。
- ESLint（`save.ts` / `save.test.ts` / `game-simlife.ts`）PASS；component manifest `194/194` PASS；game-skill-audit / RATCHET PASS；docs-ref guard PASS。
- 当前 Little Valley 能力子图：112 个注册系统、187 条显式边、23 个共装系统；无 duplicate、dangling 或 cycle，PASS。
- `rg "Date\\.now|localStorage" games/game-simlife` 无命中；时间只由既有 `SaveSystem` 在宿主服务边界写入。
- 全量 `tsc --noEmit` / `npm run build` 仍仅被既有 `game-dice` Label size、`game-theft` Label font 与 launcher mount 签名阻断，输出没有本单文件。
- `align-count --game game-simlife --stage S4`：✅ 17 / ⚠ 0 / ❌ 0，退出码 0。

## 四、撤修验红

- 锚点：`save.test.ts` 的完整农事→对话旗标→warp→fresh runtime 恢复用例，并额外插入实体 id `10`、`2` 防止字典序与插入序偶然一致。
- 撤修：临时把 `world.restore(restored.snapshot(), restored.snapshotOrder())` 改为不传 order。
- 结果：点名集合准确 **1 红 / 4 skipped**，收到顺序以 `2,10,...` 开头而非保存时顺序；精确恢复后 **5/5 全绿**，最终回归 **8 文件 / 65 测试全绿**。

## 五、真渲染自证

- 以当前代码构建临时单文件产物，在隔离的短生命周期无头 Edge 中访问本地 `file://`，未启动任何前后端服务；验收结束后浏览器和临时构建均已关闭/删除。
- `self-check/shots/demo15/` 的 5 张截图覆盖开局、翻土提示、翻土提交、离开交互范围、刷新恢复；刷新后位置、已翻土地块与“浇水（E）”上下文连续一致，页面错误为 0。
- `self-check/S4-alignment.md` 已完成玩家八问、好玩三问和迭代记录；本开放式 demo 无独立终局/重启屏，刷新承担本工单所需的生命周期退出/重入闭环。

## 六、边界与已知项

- 没有改 storage 服务/协议、capability、system、`src/ui/**` 或美术；没有新增自定义存档格式。
- 没有修改数据库、启动/重启服务或执行 Git / GitHub 操作。
- 独立复查复跑本单点名集合 **8 文件 / 65 测试**，其中 `save.test.ts` **5/5**；另点名验证无 IndexedDB、无 localStorage 的 node 环境会回落 `MemoryStoragePort`，**1 passed / 14 skipped**。
- 独立复查确认 ESLint、component manifest `194/194`、game-skill-audit / RATCHET、docs-ref guard、S4 align-count 与真实 compile 的 23-system 子图全部 PASS；5 张截图逐张目视与对齐单一致。
- 独立撤修同样临时移除 `snapshotOrder` 参数，首个 round-trip 锚点准确 **1 红 / 4 skipped**（实体顺序收到 `2,10,...`）；精确恢复后重新跑满 **8 文件 / 65 测试全绿**。
- 最终结论：**PASS，建议策划验收**；blocker / major / minor = **0 / 0 / 0**。复查临时 graph probe、sabotage 与其他临时改动均已清除。
