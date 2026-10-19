# GAL-UI-03D 独立复查：局部 PASS

复查主体：非施工者 `/root/review_gal_03d`，2026-10-11。只签 Owner 定稿 V2 存读档页 1440×900 的四态 4×3 网格 S4 几何和本票回归；不签完整 V2、S5/S6、真实截图/持久化适配、路线图人门或全库门禁。施工范围以 `requests.md` 的 03D 单为准；Owner 禁止一切 Git/GitHub 操作，故不能用 Git 核对工作树改动边界，也不冒称已提交或推送。

## 独立复跑与真图核证

- `npx vitest run src/services/gal-ui src/services/gal-save`：7 文件 69/69 通过；其中 `gal-ui-slots-structure.test.ts` 点名三行四列、列距 12 / 行距 8、卡数据高 142、底栏固定高 51 及四态 `validateLayoutNode` 零 issue。`gal-save-preview.test.ts` 的 11 项仍覆盖图源坏/缺失/跨包/旧版本/侧车失败不改变权威档可读性（见其 `:72-280`），并非仅凭视觉图宣称安全。
- `npx vitest run src/ui/components`：65 文件 506/506 通过，闭集组件回归未红。`node scripts/docs-ref-guard.mjs docs/design/galgame`：37 份 Markdown、345 路径，`DOCS-REF: PASS`。
- 独立执行 `node src/services/gal-ui/verify-gal-03d-live.mjs --transient-shots` 退出 0。短生命周期 Playwright/Edge 仅访问任务级静态 `file:` 构建和 `gal-ui-complete-v2.dc.html`，浏览器关闭、临时构建清理；未启动服务。原型和正式页的网格均 `[84,238,1272,508]`，12 卡逐张均为 `309×164`：行起点 y=238/410/582，列起点 x=84/405/726/1047；底栏均 `[84,782,1272,51]`，所有四轴差值 0px。脚本另检查 12 张卡内的预览/文字/状态不越界，红色 1×1 测试色块确实解码加载。
- 亲眼核对 `review/gal-ui-03d-prototype-slots.png`、`review/gal-ui-03d-actual-four-states.png` 与有效/损坏预览局部图：空槽、有档无图、有效占位图、坏图降级处于同尺寸卡；坏图文案为“预览损坏 · 可读取”，没有假称档坏。原型没有坏图业务态，只以原型共用槽几何为该态尺寸目标；红色图为**测试色块而非剧情截图**，正式皮肤明显未等同原型，视觉差异保留给 S5/S6。
- 静态真浏览器操作链从剧情进入存档，第 2 页仅显示 13–24 槽，返回第 1 页选 2 号槽，经保存确认后读取确认，故事位置恢复到保存前；脚本所用 `gal-ui-live-wheel.audit.ts:9,51` 明确是内存存储端口，不是业务持久化后端。此链没有把 06B 非权威预览误当作存档权威。

## 深/亮审计与告警

- `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-slots-03d.audit.ts --w 1440 --h 900` 与亮色 `gal-ui-slots-03d-light.audit.ts` 各退出 0：重叠 0、硬性低对比 0、border-image 前提阻断 0。亮色曾有的 22 处硬低对比未复现，当前仅 `gal-slots-title` 36px 大字 ratio 3.57:1 的非阻断提示；它达到大字 3:1 下限，但低于通用 4.5:1 提示，保留记录。深色华丽度仅 glass 1 且非 house 主题，是后续 S5/S6 素皮债，不拿零阻断代替观感评审。
- `npx tsc --noEmit --pretty false` 独立退出 1，诊断落在 `games/game-card-reveal/s4-flow.test.ts`、`games/game-dice/dice-window.*`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，无 03D 或 GAL 文件；因此**全库门禁未绿**。含 Git 的 `scoped-gate.mjs` 受 Owner 最高禁令未执行。

## 带锚点隔离撤修验红

在一次性 Vite 内存 `transform` 中，仅匹配 `src/services/gal-ui/gal-ui-structure.ts` 的 `slotCard` 唯一锚点 `layout: { height: 142, flex: 1, direction: 'column', gap: 6, padding: 10 }`，断言命中数 **1** 后临时改回 `height: 154`。隔离静态浏览器立即量得首卡 **176px**（目标 164px）、网格 **544px**（目标 508px），按原型几何断言明确转红；锚点零命中/多命中或仍为 164px 会使探针失败。未改共享源文件，探针浏览器和临时目录均已关闭、清理。这个结果证明卡高收敛不是没有测到的假绿。

## 判词与边界

`GAL-UI-03D` 的四态 4×3 网格、卡高、行列间距、固定底栏及保留的分页/槽 2 存读档，本票局部 S4 **PASS**。数据依旧用 `LayoutNode` 的 `Panel/Image/Label` 闭集组合（`gal-ui-structure.ts:232-297`），未发现以自由 DOM/CSS 代替游戏 UI。正式截图采集、视觉皮/素材、全库红项及 owner 人门均不在此判词内；本复查只写本 Review 单，未执行 Git/GitHub、真实数据库/持久化数据写入或应用服务启动。
