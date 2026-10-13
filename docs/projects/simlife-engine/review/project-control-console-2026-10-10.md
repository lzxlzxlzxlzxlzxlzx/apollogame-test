# 项目控制台独立复查

日期：2026-10-10  
复查范围：`project-control-console` 路线图里程碑与 PROJECT-ROADMAP-02  
复查人：Lead（非施工人）

## 结论

**独立复查通过，送 Owner 终审。** 控制台将项目状态保存在严格的文件型 JSON 契约中；技术性里程碑仅在服务端确认依赖、证据、自检和独立复查均通过后自动收束。需要 Owner 人门的里程碑只能通过专用终审操作转为 `approved + done`，客户端全量保存不能伪造 `done`。

## 独立实证

- 阅读 `main_entry/project_roadmap.py`：`save()` 先校验输入、再以深复制执行固定点自动收束、最后再校验并原子替换；`owner_decide()` 对 review 状态执行原子通过/退回，拒绝自动项的 Owner 终审。
- 阅读 `main_entry/server.py` 和 `src/studio/ProjectRoadmapPanel.tsx`：Owner 决策走独立 POST 路径；页面区分「Agent 自动收束」与「Owner 人门」，且只在 review 的非自动项提供通过/退回按钮。
- 独立运行 `python -B -m unittest main_entry.test_project_roadmap`：11 项通过。
- 撤修验红：临时把 `normalize_auto_closure()` 的 `owner == not-required` 条件破坏为 `owner == required`；点名用例 `test_review_passed_automatic_item_closes_on_save` 精确失败（预期 `done`，实际 `review`）。恢复原条件后全套 11 项再次通过。
- 只读校验 `simlife-engine` 和 `galgame-generation-engine` 两份真实 JSON：均为零诊断；未调用保存接口，也未写入它们。

## 已修正规范偏差

`nextActionable` 的设计文档曾错误描述 Owner gate 会阻断 planned/active 施工。实际且合理的政策是：Owner gate 只阻断最终关闭，不阻断 Agent 在进入 review 前施工或返修。已将文档修正，并以 `test_next_actionable_keeps_owner_gated_work_and_excludes_review_done` 锁定这一边界。

## 未代签事项

本里程碑的 `owner=required` 保持不变，必须由 Owner 在控制台进行最终通过或退回；本复查不替代该决定。
