# REQ-HOST-GAME-SESSION-SECOND-CONSUMER · 取消归档

2026-10-14，Owner 明确要求从共享需求池移除：第二款独立小游戏何时出现不可预期，当前验证需求没有实际消费者。此项是 **cancelled / wontfix-now**，不是已施工或验收通过，也不再自动重开。将来若确有第二个真实消费者，应基于当时需求重新实查并立新单。

原范围：`REQ-HOST-GAME-SESSION` 已由 `game-dice` 验证并释放；拟让第二个真实独立小游戏复用 `external-game-session`，不复制消息、熵或结果去重协议。原验收拟覆盖 `{version, requestId, input, seed?, preset?}` / `{version, requestId, status, result}` 合同、同 seed 确定性、preset 不取熵、非法输入 fail-closed、首次 settle 不可篡改及非施工者独立复查。
