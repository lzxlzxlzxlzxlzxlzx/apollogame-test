# S6 资产与候选接线独立复查（局部）

- 日期：2026-10-13；复查者：非施工子代理 `/root/s6_asset_candidate_review`。
- 判词：**PASS，仅限本报告范围**。不是 S6 整关通过，不是正式运行时/浏览器验收，不代签任何 Owner 人门。
- 范围：`library/game-clue-investigation/art/**`、`self-check/s6-import-assets.mjs`、`self-check/S6-manifest.candidate.json`、`games/game-clue-investigation/s6-alpha.test.ts`。正式 manifest 尚未替换；通用资产桥由其他聊天施工，未纳入本次通过结论。

## 阅读与边界

完整阅读 AGENTS.md、docs/llm-onboarding.md、playbooks/index.md、game-production.md、game-requests.md、testing.md、review-gates.md、assets.md、art-pipeline.md、rendering-fx.md，module-assets/module-art 技能，以及当前项目路线图。实查导入脚本、候选数据、测试、clickable-hit-test、sprite-layout、hit-mask bake 和原型 CSS。

需求判断：接受。资产与遮罩应复用既有作者态缩图/烘焙与通用 Sprite 映射，不应引入游戏专用命中解释器。复查不修改资产、候选、正式 manifest 或引擎。仅创建过可删除的隔离测试副本，现已删除；没有启动服务或浏览器，没有数据库/远端写入。

## 独立执行记录

工作目录均为仓库根。退出码原样记录，不经过管道过滤。

1. `node scripts/game-pipeline.mjs checklist game-clue-investigation S6`：exit 1；输出 `checklist 只认 S2/S3/S4/S5/S8/S7（S1 owner 亲提免查·S6 平台内嵌）`。这是 CLI 明确不支持 S6 checklist，并非假造已跑阶段复查门。
2. 首轮沙箱执行 verify / Vitest 均因 Windows `realpath EPERM` exit 1；Vitest 为 **no tests / 1 unhandled error**，不计通过。随后在获准环境复跑本地只读测试。
3. `npx vite-node docs/design/game-clue-investigation/self-check/s6-import-assets.mjs --verify`：exit 0，`mode:verify, ok:true, entries:15, maskPixelsChecked:2753452`，8 张 PNG + index 共9文件逐字节重算一致。背景1586×992原字节；7件分别768×512、512×768、627×627、687×573、768×512、768×512、604×652；每件同时存在实心与透明像素。
4. `npx vitest run games/game-clue-investigation/s6-alpha.test.ts`：exit 0，**1 file / 9 tests PASS**；19:19:55，测试352ms，总2.14s。全部运行输出已读，没有 system cycle/WARN/console error。测试装载候选要求 `warnings=[]`。
5. 撤修结束再跑同一原测试：exit 0，**9/9 PASS**；19:21:51，测试378ms，总2.20s。

## 撤修验红（隔离内存候选）

临时副本 `games/game-clue-investigation/s6-independent-revocation.test.ts` 从原测试全文复制，不改共享原件。生成前断言源码锚点 `const artRoot = new URL` **恰好1处**；副本装载后断言 `candidate.entities['object-rug'].Clickable.hitMaskKey === 'game-clue-investigation/mask/rug'`，然后仅删除副本内存候选中的该字段。

执行 `npx vitest run games/game-clue-investigation/s6-independent-revocation.test.ts`：exit 1；stdout **REVOCATION ANCHOR HIT EXACTLY ONCE: object-rug.Clickable.hitMaskKey**。9项中7通过、2按预告转红：

- `rug: contain/cover, scale and mirror agree with decoded PNG alpha`：`expected null not to be null`。
- `does not fall back to the rectangle for missing masks or nonzero rotation`：`expected 'hit' to be 'invalid-mask'`。

这证明撤掉绑定确实恢复矩形命中，现有守卫能发现该回归。临时副本通过 apply_patch 删除，`Test-Path` 为False；共享资产/候选/引擎未被撤修，原9项复绿。

## 核对结论

- 原型19–21行：背景cover、物件contain。候选8张 Sprite 与原型位置、目标框、居中锚点逐项一致；尤其地毯框780×214只是容器，768×512源图contain后图像宽321、高214，不会把780宽当实形。所有物件 Color 为白色且alpha1。
- 生产PNG经同一次 `resizeImageTo` 产出，再由**该字节**烘焙 threshold150 mask；verify 对全部2,753,452像素检查 `alpha>=150` 与二值行一致。无提高1,000,000单mask像素预算。
- 9项候选测试用独立居中fit公式直接读生产PNG alpha，比对7物件×2fit×4scale×31×31=53,816采样点；覆盖缩小、放大、镜像、contain透明区及cover裁切，缺mask/非零旋转拒收。测试不是浏览器CSS缩放/renderer目击。
- 索引8 texture +7 hit-mask，texture/mask键和尺寸严格绑定。provenance写明 design-handoff、原图SHA、缩图方式与输出SHA；明确原模型/prompt未保留、未重构。没有伪造model/prompt/approved/reviewer。
- 无art-ledger.json，因此没有提前建立孤儿批准行；但这也意味着**台账消费闭包与平台逐行复核尚未完成**，不能把“无台账”当S6绿灯。
- `git diff --stat` 只用于共享树范围观察，不能归属他人变化；发现的LF→CRLF告警是行尾提示，未当作功能失败或忽略不报。

## 未覆盖项与后续验收边界

本范围未发现需打回的实际数据/绑定缺陷。正式通用加载桥、skinMap优先替换、浏览器实际渲染/透明洞点击、不同视口/DPR、收录后原物保留、hover/press同轮廓反馈、证物面板真实图、可见性/遮挡/性能和正式台账仍须后续真实接线验收。9项测试会自行遍历fit，因此它们不单独防止候选fit或几何被后续误改；本次原型几何一致来自独立逐项检查，不应宣称已有自动冻结几何守卫。

## 审查版本 SHA-256

| 文件 | SHA-256 |
|---|---|
| S6-manifest.candidate.json | c8721d80777fc3f4cc8707774feeab33d35694458a66a6aad2c1965225a85f20 |
| s6-alpha.test.ts | 89109dfa8bc81c43a62575161ae92e5f1f6ff4dbd953263da87ff06c7931df0f |
| art/index.json | 90210578a6d5c9ee0292761c5ec57991effb5b27196085fae677da41b0338cdb |
| s6-import-assets.mjs | 136d10e9cfc1c2420360eeee2f897ef69d61b6e56a87d46624854a12c583b87a |

路线图当前S5–S6为active、三门pending/pending/required，与本局部结论一致；本复查未改流程板。由主会话将本证据链接同步控制台，不能据此收束整里程碑。
