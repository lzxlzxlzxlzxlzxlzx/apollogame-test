# GAL-ART-01A · S5 同画布差异单（2026-10-12）

状态：**CONCERNS**。这是 1440×900 的定稿 V2 与静态 `file://` 真渲对照，不代替独立 GAL 消费复查、Owner 原型验收或 S6 演出验收。深/亮主题 34 态截图由 `src/services/gal-ui/verify-gal-art-live.mjs` 生成；本轮浏览器已关闭。原型是 authoring-time 基准，实际截图使用 GAL 审计夹具，因此已填槽的具体剧情内容不同不单列为皮肤缺陷。

| 对照 | 已缩小的差异 | 尚未对齐 / 去向 |
| --- | --- | --- |
| [V2 对话](gal-ui-v2-dialogue.png) ↔ [实渲亮主题](review/gal-art-01a-story-normal-light.png)；[V2 选项](gal-ui-v2-choices.png) ↔ [实渲亮主题](review/gal-art-01a-story-choice-light.png) | 对话外框按 x20/y555/1400×345；原图纵向 160% 居中裁切、正文/姓名/选项提示亮字；选项皮 180% 及外扩接近 V2。Owner S4=A 后，顶部 7 个工具栏 ghost 与回想退出键只在默认 V2 有图路由填受限 `labelColor:{custom:'#e8e8f4'}`，深亮新图已无糖果皮；独立复查 38 态真图、七键四态真实 ActionSink 28/28、回想退出/disabled/回滚与撤修验红均通过。 | V2 ghost 的深色半透明胶囊底/金线、悬停态仍未对齐。亮主题 save/load 文字下方真实纹理区域的采样对比度第 5 百分位约 3.42:1/3.08:1；这不是逐字形审计，但不能宣称全域 4.5:1。推进/底部辅助字及整体动画节奏仍待逐帧证据；不签完整 S5/S6。 |
| [V2 存读档](gal-ui-v2-save.png) ↔ [实渲读取·亮主题](review/gal-art-01a-slots-load-light.png) | 4×3 卡外框为 309×164，槽纹整图 100%×100%；编号与摘要仍是活 Label、预览仍是活 Panel/Image。预览位于卡内 x17/y18/275×100。2026-10-13 的 V2 有图路径将“保存/读取”页签扩为 124×46 纹样钮，顶部/翻页操作去糖果皮，底部绝对定位内容按系统框显示边宽回移 57px；无图与旧显式切片不变。GAL 79/79 测试、34 态静态真渲通过；[独立复查](review/GAL-ART-01A-slots-v2-independent.md)仅签局部 PASS。 | V2 的编号胶囊、空槽菱形占位未对齐；底部元数据靠近花饰、局部拥挤。顶部导航仍在框内，V2 在框上方；ghost 边线/悬停未逐项对齐。存档夹具与原型的已填预览内容不同，须在相同内容下再做素材 1:1 判定。 |
| [V2 设置](gal-ui-v2-settings.png) ↔ [实渲文字页·亮主题](review/gal-art-01a-settings-text-light.png) | 系统框采用源裁 115/显示边 58，外框 x18/y61/1404×824；V2 有图路径将框内直系锚点回移 57px，内容卡改深靛底。四个页签已改用现有纹样按钮皮与 132×46 点击区域；设置滑杆改为横排并在透明 Slider 下叠加细轨；无图和旧切片保持原路由。GAL 78/78 点名测试通过，34 态静态真渲已重新生成。 | 页签、滑轨仍需同内容逐像素核对；Toggle 的大小/颜色、行分隔线、右上说明与底栏尚未对齐。亮主题无图静态审计有标题对比度 3.57:1 警告，不可签 S5 视觉 1:1。 |
| [V2 确认](gal-ui-v2-confirm-settings.png) ↔ [实渲新游戏确认·亮主题](review/gal-art-01a-confirm-new-game-light.png) | `Modal.titleColor:{custom:'#f5dfad'}`、正文亮字及 115/36 框边已恢复可读；五类可执行确认各有深亮静态图。 | V2 与实渲确认框的形态、正文位置、按钮宽度仍待逐像素/点击态差异单；“退出游戏”仍为禁用宿主入口，不能假称第六类可执行。 |
| [V2 画廊](gal-ui-v2-memories.png) ↔ [实渲亮主题](review/gal-art-01a-gallery-memories-light.png) | 外框标题/页码/提示已按暗原图使用受限亮字，外框同用 115/58。 | 亮主题内容卡、导航按钮和素材内容还没有完整同内容逐像素/关键帧比对；不签 S5/S6。 |

已被单独放行的共享能力：`review/GAL-PUI-GAL-SKIN-BORDER-WIDTH-independent.md`（S1）、`review/GAL-PUI-S2-SKIN-LAYER-independent.md`（S2）、`review/GAL-PUI-LABEL-CUSTOM-COLOR-independent.md` 与 `review/GAL-PUI-S3-MODAL-TITLE-COLOR-independent.md`（S3）、`review/GAL-PUI-S4-BUTTON-LABEL-COLOR-lead-independent.md`（S4）。这些只证明通用接口合同，不会自动使上表视觉差异消失。GAL 消费独立复查见 `review/GAL-ART-01A-S2-S3-consumer.md` 和 `review/GAL-ART-01A-S4-consumer.md`；后者仅签 S4 闭集消费局部 PASS，S5 仍是 CONCERNS。

本地验证：本轮 GAL 单元测试 78/78；UI 组件 528/528；深亮静态截图 34 态，隔离浏览器已关闭；设置文字页静态审计在 1440×900 下零硬阻断。更早的 7 个工具栏键 ActionSink 和剧情流程探针证据仍保留，但不能代替本轮设置页独立复查。全库 TypeScript 曾有非 GAL 文件红项，须按本轮实际复跑结果判断；未执行 Git 远程写入、数据库写入或整套应用服务启动，也未把里程碑设为 done。
