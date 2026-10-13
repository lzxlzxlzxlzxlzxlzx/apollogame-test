# GAL-ART-01A 独立复查（消费侧）

**复查主体：** 非施工复查 agent `/root/review_gal_art_01a`。**判词：消费接口局部 PASS；S5 视觉对齐 CONCERNS。** 本单不签完整 GAL、V2 视觉/演出 1:1、S5/S6、人门、全库门禁或项目路线图 done。复查范围是 `src/services/gal-ui/**` 的五件通用 UI 皮消费与 demo 内容显式映射；资产登记由资产专职负责。

## 范围与实证

- 本地 AssetIndex 的五个稳定 ID 为 `tex/gal-dialogue-panel`、`tex/gal-system-frame`、`tex/gal-button-default`、`tex/gal-save-slot`、`tex/gal-slider-knob`；另三件 `tex/gal-demo-*` 只是演示内容。`gal-ui-art.ts:6-39` 只从已填充、`texture`、本地 `/games/gal-template/art/` URL 中筛五件；`resolveGalUiArt` 与 `loadGalUiArt` 提供可注入 URL 和逐件图片预检，失效项不入树。`gal-ui-art.ts:81-95` 只写闭集 `Panel.skin`、`Button.skin`、`Slider.thumbSkin`、`Modal.skin`，未改 PUI 共享渲染器。`gal-ui-slice-host.ts:34-37,111` 的 UI 皮和内容 URL 均为显式可选端口。未配置时仍是旧程序皮。
- 独立执行 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-slots-structure.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts`：**3 文件 31/31，退出 0**。其中 `gal-ui-art.test.ts` 点名检查五件消费、LayoutNode 零 issue、缺图回退、demo 内容只凭显式 key、锁定 CG URL 不进树；对比 skin 前后树的布局和 action 保持不变。首次普通沙箱执行 Vitest 在 `node_modules/vitest/dist/spy.js` realpath 上 EPERM、零测试收集，不算通过；获准隔离执行后才取得上述有效退出码。
- 独立执行 `node src/services/gal-ui/verify-gal-art-live.mjs`：**退出 0**，静态 `file:` 页面、1440×900、深/亮主题 × 主页/剧情/槽位/槽位缺图/设置/画廊，共 **12 张当轮截图** `review/gal-art-01a-*.png`。正常项 5/5 图片预检，缺槽卡图为 4/5，`#gal-slot-2` 无 `data-apollo-skin` 且旧卡可读；锁定 CG 不生成 `#gal-gallery-image-cg-3`。脚本在 `finally` 关闭浏览器并删除临时构建。访问地址为隔离临时目录 `file:.../gal-art-*/index.html#<page>:<theme>`，无服务端口。
- `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-story.audit.ts` 独立退出 0：旧无图 1060×760 夹具重叠 0、对比硬失败 0、border-image 前提 0；**这不是本票 1440×900 有图树的 UI 审计**，不能代替下文截图中的真实视觉阻断。工具另报非阻断提示“华丽件偏少且未见 house 主题皮”；此夹具并非本票有图试渲。
- **隔离撤修验红：** 内存读入 `gal-ui-art.ts`，先断言锚点 `node.type === 'Button' && art.button` 恰好命中 **1 次**；原版 `applyGalUiArt(Button, button URL)` 断言得到 `/button.png`。仅在内存替换为 `node.type === 'Button' && false && art.button`，经 `esbuild.transform` 后用同一断言运行，实际 `undefined`、预期 `/button.png`，退出 **1**。共享工作树文件未撤改；这证明按钮皮点名断言能抓到消费线撤除，而非全链路所有断言的替代。

## 两类偏差，分开判

1. **既有 S4 几何偏差，不归咎于贴图。** V2 定稿 `.story-dialogue` 为 `left:20px; right:20px; bottom:0; height:345px`，speaker `top:70px`、line `top:143px`（`gal-ui-complete-v2.dc.html:15`）；真实有图树的 `#gal-story-dialogue` 盒为 **x34 y678 w1420 h252**，底到 **930**、超出 900 画布 30px。V2 存档卡固定 **164px**、preview `top:18px;height:97px`、meta `bottom:13px`（同文件第 18 行）；真实 `#gal-slot-2` 正常有图盒约 **309×162**（深色 x404 y237；亮色 y233），当前结构里预览高度 80、卡内容依旧按 S4 容器排。上述布局/锚点偏差即使换成完美贴图也不会自动消失；应由对应 S4 几何票收敛，不反向改定稿原型。
2. **本票原图直接 cover/缩放的 S5 视觉偏差。** 现有 PUI `render.ts:262-282` 未给 `skinSlice` 时将整张图作 `cover`；给单值时同一个 `s` 同时用于源裁边与输出 `border-width`。当前五张原图多为千像素级，`gal-ui-art.ts:81-95` 只赋 URL/可选单值，不能表达 V2 系统框原型的源裁 `115` 与显示边 `58/36px` 分离（见 `requests.md` 的 `GAL-ART-01A/S1` A/B 缺口）。真实截图 `gal-art-01a-story-dark.png` 对比 `gal-ui-v2-dialogue.png`：姓名牌挤在台词上，正文落在框上沿，按钮成细条，框底截断；`gal-art-01a-slots-dark.png` 对比 `gal-ui-v2-save.png`：卡片装饰多次重复且覆盖元数据；深/亮设置虽能读，但原图外框并非 V2 对拍通过。缺图态 `gal-art-01a-slots-fail-dark.png` 证实语义回退正常，却不意味着有图态可发布。

## 结论与剩余人门

消费合同、五个可替换槽、缺图 fail-soft、显式 demo 内容和锁定 CG 守卫在本次独立检查中可给**局部 PASS**。视觉交付给 **CONCERNS**，不能把静态加载成功或测试全绿解释成 S5 1:1；待 Owner 对 `GAL-ART-01A/S1` 的 **A（PUI 通用源裁/显示边分离）/B（GAL 本地派生消费图）** 作裁决，再由相应归属方实施、逐屏同画布重拍并作有图 UI 审计。另须由原 S4 几何票独立处理对话框及槽位锚点差异，不能借素材票追认布局变更。

限制：未做 Git/GitHub、数据库/持久化业务写入、应用服务启动或路线图 done；`scoped-gate.mjs` 涉 Git 检测而未执行，全库门禁不在本票判词内。原图 AssetIndex 的发行许可仍标注外部分发权未核，故本复查也不批准发行。
