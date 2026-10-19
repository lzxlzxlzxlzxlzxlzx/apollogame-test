# GAL-ART-01A · V2 存读档四入口局部自证

范围：仅 V2 已装入 `systemFrame.slice=115` 与整图槽皮时，顶栏对应定稿的主页、剧情、回想 / CG、设置四入口。无图与旧九宫格仍保留原来的“设置 / 返回剧情”。这不构成完整 S5/S6 验收。

- 1440×900 同画布真渲：[V2 基准](../gal-ui-v2-save.png)；[读取亮主题](../review/gal-art-01a-four-nav-slots-load-light.png)、[读取暗主题](../review/gal-art-01a-four-nav-slots-load-dark.png)、[保存亮主题](../review/gal-art-01a-four-nav-slots-light.png)、[保存暗主题](../review/gal-art-01a-four-nav-slots-dark.png)。四键均位于外框上方，肉眼可见且真实点击入 `ActionSink`；34 态静态文件浏览器审计退出 0，浏览器已关闭。
- 行为：槽页“主页”沿剧情来源保留返回标题确认；“剧情”只在活动剧情可续时可点；“回想 / CG”保留来源页返回路径；“设置”复用原动作。宿主点名测试覆盖取消确认、关闭政策、画廊往返和无效页动作。
- 机器：`tsc --noEmit` 退出 0；GAL+PUI 单测 77 文件 608/608；亮主题既有按钮审计阻断 0。沙箱内 Vitest 读取 `node_modules/vitest/dist/spy.js` 三次 `EPERM`，同命令在获准的本地环境 608/608；未把沙箱失败伪报绿。
- S5 仍有 ghost 胶囊底/悬停、卡底文字与花饰贴近、设置页控件、确认/画廊、同内容预览与 S6 关键帧差异；本票局部自证不清零这些项。
