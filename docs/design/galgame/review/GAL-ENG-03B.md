# GAL-ENG-03B 施工自验 / 独立复查导航

> 2026-10-10，施工者 Codex/root；非施工者 `Codex/review_gal_03b` 已独立复查，局部能力 PASS、全库类型门 CONCERNS。未执行 Git/GitHub、数据库修改或应用服务启动。

## 需求判断与边界

- 接受最小组合方案：`SaveSystem` 已有快照、实体序与 `hashWithOrder`，`StoragePort` 已有具名槽；`NarrativeHistory` 在 World 中、`GalProfile` 在独立 `SavePort`。因此只新增宿主侧 `GalManualSaveController`，不扩共享存储协议、不再造快照格式。
- 实查 `SaveSystem.load` 会直接恢复传入 World，因此 `gal-manual-save.ts` 仅把它指向隔离候选 World；包身份、StoryRef、投影、历史游标、实体序通过后才恢复活动 World。失败路径不写活动 World，故不在失败时写其 `DebugTrace`；异常原样交给宿主呈现。
- 保存时以活动世界的快照和创建序复制到 `SaveCopy`，沿用活动 tick 供 `SaveMeta`；候选世界先验证再清空所有 `InputQueue.actions`，由 `SaveSystem.save` 存储。加载后再次清空输入，并清除活动 World 旧事件总线。不会把 `GalProfile`、快存/自动存、预览或 UI 写入本槽。
- 手动槽为 `zerocraft.gal-manual.v1.<encoded packageId>.<positive-safe-integer>`，1/12/13 都有效；`list` 只返回本包且按槽号升序；`delete` 只指向精确手动槽。缺槽明确返回 `{status:'empty'}`。
- 已含历史时使用 02B 的 `importNarrativeHistory` 对当前游标/投影/资源种子/entered 账本做一致性校验；旧档无历史时加载点保留、下次 Director tick 新开窗口。静态 `NarrativePackage` 内容必须与当前发布包相同，不能由档覆盖新版本。
- 只修改 `src/services/gal-save/**`、`src/skills/tier3/narrative-director.ts` 的只读投影推导导出、`docs/playbooks/save-platform.md` 路标、本单和本 Review 单。没有新 ECS component/capability，不虚构注册表条目。未碰 `SaveSystem`、`StoragePort`、PUI、游戏目录、资产或真实持久化后端。

## 施工者自验实数

- `npx vitest run src/services/gal-save/gal-manual-save.test.ts src/services/storage/save-system.test.ts src/skills/tier3/narrative-director.test.ts src/services/gal-profile/gal-profile.test.ts src/assembly/registry-guard.test.ts`：初轮 **49/49，退出 0**；复查反馈后最终定向复跑以非施工者输出为准。施工者对最后 03B 文件单独复跑 **10/10，退出 0**（其中 512 步往返约 1.1s）。03B 十个用例点名 1/12/13 槽、跨包同号、删除隔离、空槽、保存后世界继续改变、资源/种子/历史/实体序恢复、输入与旧事件不重放、真实独立 GalProfile 保留、旧档缺历史新开窗、跨 choice 回退改选双跑同 hash、坏 hash/包/ref/历史/版本/实体序/元数据槽与端口失败 fail-closed、活动 World 误含 Profile 不丢失、重算 hash 的旧档伪投影拒绝、历史旧条投影与回看文本篡改拒绝，以及 512 窗口不复制静态包。
- `node scripts/component-manifest-guard.mjs`：PASS，205/205；`node scripts/build-component-map.mjs --check`：PASS，227；`npx vite-node scripts/gen-capability-registry.mjs --check`：同步，139；`npx vite-node scripts/system-graph-audit.mjs t3-narrative-director`：PASS，子集 1 system、无环。Vite 工具初次受沙箱 `realpath EPERM`，仅定向短生命周期检查在批准的非沙箱模式复跑；未启动服务。
- `npx tsc --noEmit --pretty false`：退出 1，最终诊断仅在既有非 GAL `games/game-dice/dice-window.test.ts`、`games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`；本单文件零诊断。全库门禁未绿，不称完整产品交付。

## 首轮独立复查反馈与施工修复

- 非施工者以隔离副本实证发现 P1：旧档移除 `NarrativeHistory`、篡改 `NarrativeProjection.text` 并重算 hash 后，原实现只验 ref/kind，会把伪文案恢复到活动 World。隔离探针预期拒绝，实际得到 `loaded`，不是推测。
- 修复复用 Director 原有 `buildProjection`，只新增只读 `deriveNarrativeProjection` 导出；控制器用相同语义重建当前投影并逐字段 canonical 对拍，缺历史也不能绕过。新增点名回归，最终由非施工者独立复跑确认。
- 第二轮独立复查又实证发现历史非当前条目的 `entry.projection.text` / `entry.text` 可在回退或回看时伪造。控制器现于隔离 replay World 逐条注入历史态与当步值，复用同一 Director 投影推导，对每条投影、回看文本、说话人逐字节对拍；施工者复跑 03B 10/10，且 512 步往返实测通过；最终由非施工者独立复跑及撤修验红确认。

## 非施工者复查清单

1. 独立复跑上述定向测试、组件/注册表/同装系统图与类型检查，读 stderr/告警。核对共享存储契约、UI、游戏与真实持久化后端未改。
2. 隔离副本带锚点撤修验红：建议单独移除 `gal-manual-save.ts` 的 `if (!storedPackage?.package || !samePackage(...))` 包守卫，预告 `rejects corrupt hash, wrong package...` 的跨包 case 必须转红；或移除 `clearPendingInput(candidate)`，预告 `restores history...` 的待处理输入断言转红。锚点命中数应为 1，副本清理后确认共享源码未变。
3. 实证对抗：合法 hash 但坏包/坏历史/错 StoryRef/不完整 order 均不得改变活动 World 快照和创建序；另一包同号槽及独立 Profile 不受删除/读档影响。检查旧档无历史时从当前位置新开窗，不回到包 entry。
4. 特别核对 `SaveSystem.load` 在隔离 World 而非活动 World，保存与加载均没有沿用待处理输入；复核无 history 的快照若存在坏投影是否被现有守卫拒绝。若发现表达缺口，提供源码证据和 A/B 给 owner，不直接扩共享存储协议。

**交接门：** 非施工者已按独立复跑、带锚点撤修验红、实证复现、读告警四步签判；局部能力 PASS，全库类型门 CONCERNS。

## 非施工者独立复查（2026-10-10）

**判词：PASS（GAL-ENG-03B 局部能力）；CONCERNS（全库类型门未绿）。** 复查者 `Codex/review_gal_03b`，非施工者。按 `docs/design/galgame/requests.md` 中 03B 票面，对照 `src/services/gal-save/gal-manual-save.ts` 当时第 64–155 行：`SaveSystem.load` 仅作用于隔离 World，包/ref/投影/历史/实体序预检后才恢复活动 World；保存和加载均清待处理输入，`GalProfile` 不进槽。未执行 Git/GitHub、数据库写入或应用服务启动；受最高禁令约束，未用 Git diff 作范围证明。

- **独立复跑**：最终基线 5 个文件 `gal-manual-save`、`save-system`、`narrative-director`、`gal-profile`、`registry-guard`：**53/53，退出 0**。组件清单 **205/205 PASS**，组件宇宙 **227 PASS**，注册表 **139 同步**，`t3-narrative-director` 同装图 **1 system、无环 PASS**；上述工具输出无守卫 WARN/定序环告警。Vite/Vitest 默认沙箱 `realpath EPERM`、零用例；仅这些短生命周期检查获准非沙箱重跑，退出码与 stderr 均核对。
- **实证复现与修复**：首轮隔离探针删除旧档 `NarrativeHistory`、改 `NarrativeProjection.text` 并重算 hash，原实现错误返回 `loaded`（预期拒绝测试 **1/1 红**）；次轮改非当前 `history.entries[0].projection.text` 并重算 hash，读档返回 `loaded`、随后 `narrative.back` 确实显示伪文案（探针 **1/1 绿，证明原缺陷**）。最终基线使用 Director 同源只读投影推导，并对历史每条投影/回看文本/说话人对拍；对应新点名用例随最终 **53/53** 通过。
- **带锚点隔离撤修验红**：先在独立副本移除保存前 `clearPendingInput(candidate)`，实测锚点原件 **2** 处、副本 **1** 处，`restores history, values, order and no pending input` **1/1 红**，实际槽内残留 `narrative.choose`。最终基线另在独立副本移除 `if (history) this.validateHistoryProjections(...)`，锚点原件 **1** 处、副本 **0** 处，非当前历史伪文案点名用例 **1/1 红**，错误返回 `loaded`。两份隔离副本均已删除，共享源码未留破坏态。
- **类型门告警**：`npx tsc --noEmit --pretty false` **退出 1**，诊断仅在 `games/game-dice/dice-window.test.ts`、`games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`；无 GAL 文件诊断。故只签本单局部复查 PASS，**不宣称全库门禁绿、游戏完成或可推送**。
