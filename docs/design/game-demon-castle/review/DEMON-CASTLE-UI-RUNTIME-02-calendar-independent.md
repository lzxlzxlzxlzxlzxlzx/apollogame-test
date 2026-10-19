# DEMON-CASTLE-UI-RUNTIME-02 · 日历显示名合同独立复查

复查人：Codex/review_eng11（非施工者）  
日期：2026-10-16  
范围：Owner A“共享 Host 日历显示名合同”局部；**不代表正式 HUD 整单、布局、视觉或 Owner Playtest 通过**。

状态：**PASS（2026-10-16，第二轮返修后）**。首轮 PASS 曾被真实旧档兼容复现推翻，随后公共 adapter 单一权威边界已返修；以文末“第二轮返修复查”判词为唯一终态。

## 阅读闸与架构判词

已完整阅读本会话 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/design/data-driven-manifesto.md`、`docs/playbooks/index.md`、`game-production.md`、`game-requests.md`、`testing.md`、`review-gates.md`、裁决单 `work-orders/DEMON-CASTLE-UI-RUNTIME-02-calendar-decision.md`，以及本合同 authoring core、materializer/catalog 接缝、Host presenter/runtime、相关测试、递归探针和候选 Host JSON。

结论：接受 Owner A。显示名属于严格、可选、纯数据的 Host presentation 配置；稳定 season/slot ID 和 `LifeCalendar` 仍是唯一规则权威。该实现没有引入魔王城内容特判、第二份日历、World/save/hash 字段或 PUI/资产扩面。

## 独立核验

- 严格闭集：`hud.calendarLabels` 仅允许 `seasons` / `slots` 两张 plain-object map；拒绝 unknown field、原型对象、危险 ID、路径字符、控制/不可见/双向字符、markup、空值、非文本、超长文本和超量条目。parser 深拷贝纯数据，旧 descriptor 不插默认字段且字节行为兼容。
- 跨包引用：authoring、launcher discovery、materializer preflight 和 runtime mount 均把映射 key 对账实际 `calendar.seasons[].id` / `calendar.slots[]`；未知引用 fail-closed。无 calendar 时只认可 compiler 的 `spring` season 默认，slot 集为空，因此不会凭显示配置发明 `day`。
- 只读投影：`selectLifeHostView` 的第四个可选参数只影响 `date` / `slot` 文本；own-key lookup 防止 `constructor` / `__proto__` 继承命中。未配置保持原 legacy 日期格式；未知 live ID 使用确定性 humanize 回退；缺 `slotId` 始终为 `—`。
- 真实语义：独立临时 probe 用正式 `games/game-demon-castle/life.json` 与 `life-host.candidate.json`，先做 strict parse + cross-reference，再通过真实 Engine 的 `life.advance-day` 从第 1 天推进到第 2 天；显示从 `月相季·第1天 / 黎明` 更新为 `月相季·第2天 / 黎明`。对照 Engine 在投影前后及相同动作后 `snapshot + order` hash 完全一致，证明显示配置不进入模拟权威。probe **1/1 PASS** 后已删除，未留下临时文件。
- 候选与交接 hash 独立复算一致：core `89910ff8…c01c91b3`、calendar test `e5a67f2a…2bd2cd32`、materializer test `78e38083…459c248`、catalog core `83a9298d…3962ae8`、catalog test `e609c23a…3abae8`、core recursion `2bf08c81…503c15bf`、Host candidate `ac24a763…82a9d7f4`。

## 独立命令与结果

- `npx vitest run life-host-calendar-labels life-host-descriptor life-materializer life-launcher-catalog`：沙箱内 **3 files PASS、materializer 13 个 rename/symlink 用例因 Windows EPERM 失败**；按规则在沙箱外重跑同一命令，最终 **4 files / 148 tests PASS**。失败全部是沙箱文件系统限制，不是合同红灯。
- `npx vitest run life-calendar-presentation life-game-host life-host`：**3 files / 66 tests PASS**（5 + 30 + 31）。
- `node scripts/life-host-calendar-labels-recursion.mjs`：baseline 4 assertions；`plain-text` 与 `reference` 两个 exact anchor 均精确 exit 1；恢复后 4 assertions PASS，core hash 保持 `89910ff8…c01c91b3`。
- `node scripts/life-calendar-presentation-recursion.mjs`：presentation exact anchor=1，撤掉 authored season 映射后正确断言转红，恢复 4 assertions PASS、源字节未变。
- 相关 ESLint `--max-warnings 0`：exit 0。
- `npx vite build`：**823 modules transformed / exit 0**。
- `npx tsc --noEmit --pretty false`：exit 1；仅命中并行中的 `gal-character-library`、`gal-draft-review`、`AuthoringStudio`、`icon-only-button.test`，本日历合同文件零命中，故不伪报全库类型绿色。

## 独立 Host 接缝撤修验红

先断言以下两个生产锚点各恰 1 处、独立 marker 为 0：

1. presenter 的 `calendarLabels?.seasons && Object.hasOwn(...)`；
2. runtime trust boundary 的 `if (!calendarLabels.ok)`。

临时用 `apply_patch` 同时撤掉 season 显示映射与 mount 前引用拒收：点名回归精确得到 **2 failed / 33 skipped**——显示回退为 `Spring·第1天` 而非 `风铃季·第1天`；悬空引用不再抛错。后者继续执行 mount 时出现一次 `localhost:3000 EACCES`，这是故意撤掉前置拒收后触发的预期旁证，不是终态 warning。随后立即原样恢复，最终 Host 回归 **3 files / 66 tests PASS**，两个生产锚点仍各 1、marker 0。

## 告警裁决与判词

- 终态 Host 日志中的 `calendar_reference reject` 是点名负例的预期审计输出；`partial-art-load` 与 native keyboard decision 是既有受测分支。无未解释 calendar warning。
- build 仅有既有 `>500 kB` chunk-size 告警，与本合同无关。
- 未启动整套 ZeroCraft、未访问网络/远程数据库、未 push、未物化正式 Host、未改 World/PUI/资产/路线图/Owner gate。正式 `games/game-demon-castle/life-host.json` 是否更新及 HUD 1:1 仍由主程序后续受控物化与整单复查负责。

**首轮判词（已作废）：PASS。** 首轮仅证明 World/save payload hash 未被投影污染，漏验 descriptor fingerprint 的旧档兼容，不能继续作为通过结论。

## 重开复查：descriptor fingerprint 旧档兼容（2026-10-16）

主程序在 `createPersistentParsedLifeGameSession` 中新增 render-only strip：与既有 `uiSkin` 一样，从交给 `LifeHostSaveAdapter` 的 descriptor 中剥离 `hud.calendarLabels`。独立复跑 `life-game-host + life-save + life-host + life-calendar-presentation` 为 **4 files / 74 tests PASS**（31 + 7 + 31 + 5）。新增永久用例覆盖 Host composition 路径中 add/change/empty/remove 后 `restoreResult=restored`、`meta.label`、snapshot 与 persistent hash 不变。

独立 exact-anchor 撤修：先确认 `const { calendarLabels: _calendarLabels, ...saveHud } = session.descriptor.hud;` 恰 1 处、marker 0；临时恢复为传入完整 HUD 后，旧档点名用例精确 **1 failed / 30 skipped**，实际 `incompatible`；原样恢复后 **1 passed / 30 skipped**，marker 0。

但该修复只覆盖 Host composition 调用点，没有收紧公开 `LifeHostSaveAdapter` 的 descriptor fingerprint 语义。全库仍有 `life-save.test.ts`、`life-game-host.test.ts`、`life-construction.test.ts` 等直接 `new LifeHostSaveAdapter(fullDescriptor, ...)` 的合法用法；构造器类型仍接受完整 `LifeHostDescriptorV1`，注释也没有要求调用者自行剥离 render-only 字段。

独立临时 probe（运行后已删除）使用同一 `MemoryStoragePort` 和同一 slot：

1. 旧 descriptor 直接构造 adapter 并保存；
2. 仅新增 `hud.calendarLabels.seasons.spring='春季'`；
3. 用新 descriptor 直接构造 adapter 并恢复。

结果精确 **1 test failed**：期望 `restored`，实际 `incompatible`。因此“calendarLabels 是 render-only，增删改不破坏旧档”的合同在公共 save adapter 边界仍不成立；Host composition 绿灯不能替代公共构造器语义。

### 中间判词（Major 修复前，已关闭）

- Critical：0。
- Major：**1 未解决**——`LifeHostSaveAdapter` 直接调用仍把 `hud.calendarLabels` 纳入 descriptor fingerprint，合法 render-only 配置变化会使旧档不兼容。
- Minor：0。
- 当时判词：**FAIL**。缺口要求在 descriptor fingerprint 的单一权威边界处理 `calendarLabels`，并给直接构造器补 add/change/empty/remove 回归；不能要求每个调用者手工记住剥离。该 Major 已由下节第二轮返修关闭；没有顺便放宽 `uiSkin` 等旧字段。

终态检查：临时 probe 已删除，`CALENDAR-SAVE-INDEPENDENT-SABOTAGE` marker 为 0，Host strip 锚点恢复为 1；未改生产源码、正式 Host、候选、PUI、资产、路线图或 Owner gate。

## 第二轮返修复查：公共 adapter 单一权威修复（2026-10-16）

前述 FAIL 原因已按复现根因修复：`descriptorFingerprint()` 现在只从 `descriptor.hud` 排除本次新增的 `calendarLabels`，随后仍以原 descriptor 结构计算 hash。Host composition 已撤回 calendar 专用剥离，只保留既有 `uiSkin` 调用点策略；因此 direct adapter 与 Host 路径共享同一个 calendar save-compat 权威，不再要求调用者记住手工规范化。

边界核验：

- 未配置 `calendarLabels` 时，新表达式 hash 与历史 `{ type:'LifeHostDescriptor', ...descriptor }` 精确相同，既有档 fingerprint 不迁移。
- add / change / empty / remove 四种 calendar 映射变化均保持 direct adapter `list=1`、`restore=restored`、再次 save 后 `meta.label`、snapshot、persistent hash 不变；输入 descriptor 字节不被修改。
- 只排除新字段 `hud.calendarLabels`；`uiSkin` 等旧 descriptor 字段仍保留既有直接 adapter hash 语义，没有借本次返修放宽历史兼容边界。
- `life-save.test.ts` 的 cross-slot、schema、descriptor、package、hash、order、missing authority、active package mismatch 与 namespace/identity 构造门全部随完整套件通过；修复没有把坏档、跨包或跨 slot 误判为兼容。
- 独立复算冻结 hash 与交接一致：`life-game-host.ts` 为 `ee416cfe…637b283`，`life-save.ts` 为 `a4e0f953…313957`。

独立复跑：

- `life-game-host.test.ts + life-save.test.ts + life-host.test.ts + life-calendar-presentation.test.ts`：**4 files / 76 tests PASS**（31 + 9 + 31 + 5）；direct-adapter 用例分别覆盖 legacy `uiSkin` 有/无两种既有 fingerprint 语义。
- 相关 ESLint `--max-warnings 0`：exit 0。
- test-process-only sabotage config 先确认 production anchor `...descriptor, hud } as Component)` 恰 1 处，再仅在 Vite transform 内撤掉 `hud` 替换：精确 **3 failed / 37 skipped**。两条 direct-adapter（legacy `uiSkin` false/true）的 `list` 均从 1 变 0，Host 旧档恢复从 `restored` 变 `incompatible`；无共享源码写入。恢复正常 config 后完整 **4/76 全绿**。
- 读取终态 warning：calendar reference reject、partial art 与 native keyboard decision 仍是已有点名分支；sabotage 的两个红灯均命中预告锚点，无静默 WARN 或错误路径假红。

### 唯一终态判词

- Critical：0。
- Major：0 未解决；累计发现 1 个 Major（公共 direct-adapter fingerprint 漏洞），现已关闭。
- Minor：0。
- 最终：**PASS**。该 PASS 只覆盖 Owner A 日历显示名合同、Host/adapter 旧档兼容与严格边界；仍不代签正式 HUD 整单、视觉、正式物化或 Owner Playtest。

终态无临时 probe、无 production sabotage marker；未测试或修改 Owner 真实存档，仅使用 `MemoryStoragePort`。

