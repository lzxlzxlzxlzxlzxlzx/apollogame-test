# GAL-ART-01A · S4 GAL ghost 消费独立复查（2026-10-11）

**判词：S4 GAL 闭集消费局部 PASS；S5 视觉与对比度仍 CONCERNS。本单不签完整 S5/S6。** 本人不是本轮施工者，只复查最终 `src/services/gal-ui/gal-ui-art.ts` 的 V2 默认按钮分流及伴随测试。Owner 对 S4 选择 A，PUI `Button.labelColor` 通用合同已有另一个独立局部 PASS（`GAL-PUI-S4-BUTTON-LABEL-COLOR-lead-independent.md`）；本单不代签 PUI。

## 边界与四步证据

- 已完整阅读本会话所需 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/{index,game-production,ui,assets,art-pipeline,testing,self-check,review-gates,visual-scorecard}.md`、`docs/design/ui-playbook.md`，以及 `module-ui`、`module-art`、`module-assets`、`check-ui`、`align-check` 技能；本轮又对照 V2 `.ghost` 与 S4 工单/PUI 独立单。判断为**接受**当前 GAL 数据层局部消费：现有 `Button.labelColor` 和 `skin:''` 已能表达此窄修，不需游戏层自由 DOM/CSS 或扩新接口；S5 视觉差异另列，不能倒签为 S4 全完成。
- 独立复跑 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-slots-structure.test.ts src/services/gal-ui/gal-ui-story-03e.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-ui-read-model.test.ts src/ui/components/skin-layer-and-modal-title.test.ts src/ui/components/label-custom-color.test.ts src/ui/components/panel-skin.test.ts src/ui/components/button-shape.test.ts src/ui/components/modal-semantics.test.ts src/ui/components/catalog-validate.test.ts`：**11/11 文件、101/101 测试，exit 0，无测试告警**。其中宿主 25/25 点名覆盖点击、选择、回滚、replay 与槽位路径。
- **唯一锚点内存撤修验红**：精确断言 `gal-ui-art.ts` 的 `skin:'', labelColor:{custom:'#e8e8f4'}` 赋值锚点只命中一次；只在 esbuild 内存副本撤掉 `labelColor`，七个 story ghost 和 `gal-replay-exit` 共 **8/8** 由绿转红。相同输入下显式旧 `slice` 与无 art 两路各 8 个节点，共 **16/16** 保持一致，disabled 属性未丢；未改生产文件。
- **真实静态验收**：在任务级临时目录以只读 `file://` 包加载真实索引 UI/内容素材，隔离短生命周期浏览器于 **1440×900** 复拍标准 17 态×深亮 **34 张**，另加 replay/disabled 两态×深亮 **4 张**，合计 **38 态**。临时内存变换只增加这两态与 `validateLayoutNode` 零 issue 闸；未改仓内脚本或生产文件。38 态 ready 且验证树零 issue；正常 36 态 5/5 皮图加载、`console/pageerror` 零；故意坏槽图的 2 态 4/5，只有预期的 `net::ERR_FILE_NOT_FOUND`，无脚本异常。浏览器全部主动关闭，未启动前后端服务。

## V2 消费、命中与冲突

| 核点 | 独立观察 | 判定 |
|---|---|---|
| 默认 V2 `art.button` 无显式 slice | 七个 `gal-story-{history,auto,skip,save,load,settings,home}` 与 `gal-replay-exit` 在深亮均为 computed `rgb(232,232,244)`、无 `data-apollo-skin`，中心 `elementFromPoint` 命中自身；七个 story ghost 在普通/选项剧情两态×深亮逐个真实点击，**28/28** 发出对应 ActionSink。replay-exit 深亮点击各发 `gal.replay.exit`。 | S4 路由/可操作性局部 PASS。 |
| 禁用与冲突 | 深亮 disabled 态的 auto/skip 为原生 `disabled=true`，点击 auto 不产生 ActionSink。亮主题 choice 依次点击对话框、第一选项、滚轮上/下，ActionSink 为 `narrative.choose → narrative.back → narrative.advance`；普通剧情为 `narrative.advance → narrative.back → narrative.advance`。七个 ghost 按钮两主题矩形互不重叠（0 对）。 | disabled、点击/回滚/推进互不串路，局部 PASS；静态夹具不等于完整持久化自玩。 |
| 旧路由/退化 | 精确内存对照和点名测试均确认显式旧 `slice` 不注入 S4 labelColor/空皮、无 art 原样回退；`gal-ui-slice-host.test.ts` 回归 25/25。 | PASS；未把默认 V2 例外扩散到旧资产或无图树。 |

已审阅 `src/services/gal-ui/verify-gal-art-live.mjs`：其标准 34 态逻辑点名七个 ghost 的 ActionSink 与中心命中，但运行会把截图写进共享 Review 目录，超出本独立复查单的文件所有权。因此没有直接执行该脚本；上述 38 态在隔离临时目录独立等价验收，并额外覆盖 replay/disabled。不能将“审阅脚本”冒称“运行脚本”。

## S5 告警与验收局限

- 与定稿 V2 `.ghost` 相比，现实现仅消除亮主题暗字及误继承绿糖果皮；**尚无 V2 的深色半透明胶囊底**。深亮截图可见浅字，但不能以 S4 局部 PASS 签视觉 1:1。
- 真实夜景底纹的对比度并非全域 4.5:1：独立采样时临时隐藏 ghost 控件、截其下层原图，在按钮文字内矩形每 2px 取底色，再将 `#e8e8f4` 按相对亮度公式比较。亮主题 `save`/`load` 区域的对比度第 5 百分位分别约 **3.42:1 / 3.08:1**，最低点约 **1.78:1 / 2.17:1**；其他位置多较高。该方法测的是文字可能覆盖的纹理场，不是逐字形像素、悬停/动画全帧或正式无障碍审计；因此既不能断言实际每个字失败，也**不能声称整个按钮区域达到 4.5:1**。V2 深底胶囊可作为后续 S5 裁决的对照，勿在本票越界改 PUI 或原型。
- 设置页顶部导航/卡片、确认标题几何、槽卡纹样细节仍有先前 S5 差异；本次 S4 审核未重签这些项。`validateLayoutNode` 零 issue 和 0 重叠不等于视觉/对比度全绿。故意坏图产生的两条 `ERR_FILE_NOT_FOUND` 为回退探针的预期告警，未静默忽略。

全过程未运行 Git/GitHub 命令、未改数据库或业务持久化、未启动应用服务；静态浏览器已关闭，隔离截图/构建临时目录经绝对路径校验后已删除。除本 Review 单外未修改共享仓文件；`node scripts/docs-ref-guard.mjs docs/design/galgame/review` 已独立 exit 0（DOCS-REF: PASS）。
