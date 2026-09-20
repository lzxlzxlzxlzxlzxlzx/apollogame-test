# 第二轮隔离实机预览

本页直接运行现有游戏。候选只通过页面内存中的索引响应副本覆盖，不修改正式索引、源码或S1–S8流程。

在项目根目录运行：

```powershell
node experiments/game-105-ai-art/tools/serve-round02.mjs
```

- 仅换图：http://127.0.0.1:5195/experiments/game-105-ai-art/runtime-preview/index.html
- 实验深色文字：http://127.0.0.1:5195/experiments/game-105-ai-art/runtime-preview/index.html?ink
- 正式基线：http://127.0.0.1:5195/experiments/game-105-ai-art/runtime-preview/index.html?baseline

从积木塔上层抽出一块并松手即可查看互动卡。自动探针使用1280×800窗口，从(650,220)拖到(650,550)，再将同一个真实状态切换到1280×720和800×450截图。坐标带有居中场景的40px上边距，不能直接用于720px高窗口。

复跑命令（服务器保持运行）：

```powershell
node experiments/game-105-ai-art/tools/runtime-round02.mjs 1
node experiments/game-105-ai-art/tools/runtime-round02.mjs 2
& 'C:/Users/24652/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' experiments/game-105-ai-art/tools/finish-round02.py
```

finish脚本两次重建检查、缩放图、九宫格和离线合成，比较9项SHA256，并核对四个正式文件。实时物理截图哈希另列，当前不稳定；不得声称全体产物逐像素稳定。

原始图片导入接口为`tools/round02.py --import-original <路径>`，只在原始槽位尚不存在时接受导入，拒绝覆盖现有原始图。当前槽位已保存真实生成结果。缩放派生不是清理图，没有抠除背景。

本轮结论：基础文件检查通过；技术整体、实机适配及正式入库均未通过。视觉方向待策划评审。详见`reports/review-round-02.json`。服务仅绑定本机，不参与游戏发布。
