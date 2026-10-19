# POTION-LIST-01 独立复查：内置游戏多段 slug 枚举

- 结论：**PASS**（仅本次 `GAME_RE` 修复及 `/api/games` 列表路径；不代替 S3 Owner 人门）。
- 复查人：独立于 `main_entry/paths.py` 和 `main_entry/games_list_test.py` 施工者；未修改被审源码或测试。
- 差异：`GAME_RE` 从 `game-?[a-z0-9]+` 扩为 `game-?[a-z0-9]+(?:-[a-z0-9]+)*`，多段名称仍要求每段非空；`handle_games_list()` 以 `fullmatch` 过滤目录。

## 四步实证

1. 独立复跑：`python -m unittest main_entry.games_list_test -v`，退出码 0、2/2 通过。合法样例含 `game-a`、`game101`、`game-potion-brewing`、`game-clue-investigation`；非法样例含双连字符、尾随连字符、大写、路径字符及错误前缀。
2. 锚点撤修验红：隔离 Python 进程内先断言当前 `GAME_RE.pattern == 'game-?[a-z0-9]+(?:-[a-z0-9]+)*'`，再把 `games_list.GAME_RE` 临时替换为旧正则，仅运行列表回归用例。断言确有 1 个预期失败且失败信息命中 `game-potion-brewing`：旧正则所得 `['game-a', 'game101']`，期望列表还有炼药游戏。进程退出后没有源码或工作树改动。
3. 实证复现：直接调用真实仓库的 `handle_games_list()`，返回 ID 包含 `game-potion-brewing`（另有多段 `game-card-reveal`、`game-clue-investigation` 等），不含 `game--bad`；退出码 0。临时目录 fixture 仅在测试作用域创建并自动清理。
4. 读告警：上述 Python 命令均打印 `Failed to find real location of ...Python313\\python.exe`，但执行退出码与用例结果正常；属于当前解释器路径提示，未观察到列表枚举告警。未启动服务或浏览器，因此未声称 UI 已刷新。

未验证 owner 正在运行的工作台是否已重新加载 Python 后端；本次 PASS 证明源码路径和直接处理函数正确，不是人门通过证明。
