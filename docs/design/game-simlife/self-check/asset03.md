# SIMLIFE-ASSET-03 / R1 施工自检

## 范围与结论

- 接受为既有资产作者态管线扩写；没有新增 gameplay capability、system、phase、World component、runtime loader、UI 或 renderer 分支。
- 首轮 `zerocraft.life-asset-generation-batch.v1`、AI pending/approve 与 CLI 入口守卫保持不变；R1 补齐原先缺失的 **local-review → 人审 approve/reject → vendor/copy → game-local AssetIndex** 闭环。
- CLI 默认仅输出只读 plan；只有显式 `--generate` 才写待审区，只有显式 `--approve-local <slotId> --reviewed-by <human>` 才物化本地候选，`--reject-local` 只撤待审项。
- 本次没有调用真实供应商、外部模型或网络，没有在工作区执行 generate/approve，没有修改 Little Valley 正式图片、pending 或 AssetIndex。所有批准写入实证均在 OS 临时根。

## R1 实现证据

- 可信来源固定为目标根的 `assets/index.json`；待审 JSON 只留 source/id/score、元数据 fingerprint、源字节 SHA-256、槽位规格/anchor/consumers/brief fingerprint，不含 path、URL、bytes、license、secret 或批准字段。
- approve 不信任待审 JSON：重新读取 current AssetSlot manifest、可信 AssetIndex 和源文件，重新规划候选，并逐项核对 game/slot/original assetKey/source/id/fingerprint/spec/style/license/filled texture/PNG format/width/height/alpha/source bytes。
- 源路径同时做 lexical 与 realpath/symlink 越根检查；game id 只允许安全单段标识。当前只有可做实际像素/alpha 验证的 project PNG 来源可批准；artlib、非 PNG、丢失文件、越根路径均显式拒绝。
- 通过后复制到 `public/games/<game>/art/vendor/project/`，文件名为可读 slot slug + 原始 slotId 的稳定 SHA-256 短后缀，避免 `hero.one`/`hero-one` 这类合法 id 相互覆盖；以原槽 `art:` key upsert 游戏本地索引。provenance 记录 `vendoredFrom`、slot binding、reviewer、approval time 与 content hash。旧 placeholder 文件不被删除，loader 仍以原 key 解析新条目。
- forged id、unsupported source、manifest fingerprint/spec/key 漂移、source status/type/style/size/alpha/format/license 漂移、源文件缺失/字节变化、源路径越根、cross-game 与 traversal game 全部 fail-closed，旧 index/正式 bytes 不变。

## 机器检查

- 最终相关 Vitest：**11 files / 156 tests passed**。包含 AssetIndex/slot brief/loader/candidate/review packet/generation batch/AI pending/CLI/Little Valley slot 与消费回归；无值 approve 与孤立 reviewer 参数均 fail-closed、零写入，同 slug 双槽保持不同文件和字节。
- 相关 ESLint：exit 0，零 warning。
- `asset-reconcile game-simlife`：PASS；`ledger-audit game-simlife --strict`：21/21 有槽、0 孤儿，PASS。
- `game-skill-audit game-simlife`：未覆盖红旗 0、RATCHET PASS；薄宿主“零能力接入”为既有黄项。
- DOCS-REF：46 Markdown / 394 paths，PASS。
- context budget：主池 10/10、24885/25000；全局仍只被既有 `galgame/requests.md`、`game-card-reveal/requests.md` 和 `ui.md` 超限阻断。
- 全库 `tsc` / `npm run build` 仍只被既有 `game-card-reveal`、`game-dice`、`game-theft`、`launcher/game-runner.tsx` 类型错误阻断；输出零命中本单文件，build 在 tsc 阶段停止。

## 撤修验红

唯一 R1 对账锚点 `stableAssetSlotJson(pending) !== stableAssetSlotJson(expectedPending)` 施工前命中 1。临时反转并加入独有 marker 后，正常 local approve 被拒、changed-source-bytes 篡改被放行，精确 **2 failed / 33 skipped**；同回合恢复后同两项 **2 passed / 33 skipped**，锚点 1、marker 0。随后纳入 11 files / 156 tests 最终回归。

## 声明边界

R1 施工自检通过只证明本地可信候选的人审物化合同、AI 既有 pending 合同和原 key 消费语义成立；不代表真实 API、供应商许可、图片审美、正式资产批准、新游戏视觉质量或试玩已验收。当前等待非施工人独立复查，roadmap 与 owner 人门均未推进。
