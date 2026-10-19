# DEMON-CASTLE-UI-RUNTIME-01｜共享 Life Host 月影 UI 正式接入

施工主体：**BDM程序**（2026-10-15，本地文件锁；Owner 禁止远程 push，按本地锁协调）
状态：**active（2026-10-16修订02三核心已独立局部PASS/整单CONCERNS；独立395项浏览器/792范围测试，日历及旧档亦局部PASS；按钮A由PUI领锁实施、两属性图未交。六源码/直接测试/import写锁已释放给引擎assembly迁移，不跑旧路径探针；人工64/64压力不改定稿布局）**
代码基线：`ad05d3b429725a2517513a44f318a9a55ebf5aeb`，共享脏树；保留其他施工者变更。

## 判断与边界

接受。以 [已定稿原型](../prototype-approval.md) 为目标，使用既有 LayoutNode 控件及共享 Life Host 投影，不复制原型 DOM/CSS，不修改 `src/ui/**`。素材登记由策划已派出的 asset-manager 完成，本单仅消费严格 key，不代签审批。

允许：`src/engine/host/life-hud*`、必要的共享 Host 只读表现接缝、host descriptor 闭集可选图标槽及测试、魔王城候选/严格物化工程文件、任务级探针与设计证据；2026-10-16 Owner 输入 A 另明确允许 `life-input.ts` 安装器与 Host 的原生UI键盘路由接缝。禁止：World 规则/资源账本/存档/hash、连续移动/reducer/动作词表变更、自由 URL/CSS 配置、未经批准素材、远程操作、控制台人门。

## 验收

2026-10-16 Owner 实机反馈由策划转达并核对原始截图：丝带上的独立深蓝矩形卡不符合定稿；地点/日期/时段须在框皮内以透明布局显示，长文/窄屏不得出框。三入口须在PUI交付后消费已批准卷轴/背包/档案图，保留键徽/可访问名称，不重新生成或使用emoji。此为恢复已定稿视觉，不改原型版本；复现图为旧overview-1440.png及Owner剪贴图，后续真实截图替换旧证据并保留问题说明。

1. 左上动态任务追踪卡、顶部居中可读状态丝带、右上仅图标与真实数字资源、J/I/C 图标与独立键徽；无常驻底部快捷栏。
2. 三类同骨架羊皮侧栏，真实内容、关闭/Escape、互斥、空态和长内容滚动正常。
3. descriptor 严格 key 经 AssetManager 取已批准素材；缺图安全回退，无第二份资产路径映射。
4. 1440×900 原型/真实 Host 同画布截图对照、差异单、深浅 UI 审计、validate 零 issue；host/descriptor/回归及锚点撤修验红。
5. 不捏造第三项资源或演示数据；原型与现有权威数据不一致时明确留证请求策划确认。

## 阅读及目击证据

已完整阅读 AGENTS、llm-onboarding、playbooks/index、game-production、game-requests、game-flow-questions、ui-playbook、ui、assets、art-pipeline、testing、self-check、review-gates，及 module-ui/module-assets/check-ui/align-check/project-roadmap 技能。原型目击与状态截图见 `self-check/shots/DEMON-CASTLE-UI-REVISION-01/01-overview-1440.png` 及同目录状态序列；正式施工前再次核对原型文件 hash。

独立复查人≠施工人；本单不填写独立 PASS，不通过聊天代操作控制台 Owner gate。

当前实证及未决差异：[修订02批自证](../self-check/DEMON-CASTLE-UI-RUNTIME-02-alignment.md)；[旧批历史自证](../self-check/DEMON-CASTLE-UI-RUNTIME-01-alignment.md)不套新目标。原型独立复查已PASS；本正式单没有整体PASS或人门签核。

2026-10-16新版目标已获Owner重新定稿：[修订02版本与判词](../prototype-approval.md#ui-修订-02-重新定稿2026-10-16)。新方向为无圆框入口、中文同字体单行丝带、资源左/入口右共一横排。三目标现已接线，当前证据见修订02自证；旧方向局部PASS不得直接套新方向。评审工具/F2不移植，缺口仍按既有闭集/PUI边界处理。

本批仍由BDM程序领锁。策划授权独立原型PASS后施工；[日历显示A/B](DEMON-CASTLE-UI-RUNTIME-02-calendar-decision.md)已获本程序会话Owner直接选择“A：通用显示名配置（推荐）”。允许严格可选Host显示名映射与候选/正式Host JSON受控更新；仍不改PUI/资产/World规则/save/hash，不硬编码魔王城译名。合同侧由授权子施工calendar_display_contract负责，主程序负责Host只读投影、HUD及严格物化；独立复查不由施工者自签。

## Owner 裁决（2026-10-16）

策划会话 `01a110f0-25bf-7c72-a227-0efc93b35358` 的真实 userMessage `01a142a1-8c5c-73d0-93ef-e597ad1f33b8`：`A，资源选 A`。右上仅魔王威仪 resource、工匠盟约 relationship，第三格不渲染，不新增账本，不以金币/月晶/月叶错误代指属性。J/I/C 使用 PUI 通用原生可访问图标按钮；[精确 PUI 需求](REQ-SIMLIFE-PUI-ICON-BUTTON-01.md)。本程序单继续 Host/严格 descriptor 消费端，不越界修改 UI 基座。

## 新增键盘冲突（Owner 已选择 A）

真实probe176项中24失败：4视口×3入口的Tab不可达与Enter未打开。`src/engine/host/life-input.ts` 的operation表把Tab映射互动选项循环、Enter映射确认；dispatch无条件对其preventDefault。PUI控件本身不能替宿主放开全局键盘。已实读events-logic/input手册与该installer，reducer没有UI焦点/互动菜单优先级输入；不能用组合修复，也不能偷偷加DOM监听逃生。

- A（推荐）：明确扩写共享Host键盘路由接缝；只在uiSkin overlay启用时，当前Host原生UI焦点内的Enter/Space交原生按钮，没有活动世界互动菜单时Tab可进入UI；活动互动菜单仍Tab循环/Enter确认。旧无uiSkin、reducer、动作词表、持续移动、World/save/hash均不变。代价是installer可选policy与跨Host/焦点/菜单切换/卸载回归；通用于Life游戏。错误实施会吞世界互动键，因此必须真浏览器+点名回归、异人复查。
- B：不扩大本单输入范围，保持现有路由；代价是Tab/Enter可访问验收继续FAIL、图标按钮不能宣称已完成，另立共享输入工单。不得把B解释为放宽Owner已选A的可访问标准。游戏专有监听/自由DOM不是合法替代。

本单原范围写明不改输入行为，范围确认前未修改life-input.ts。2026-10-16 策划会话真实 userMessage `01a142bd-4fed-78d2-af13-296abae64d91` 为 `A`（已read_thread核对）；明确允许本单必要输入接缝。A 后策划进一步澄清：无互动菜单时，从body/本画布第一次Tab就须自然进入HUD，不能先鼠标点按钮。本轮使用installer的可选render-local policy：实际overlay就绪且无活动世界菜单，body/本canvas的Tab及Host原生控件内Tab/Enter/Space交原生浏览器；现有资源Tooltip作为闭集UI自带tab stop，只放Tab离开、不放Enter/Space。活动世界菜单优先、无uiSkin/缺皮回退保持旧行为；不改连续移动/World/save/hash或动作词表，不自造全局焦点系统。
