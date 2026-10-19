# S7 DokiWorld 出包接缝预检

日期：2026-10-14。性质：只读源码/规范实查，不是施工、测试 PASS 或发布批准。施工者：发布预检代理 `/root/doki_package`。

## 结论

接受 Owner 的交付方向：正式启动的全部图像来自宿主；现有八张 PNG 仅供空输入 preview。现状不能直接把预览包改名作为合规 DokiWorld 包：App 目录、严格 parser、动态对象数据投影、SDK 生命周期和 dist 均尚未形成。

**确认的共享缺口是卡带运行会话接缝，不是 PNG/mask 算法。** 需要 Owner A/B 裁决后才能实施；没有修改共享代码、游戏 manifest、美术、流程板或 dist。

## 阅读证据与适用线

已完整阅读 AGENTS.md、docs/llm-onboarding.md、docs/playbooks/index.md、game-production.md、game-requests.md；DokiWorld 当前入口及 identity-manifest、contracts-lifecycle、integration-documentation、assets-build-release、testing-delivery 五分册；vendor/dokiworlds-app-sdk/GUIDE.md、src/index.d.ts；中文调用说明模板。另实查发布背景 dokiworld-pack.md、testing.md、save-platform.md、base-lib.md，以及 assets.md 的宿主视觉桥条目。命中 DokiWorld 发布、合同、资产消费和测试线；本单未实施 UI 或资产导入。

## 现有能力与真正接缝

| 面 | 源码/手册证据 | 判定 |
|---|---|---|
| 动态 PNG 与不规则命中 | `docs/playbooks/assets.md:40`：“创建 World 后调用 session.bindWorld(world)”；`src/assets/host-visual-bridge.ts:151` prepare，`:183` bindWorld；同文件 projectHostVisual 投影 Transform/Sprite/Clickable | 已有严格 HTTPS/CORS PNG、尺寸与 mask 预算验证、输入稳定排序、同源 contain/cover/anchor、局内 key 与 dispose。不得重造或退化矩形。 |
| 运行核入口 | `src/studio/cart-run-core.ts:106`：`runBlueprintInto(div, blueprint, vp, presentation?, assets?): () => void` | 只返回清理函数。内部创建探针 World 并 load/tick，再创建运行 World；没有外部绑定会话资源或只读终局观察端口。仅传 AssetManager 不会绑定动态 mask catalog。 |
| 本地资产校验路径 | `src/assembly/manifest-core.ts:306`：“只从已登记的 hit-mask 资产绑定”；未绑则 warnings；`src/assets/cart-art.ts:91` assertCartMasksBound 要求实体内 hitMask | 当前本地路径不能原样接临时 host-mask。不能把动态 mask 塞入本地索引/World，或直接删守卫来假装接通；共享会话入口应明确区分并严格验证两种资源来源。 |
| 动态对象数量 | `src/assembly/manifest-core.ts:34–42` 描述 templates/$params/$repeat；`:95` expandEntities 支持 `$repeat.items`，`:59` substituteTemplate 支持整值类型替换 | 已有实例化能力。合同 1–12 对象不等于必须新增引擎玩法。先用现有模板与闭集数据重组固定七对象预览；只有确证无法表达的部分另报缺口。当前没有该游戏宿主参数到模板的实现。 |
| 玩法解释器 | `src/assembly/capability-registry.gen.ts:59,61,139` 登记 t2-effect-apply、t2-clickable、t3-flow；registry.ts 真实导入注册相应实体 | 调查、幂等收录、进度与完成继续由既有能力解释。adapter 不能手写另一套点击/收录状态机。 |
| 收录顺序 | 当前 manifest 为固定对象 Flag/Resource/Flow，未发现专用首次收录顺序投影；base-lib.md 指向 g4-group 和事件日志 | 是必须补验证的数据设计项，尚不能凭缺现成例子认定引擎缺口。结果必须来自真实世界状态且包含首次收录顺序，不能从 DOM 或第二套 adapter 规则推断。 |
| SDK 唯一终局 | SDK index.d.ts 暴露 whenReady/complete/requestExit/dispose；`dokiworld/game-card-reveal/src/completion.ts:5` 有该 App 专属 CompletionGate 示例 | SDK不替游戏决定终局。可按当前规范在薄 adapter 写 pending/accepted/rejected 的投递幂等门，不需要新玩法 capability；前提是运行核提供真实只读终局观察。不得复用卡牌业务语义或拿 DOM 按钮作为成功证据。 |

背景和证物特写不是 Clickable，不应为复用 HostVisualSession 强造命中 mask。可消费现有 AssetManager/HostPngAssetLoader 做受校验的只读纹理预载；场景对象才经 HostVisualSession。必须遵守合同背景最大8192、物件/特写最大4096、所有图片成功前不启动正式局；需在实现前核查其 UI 图像 URL/句柄消费与清理，不新增自由 loader。

## 集中 A/B 裁决

### A：最小通用卡带会话桥（推荐）

共享运行核提供受控会话接入：探针与运行 World 在任何可能消费命中的步骤前绑定同一已验证 host mask catalog；只读世界/终局同步端口；停止、失败和卸载成对清理绑定。动态资产来源的严格校验与本地索引路径明确分开，旧默认路径保持原行为。

代价：修改共享运行核/资产接缝并回归在线、内联、host 会话三条路径，需异人四步复查。通用性：后续宿主参数化卡带可复用，避免发布壳复制 Canvas/UI/输入循环。风险：观察口若放出可变 World 或时序不当会绕过数据纪律，必须以只读接口、确定时点、trace/清理测试钉死。

本游戏随后只做严格合同、数据模板投影、资源准备、结果合同投影和 SDK 投递。**不顺带造新调查 system、任意代码回调 DSL 或扩大合同。**

### B：本游戏专属宿主适配（须明确纯数据例外）

App 自行装配 Engine/Canvas/UI/输入与宿主 mask 会话，并观察自己持有的 World；玩法仍尽量消费原数据。

代价：首次局部代码较直接，但需要明确游戏层宿主例外，在线预览/离线/宿主形成两套生命周期，未来输入、焦点、反馈、cleanup修复需双轨回归。风险：容易在 adapter 演变成自写规则/DOM，且同一预览通过不能证明 DokiWorld 可玩。若以后切回 A，需删除重复壳并重做浏览器验收。

## 验收边界

1. 冻结 v1 严格 parser：1/12对象边界、重复ID、flavor/required交叉约束、至少一必需 clue、所有嵌套 extra-key、尺寸、mask行/尾bit/比例/总预算、64KiB；文档 JSON 用真实 parser 测。
2. host mask 透明点拒收、实心点命中，cover/contain、多视口、同z稳定顺序、CORS/坏PNG/尺寸失败整体取消。绑定缺失不允许开始可玩局；URL/mask字节不进 World/hash/output。
3. 动态1/7/12对象真实引擎与真浏览器：普通查看、可选/必需、重复收录幂等、首次收录顺序、唯一完成、退出取消；预览不请求宿主URL且永不 complete。
4. 唯一投递：真实终局才 complete；pending并发阻挡，accepted以后不再提交；rejected/timeout保留同一锁定结果；dispose/refresh不伪造业务结果。
5. 旧在线/内联路径回归；正常和异常均清理 World mask绑定、AssetManager临时项、rAF、输入/焦点监听、SDK连接。必须有锚点命中断言的撤修验红及 stderr 阅读。
6. build必须复用文档/资产闭包工具，使用相对路径，preview素材随包；正式输入不得偷偷换包内图继续结算。真 dist 断网preview、假宿主、`/apps/game-clue-investigation/` 子路径、SHA/新鲜度及zip根验收。

## 阶段与交付现况

“查看记录”另由主聊天真浏览器诊断：初始清单可见 true → 点击查看记录仍 true → 点击清单标题变 false → 点击查看记录恢复 true；浏览器已关闭。该按钮当前语义为展开/定位已有清单，并非打开独立档案页，不能以其无明显视觉变化推断 SDK 终局故障。本子任务未重跑该浏览器证据。

读取时 `public/games/game-clue-investigation/pipeline.json` signoffs仅S1–S5，无S6人门；机器/复查记录仍含旧gameHash。项目路线图 S5–S6为active，selfCheck/review pending、owner required；S7–S8 planned。Owner最新聊天“已通过”须保留为真实需求背景，不能由agent代写控制台审批。

此报告未运行测试、构建或服务；无新增 dist/zip，不能宣称可上传或全部完成。需主聊天核对人门/最新独立复查并取得共享接缝 A/B 后继续；不要求Owner亲自运行普通本地构建，也不安装到外部Doki目录。
