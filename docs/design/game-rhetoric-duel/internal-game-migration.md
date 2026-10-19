# 《言弹交锋》内部游戏迁移裁决

- 裁决人：owner
- 日期：2026-09-23
- 状态：生效

## 唯一实现位置

`games/game-rhetoric-duel/` 是《言弹交锋》唯一的玩法实现。它必须像 `game-dice`、`game-103` 等内置游戏一样，经 `src/launcher.tsx` 的数据式游戏表和内部加载入口启动，并能走引擎自身的独立构建/导出路径。

先前的 `dokiworlds-apps-rhetoric/apps/game-rhetoric-duel` 仅为外部 App 原型：保留供迁移比对，**不得删除、不得继续作为主线实现、不得反向成为规则真相**。

## 接口边界调整

- 本阶段不再以 App SDK 的 `createAppClient()` 或 `doki.game.result/1` 作为内部对局的运行时依赖。
- 未来若需接入 DokiWorlds，由导出的内置游戏产物外包一层薄适配；适配层只能映射输入/终局结果，不能拥有对局规则。
- `integration-contract-v1.md` 留作未来导出适配的边界合同，不再规定内部游戏目录、启动或对局实现。

## 不变项

- `CAPGAP-RHETORIC-001`、命名资源、固定意图脚本、卡牌目录和确定性要求仍有效。
- UI 继续只用 LayoutNode；规则仍只能由共享 capability 消费。
- 宿主 URL、图像和视觉状态不进入模拟或 hash。
