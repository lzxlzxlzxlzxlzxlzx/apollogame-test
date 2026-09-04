# game-105 Host Integration M2：GD 验收与 witness 清单

> GD-105 · 2026-09-02 · **M2 历史/未来验收清单，不是独立可玩版 S2--S8 的验收输入。**

## A. 游戏侧可自动化剧本

程序应在 `docs/design/game-105/acceptance/` 补齐下列 GD 署名场景，并让 `acceptance-adapter.ts` 的受控 reply harness 支持 `replyHarness` 配置。harness 只替代文字返回，不能替代物理位移、倒塌或卡牌结算。

| 场景 | 配置 | 必须断言 |
| --- | --- | --- |
| 09 AI 主卡真实回复 | `replyHarness: success` | AI 卡出现后进入 pending；恰好一次请求与一次可见回复；来源为 `llm`；再回到玩家 |
| 10 AI 余波顺序 | `replyHarness: success` | 主卡和第二张余波按物理离塔顺序逐张请求/显示；不得合并或跳过 |
| 11 模型失败降级 | 分别 `timeout`、`rejected`、`empty`、`unauthorized` | 每种路径仅一次模板回复；不重复加心动值、不换卡、不死锁 |
| 12 晚到与重开 | `late`, 然后 `tower.restart` | 旧 ticket 回复被忽略；新局没有旧卡/旧文本/旧心动值 |
| 13 AI 惩罚卡 | `success` 与 `timeout` | AI 倒塔后卡池按种子稳定；每局只请求/完成一次；失败显示模板；物理持续步进 |

受控 harness 最少投影这些验收值：`ai-reply-count`、`ai-penalty-request-count`、`ai-reply-mode`、`ai-reply-visible-once`、`ai-penalty-card-visible`、`late-reply-ignored`。其中 `ai-reply-mode` 必须为 `llm` 或 `template`，不得出现未定义第三值。

## B. 真 SDK Host witness

Storyteller/Host 程序以真 `createAppHost`、真 iframe、构建后的 Storyteller 与 game-105 运行：

1. 用 `apps.launch` 传入角色、Persona、种子和 session；游戏正确采用或降级默认值。
2. 游戏完成后产生一次 `doki.game.result/1`；结果只含 12 个白名单原子指标，不含玩家自由输入。
3. 重放同一 `(runId,resultId)`：可记录两条原始完成消息，但只接受一次、只生成一次结算和赛后续聊。
4. 记录启动、dialogue 请求、结果与去重的脱敏日志/截图，并附执行命令和构建版本。

## C. 真实模型 Host witness（S4 P1）

拥有模型凭据的 Host 负责人在受控环境执行，密钥不得出现在游戏、前端日志或证据文件：

1. AI 主卡和 AI 惩罚卡分别获得一次真实模型文本，内容符合 1--2 句、80 字上限。
2. 人为模拟超时、拒绝/未授权与空文本，三种情况均恰好降级为模板并能完成本局。
3. 真实模型晚到后重开或卸载，回调不改变任何旧/新局 UI 与结果。
4. Storyteller 根据白名单结果续聊一次；`memoryCandidate` 只显示候选，绝不写入长期记忆。

测试 agent 的复查结论必须将 A、B、C 分开落账：A/B 通过不能替代 C；C 未提交时，S4 只能为阻塞状态，不能 PASS。
