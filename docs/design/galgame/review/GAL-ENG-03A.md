# GAL-ENG-03A 施工自验 / 独立复查导航

> 2026-10-10，施工者 Codex/root。**状态：待非施工者独立复查**；本单不是独立 PASS。未执行 Git/GitHub、数据库写入或应用服务启动。

## 需求判断与接线

- 接受 03A 的独立 GAL 跨槽档案：实查 `src/services/save/save-port.ts`、`envelope.ts`、`MemorySavePort`、`src/services/storage/save-system.ts`、`src/services/persist/local-store.ts` 和 `src/services/profile/profile-port.ts`。`SavePort` + `sealEnvelope/openEnvelope` 已提供后端、checksum、schema 与迁移链；`SaveSystem` 管每槽 WorldSnapshot，`localStore` 只管小 KV，启动器 `PlayerProfile` 是姓名/头像只读角色卡，均不应被当成 GAL 档案。本单只做已有 SavePort 的 GAL 专用适配，没有新存储后端或 World 组件。
- 新增 `src/services/gal-profile/gal-profile.ts` / `index.ts` / 测试；`GalProfile` V1 以 `packageId` 为跨存档归属，每个 package 独立 SavePort slot 与 codec gameId，内容数组用稳定 StoryRef/目录 ID。`markRead`、`unlock` 是显式纯更新；投影、加载、回滚不会调用它们。`parseGalProfile` 形状与目录引用 fail-closed，数组排序去重；偏好有限数字校验并按 V1 范围钳位。`saveGalProfile` 要求宿主注入 `savedAt`，端口异常原样传播。
- 只回填 `docs/playbooks/save-platform.md` 路标。没有新增 ECS 组件或 capability，故不虚构注册表条目；没有修改 `src/services/profile/**`、`SaveSystem`、PUI、游戏、资产或 Director。

## 点名自验

- `npx vitest run src/services/gal-profile/gal-profile.test.ts src/services/save/envelope.test.ts src/services/save/save-port.test.ts src/services/storage/save-system.test.ts src/skills/tier3/narrative-director.test.ts src/assembly/gal-package.test.ts src/assembly/component-map.test.ts src/assembly/capability-registry.gen.test.ts`：首轮 **91/91，退出 0**。覆盖新档、端口往返、同名内容跨包隔离、纯幂等更新、四类解锁目录、偏好归一化、坏 checksum/未来 schema/坏形状/断裂迁移、端口写失败、回滚后外部解锁仍在与不自动标已读；复跑结果以最新输出为准。
- `node scripts/build-component-map.mjs --check`：PASS，227 组件；`npx vite-node scripts/gen-capability-registry.mjs --check`：同步，139 条。新服务不在 ECS/registry 内，检查是防意外漂移。
- `npx tsc --noEmit --pretty false`：退出 1，最后输出仅指向非 GAL 的 `games/game-dice/dice-window.test.ts`、`games/game-dice/dice-window.ts`、`src/launcher/game-runner.tsx`；无 `gal-profile` 诊断。共享工作树中的非 GAL 诊断在本轮有变化，按最后一次真实输出为准；不宣称全库门禁绿或完整产品交付。
- V1 是首个 GAL Profile，无真实 V0 可迁移；`galProfileCodec` 不编造启动器角色卡→GAL 迁移。测试点名 schema 0 缺迁移失败、未来版失败，另以注入的未来 codec 验证现有信封迁移链确可执行。真实 V2 发生时须基于当时发布的 V1 数据定义迁移，不在 03A 虚构。

## 非施工者复查要求

1. 独立复跑上述定向测试、组件与注册表守卫、全库类型检查并读告警；复核服务没有绕过 SavePort 写 localStorage、没有碰启动器角色卡键或 WorldSnapshot。
2. 隔离副本带锚点撤修验红：例如撤 `validUnlockId` 的目录校验或 `profile.packageId !== pkg.id`，确认 `unknown ID` / 串包点名测试真的转红，清理副本。
3. 实证核查同一 ID 的 package A/B 端口槽、codec gameId、档案字段互不串；坏 checksum/写失败绝不回默认成功；旧版缺迁移不伪造数据。
4. 复核“已读仅显式标记”的边界、偏好钳位与坏形状 fail-closed；若认为首个 V1 必须包含真实旧版迁移，应先指出实际旧 GAL 格式来源，不能把无关的 `apollo.playerProfile` 强接进来。

**交接门：** 本单待非施工者按四步签判；此前只能称“局部施工自验完成”。

## 非施工者独立复查（2026-10-10，GAL 策划）

**判词：GAL-ENG-03A 范围内 PASS；全库门禁 CONCERNS。** 独立复跑定向 91/91，组件全集 `--check`（227）及能力注册表 `--check`（139）均退出 0。独立运行 `tsc --noEmit --pretty false` 退出 1，诊断位于 `game-dice/dice-window.test.ts`、`game-dice/dice-window.ts`、`game-theft/ui.ts`、`launcher/game-runner.tsx`；无 `gal-profile` 诊断。共享工作树中的非 GAL 错误集合已有变化，以上只代表本次实际输出，不称整体门禁绿。

- 逐项核对 `gal-profile.ts`、`SavePort`/信封与启动器 `profile-port.ts`：GAL 档案使用独立 `zerocraft.gal-profile.<encoded packageId>` 槽及 package 专属 codec gameId；没有复用 `apollo.playerProfile` 键、启动器姓名/头像合同、WorldSnapshot 或 NarrativeHistory。`markRead`/`unlock` 均为显式纯更新，不在节点初显、读档或回滚时自动调用；存储写失败向调用者传播。
- 带锚点隔离撤修验红：断言 `case 'cg': return Object.hasOwn(pkg.media.cg, id);` 与测试导入锚点各唯一命中；复制 source/test 副本，只在副本把 CG 目录校验改为恒 `true`。点名 `creates a clean separate profile` 退出 1，红在 `unlock(...,'cg','unknown')` 应抛而未抛。真实源码未改，两份临时副本已删除。
- 独立对抗复现：以同名 `shared` CG 构造 package A/B，保存 A 后 B 仍为空；把 A 的有效信封复制进 B 的端口槽，B 载入明确拒绝 `CorruptSaveError`，A 原档不受影响。独立探针 1/1 通过，临时文件已删除。
- 坏 checksum、未来 schema、缺迁移链、坏形状和写失败在定向套件中均点名；V1 无真实旧 GAL 格式可迁移，不允许拿启动器角色卡伪造 V0。偏好钳位、目录 ID 校验、幂等排序去重及回滚后局外解锁保留均有测试。正式剧情事件桥、GAL 存档槽控制器、PUI 页面不属本单，不据此宣称可玩产品完成。

未执行 Git/GitHub、数据库修改或应用服务启动。
