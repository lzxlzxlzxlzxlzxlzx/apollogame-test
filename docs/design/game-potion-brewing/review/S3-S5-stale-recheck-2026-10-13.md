# S5 换皮后 S3 骨架独立复查（2026-10-13）

- 复查人：`/root/s5_prior_review`，非 S3/S5 施工者；只复查 `gameHash=35b6fc9128549795` 的编译期骨架，不代 Owner 人门或 S4/S5/S6 验收。
- 判词：**PASS**。合法 S3 gate 由复查人独立重跑 `exit=0`，仍是同一游戏指纹。

## S3 checklist 对抗核证

1. **范围**：`requests.md:26-29` 的 S5 领工边界为 `games/game-potion-brewing/screen.ts`、UI 测试/审计与自证截图；`git diff --stat --` 的已跟踪游戏接入面只有 `src/launcher.tsx` 1 行与 `src/launcher/game-runner.tsx` 5 行变更，游戏目录整体未跟踪，不能据 Git 自行推断单轮 diff。逐读 `screen.ts:18-27,70-98` 及 `blueprint.ts`、挂载入口，S5 新色仅投影在 LayoutNode，未增引擎/system 或改变 S3 实体/组件。并行文件未回退/挪动。
2. **蓝图形态与样例边界**：本游戏为获准的编译期 `WorldBlueprint`，S3 gate 明示“编译期游戏免 manifest 校验”，没有把 TS 蓝图冒充纯 JSON manifest。历史施工记录 `review/S3-skeleton-2026-10-13.md` 点名只借 `game-lockpick/blueprint.ts` 的数据蓝图组织、`session.ts` 的装载测法、`game211/stage-shell.ts` 的固定 UI 宿主分层；独立 `rg 'lockpick|game211|stage-shell' games/game-potion-brewing` 0 命中，本游戏实际规则是 add/stir/椭圆棒/锅口而非继承样例玩法。
3. **plan 与消费**：`blueprint.ts:21-45,70-108` 只装配 `OrderedActionSession`、`AngularGesture`、椭圆 `DropZone`、`Draggable/Clickable/KeyBinding`、`Effect/Resource/SelfRule`，均在 `capability-plan.md:14-36` 有解释责任；`Shape/Color/Sprite/Transform` 为渲染与回退槽。`recipe.ts` 的步骤色由 `screen.ts` `liquidColor` 消费，`Sprite` 当前为明示 S6 待替换的 fallback 占位，不报正式素材已完成。未见新填而无人解释的玩法组件。
4. **真装载与新鲜度**：独立 `npx vitest run games/game-potion-brewing/blueprint.test.ts games/game-potion-brewing/screen.test.ts` **2 文件、8/8 PASS**；两份互斥配方各真 `Engine.load` 并空跑 2 tick，LayoutNode 校验零 issue。独立重跑 `node scripts/game-pipeline.mjs gate game-potion-brewing S3` **exit 0**、`gameHash=35b6fc9128549795`。`S3-render.json` 同 hash，真渲染方差 **6798.68**（阈值 15）、console error **0**、page error **0**、错误遮罩 false；已打开 `S3-render.png` 核可见锅、配方、材料架及 S5 皮。短时浏览器与局部探针在 `render-probe.mjs:157-160` 的 `finally` 关闭，不涉及整套 ZeroCraft。
5. **锚点撤修验红**：用不监听端口的 Vite SSR 仅在内存构建月露蓝图，先断言 `t2-ordered-action-session` capability **恰好 1**；正常 `Engine.load` + 2 tick 后会话 `active`，仅在内存副本移除该能力再运行同路径，会话为 `missing`，即 S3 装载断言会红。未编辑共享工作树。Vite SSR 首轮受沙箱 `realpath EPERM`，本地只读获准复跑退出 0；有效结果取复跑。

## 告警与边界

本次机器门的“5 控件、3 动作真经 Engine.step、4 次 DOM 变化”是 S3 输入打穿下限，不证明 S4 闭环或 S5 原型视觉完成。`S3-render.png` 的深背景仍受 launcher 页面托底影响，不宣称宿主透明 alpha 已验收；S6 正式美术索引和台账尚未建。新指纹上 S3 骨架 PASS 不等于全库 scoped-gate 绿。
