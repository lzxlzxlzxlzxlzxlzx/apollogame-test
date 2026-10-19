# GAL-ART-01A · 设置预览与空槽底栏局部自证（2026-10-14）

结论：**施工侧局部通过，待非施工者复查**。不签完整设置、槽卡素材、S5/S6 或 Owner 人门。

## 范围与取舍

- `gal-ui-settings.ts` 原先把 V2 原型的角色“星见 澪”和演示台词写进所有作品的设置预览。现在优先取当前作品的只读剧情投影；无活动续玩点或无文本时使用中性系统预览，避免新作品显示原型角色或未开始就泄漏首句。投影压平换行，并限 40 个 Unicode 码点、角色名 12 个码点，适配固定预览行；不改剧情数据、StoryRef 或逐字完成状态。
- `gal-ui-structure.ts` 仅在已加载 V2 槽皮路径，把空槽底栏左侧从较长的“等待故事写入”换为定稿原型同位置的“空存档位”；右侧仍按真实保存/读取模式显示“可保存／不可读取”。无图/旧树保留原文，预览中心的锁态/空态语义不变。原型只是对照，没有把自由 DOM/CSS 带入运行时。
- 设置剩余文字速度、转场、缩放、减少动态、高对比、全局恢复默认及退出宿主继续禁用；本轮没有将任何待接入项伪装为生效。

## 实证

- 新 `gal-ui-settings-preview.test.ts` 3/3：续玩取本作品文本、无续玩不泄漏、长多行输入受限；每态 `validateLayoutNode` 零 issue。`gal-ui-art.test.ts` 定点检查 V2 保存/读取空槽文案与旧树原文，19/19。相邻 GAL/Profile/Save/UI 共 99 文件 792/792，`npx tsc --noEmit` 退出 0。
- `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-slots.audit.ts`：40 个绝对定位元素，重叠、硬对比、警告和 border-image 前提均 0，house 主题与 5 个 skin 命中。原有无图设置审计 `gal-ui-settings.audit.ts` 退出 0、布局/对比阻断均 0；其“非 house／华丽度少”提示只针对无素材审计入口，已加载 V2 真浏览器另见下项。
- `GAL_ART_AUDIT_PAGES=slots,slots-load,settings-text,settings-display` 短时隔离 Edge 真渲在深浅共八态退出 0：存读档空槽底栏文本与设置预览文本均由浏览器断言，图片无破损，浏览器/临时构建关闭。1440×900 目击：[读取亮态](../review/gal-art-01a-slots-load-light-content-1014.png)、[设置画面亮态](../review/gal-art-01a-settings-display-light-content-1014.png)。槽卡花饰仍很接近文字，不据此称整卡逐像素 1:1。

独立复查前仅为施工侧结果；素材逐件来源/审美审批及其余 S5/S6 差异继续开放。
