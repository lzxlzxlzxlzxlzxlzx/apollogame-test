# GAL-ART-01A 设置页 V2 有图消费 · 独立局部复查

2026-10-12；复查主体 `/root/gal_settings_visual_review`，与施工主体不同。判词：**CONCERNS（局部行为回归通过，S5 视觉未闭）**。本单不代表 `media-and-final-skin` 里程碑复查通过，不代签 Owner 人门。

## 独立证据

- 独立运行 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts --maxWorkers=1 --minWorkers=1`：11/11，退出码 0；设置页定位、深色卡、亮字与无图/旧切片回退点名断言通过。第一次沙箱运行因 Vitest 对 `node_modules/vitest/dist/spy.js` 的 `realpath` EPERM 未执行测试，不计作失败断言；隔离升级后重跑通过。
- 独立运行 `node src/services/gal-ui/verify-gal-art-live.mjs`：退出码 0，静态 `file://` 画布 1440×900、深亮 34 态真浏览器截图；设置页外框四态均 x18/y61/1404×824、`border-image-slice:115 fill`、显示边 `58px`。脚本的临时浏览器已关闭；未启动应用服务。
- 真图比对：[V2 定稿](../gal-ui-v2-settings.png) 与 [当前亮主题](gal-art-01a-settings-text-light.png)：标题约 x84/y126，双卡首角约 x84/y244，对齐了本轮 57px 回移目标；浅奶油卡已换为深靛底。外框位置仍一致。
- 独立运行 `node tools/ui-audit.mjs tools/audits/gal-s4-button-label-color-light.audit.ts`：退出码 0，重叠 0、硬对比失败 0、border-image 前提失败 0；但该既有夹具为 1060×760 的 **S4 按钮字色夹具**，不是设置页 1440×900 全量审计，故不据此签设置页四关全绿。沙箱首次同样 EPERM，升级后重跑通过。审计有“华丽件 0”非阻断告警，已核对，不能解释为 V2 视觉通过。

## 未闭差异

1. V2 三个宽大纹样页签与细分隔线，实渲为四个紧凑纯色小钮；页签数量/命名还需区分产品功能演进与美术偏差。
2. V2 两条水平滑轨与数值同行，实渲输入为上下分离的短滑块/值标签；Toggle 的尺寸、轨道金边和行高也不同。
3. V2 卡内每行有分隔线，当前无；V2 的底部恢复/返回是带纹样大按钮，当前是小 ghost。顶部全局导航同样未具 V2 金线胶囊。
4. “快捷说明”在实渲仍显示暗绿色不活跃按钮；与 V2 的轻量描边「查看」形态不符。亮主题其余卡内字色虽可见，还需设置页专用真实纹理对比审计。

本轮未实施独立的锚点命中**撤修验红**，故不得写 PASS 或视作正式关账；需要在隔离副本进行该项验证，严禁直接破坏共享工作树。当前结论仅确认本轮实渲改善真实存在、测试绿和具体剩余差异。
