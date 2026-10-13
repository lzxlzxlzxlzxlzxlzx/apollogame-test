# GAL-ENG-06D 非施工者独立复查（2026-10-12）

**判词：局部 PASS；全库门禁 CONCERNS。** 复查者为非施工者 `/root/review_gal_06d`。本判词仅覆盖可注入的非权威预览 KV 适配器及内存回归，不代表真实 IndexedDB/跨会话持久化、剧情截图采集、S5/S6 或 `replay-save-preview-auto` 整个里程碑完成，也不代替 Owner 人门。

## 阅读与范围

完整阅读 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/playbooks/save-platform.md`、`docs/playbooks/testing.md`、`docs/playbooks/review-gates.md`、`.agents/skills/module-save/SKILL.md`；先核对项目路线图、`requests.md` 06D（第 77–83 行）及施工自证 `GAL-ENG-06D-self.md`。架构判断：接受已有 `GalSavePreviewPort` + `IndexedDbKV` 的可注入重组；不新增存档语义。只审 `src/services/gal-save/gal-save-preview-indexeddb.ts`、其公开导出、控制器和点名测试的 06D 消费路径。

## 四步独立核证

1. **独立复跑。** `npx vitest run src/services/gal-save/gal-save-preview.test.ts` 首次沙箱运行在 Vitest 自身 `spy.js` 的 `realpath EPERM` 处退出 1、0 测试收集，明确不计通过；同命令在允许读取依赖的环境复跑退出 0，1 文件 **14/14**。06D 三个测试位于 `gal-save-preview.test.ts:286–347`，只用 `Map<string,string>`、`MemoryStoragePort` 与内存端口，不使用真实或 fake IndexedDB。没有跑其他可能写数据库的测试。
2. **带唯一锚点撤修验红。** 在临时 Vitest 配置中以 `enforce:'pre'` 对适配器源码作**进程内变换**；变换前断言目标原文出现恰好 1 次，且 buildEnd 断言目标模块命中恰好 1 次，不改共享实现。把 `gal-preview:v1:` 改为 `gal-preview:v0:` 后退出 1、**2/14 红**：`gal-save-preview.test.ts:304` 的键空间断言和 `:326` 的损坏侧车定位断言；把 `gal-save-preview-indexeddb.ts:24` 的超长 JSON 守卫改为恒假后退出 1、**1/14 红**：`:328` 期望超限数据被拒。临时配置已删除，复核 `Test-Path` 为 False。第二次故障输出包含测试框架打印的 360001 字符差异，此为预期撤修告警，不是原实现告警。
3. **异常路径实证。** `gal-save-preview.test.ts:297–317` 验证 `book:a`/`book:b` 跨包隔离、覆盖后旧 hash `stale`、删除后权威槽空；`:319–333` 验证坏 JSON、超长 JSON、非法图片降级为 `damaged`/拒写且 `manual.load` 仍 `loaded`；`:335–346` 的三项 KV 异常使控制器给 `unavailable`，合法权威读档仍 `loaded`。既有 `gal-save-preview.ts` 控制器先核权威、读后再核 hash；适配器 `:6–14` 只生成 `gal-preview:v1:` + JSON `[packageId,slot]` 键，不构造 `snap:`/`env:`。`gal-ui-slice-host.ts:81` 只在显式传入 `ports.savePreview` 时创建控制器；适配器默认 `new IndexedDbKV()` 构造函数只记 factory，真正 `indexedDB.open` 在 `indexeddb-kv.ts` 的 I/O `ensure()` 后，未见静态宿主暗开数据库。此项是代码边界加内存行为证据，**不是**真实数据库验收。
4. **读告警与门禁。** 定向复跑输出无 warning/unhandled error。`npx tsc --noEmit --pretty false` 退出 **1**；可见诊断位于 `games/game-card-reveal`、`games/game-dice`、`games/game-theft` 与 `src/launcher/game-runner.tsx`，没有 06D/GAL 文件诊断；不把全库说成绿灯。未运行 Git、服务、真实数据库、业务持久化写入或 Owner 决策。

## 结论边界

06D 的可注入适配器在内存 KV 契约下满足键空间隔离、坏侧车降级与权威 hash 保护，且两项关键守卫被点名测试真实咬住，故签**本票局部 PASS**。真实剧情截图/编码、正式宿主显式注入、跨会话 IndexedDB 读写及全库类型红灯仍是后续验收，不得据此把项目路线图的 `replay-save-preview-auto` 标为完成。
