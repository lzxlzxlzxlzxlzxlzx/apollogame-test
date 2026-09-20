# game-105 AI 美术外部试验

## 第二轮（已执行，未批准）

第二轮独立交付说明见 `runtime-preview/ROUND-02.md`，结构化结论见 `reports/review-round-02.json`。
原图是真实RGBA PNG，派生图只缩放不抠图；基础文件检查通过，但22px九宫格极端拉伸、浅色文字对比和窄屏遮塔仍未通过。
新增工具为 `tools/round02.py`、`tools/serve-round02.mjs`、`tools/runtime-round02.mjs`、`tools/finish-round02.py`。以下Pilot 1命令仅适用于第一轮，不要用它覆盖第二轮证据。

本目录是 `game-105/ui/card-frame` 的隔离试验区。它不参与游戏发布，也不会写入正式 `index.json`、`art-ledger.json` 或 `pipeline.json`。

## Pilot 0 基线

- `baseline/player-card-1280x720.png`：桌面玩家互动卡状态。
- `baseline/player-card-800x450.png`：窄屏玩家互动卡状态。
- `baseline/card-frame-current.png`：当前正式卡框副本，仅作为缺陷参考。
- `reports/formal-hashes-before.json`：正式文件开工哈希。

## Pilot 1 用法

使用项目随附的工作区 Python（含 Pillow）运行：

```powershell
& 'C:\Users\24652\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' experiments/game-105-ai-art/tools/pilot.py all
```

`all` 会从真实 AI 候选建立可复现的归一化版本，执行技术检查，并仅对通过检查的版本生成桌面和窄屏离线合成。结果分别写入 `normalized/`、`reports/` 和 `composites/`。

当前第一轮内置图像生成没有真正输出 alpha，而是把棋盘格烘焙进 RGB。该原始候选被保留并判失败；脚本同时生成一个可追溯的确定性归一化版本，用于验证“自动修复后重检与合成”这条链路。归一化不是正式美术，不会进入运行时。

## 隔离边界

- 不修改 `games/game-105/`。
- 不修改 `public/games/game-105/art/`。
- 不修改现有 S1–S8 流程。
- 候选不标记为 `approved` 或 `filled`。
- 人工评价记录在 `reports/human-evaluation.md`。
