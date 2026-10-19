# REQ-GCI 公共需求池释放记录（2026-10-16）

> 历史结案记录，不是当前施工依据。Owner 明确要求释放公共需求池位置；仅结共享能力项，不代表 `game-clue-investigation` 的 S3/S6 阶段、人门或全库门禁通过。游戏级未完事项继续由 `docs/design/game-clue-investigation/requests.md` 管理。

## REQ-GCI-CART-ART-BRIDGE · 卡带本地资产消费桥 / mask-only S3 点击门返修

原范围：卡带本地资产消费桥、同源 PNG alpha mask 点击探针与台账只读路径，以及本次追加的短生命周期 Vite/Edge 探针启动修复。共享桥独立复查记录见 `docs/design/game-clue-investigation/review/REQ-GCI-CART-ART-BRIDGE.md`；mask-only 探针复查见 `docs/design/game-clue-investigation/review/REQ-GCI-MASK-CLICK-PROBE.md`；探针启动自检见 `docs/design/game-clue-investigation/self-check/REQ-GCI-render-harness-startup.md`。

结案口径：共享消费/命中能力与 mask-only 点击探针按既有局部 PASS 证据释放公共池槽位；Owner 于本会话回报 Edge 点击探针通过：14 个候选、2 个具名 Signal 真入世界、2 个透明反例、零控制台 error，随后 5700 端口监听检查无输出。共享启动器独立复查的进程树边界仍以 review/self-check 如实记录，不扩大为任意父进程异常退出均保证清理。

不在本结案范围：游戏的 S3 阶段复查/机器证刷新、S6 正式素材审美与来源审批、Owner 人门、全库 depcruise。对应游戏级工作继续留在 `docs/design/game-clue-investigation/requests.md` 和流程板。

## REQ-GCI-PIPELINE-WRITE · 流程板 Windows 写入可靠性

原范围：`scripts/game-pipeline.mjs` 采用同目录临时文件完整写入后原子替换；Windows 暂时性文件占用有界重试；失败保留原板并清理事务临时文件；坏 JSON 或非 ENOENT 读取错误 fail-closed。施工与独立复查详情见 `docs/design/game-clue-investigation/review/REQ-GCI-PIPELINE-WRITE.md`。

结案口径：共享 CLI 写入可靠性本身的独立复查判词为 PASS；深车道测试曾复跑 75/75。此处释放的是共享 CLI 能力槽位，不依赖也不宣称 GCI 当前 S3/S4 门通过。rules 指纹变化后阶段证据 stale、S3 独立复查及全库门禁各自保留在游戏/全库流程。

## 槽位处理

上述两条已从 `docs/workflow/requests.md` 当前活动区移除。移除不等于 Owner 签核，也不代表共享代码已在本记录之外被重新提交；本记录保留原能力范围、局部判词和未结阶段边界供追溯。
