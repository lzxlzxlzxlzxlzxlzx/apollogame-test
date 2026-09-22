#!/bin/bash
# 收工律钩子（owner 2026-08-06 立·治「干一半就停」通病）
# 会话想结束回合时触发：若有未提交/未推送的活，拦一次并注入收工律自检；
# stop_hook_active=已拦过 → 放行（防死循环）。
set -uo pipefail
INPUT=$(cat 2>/dev/null || echo '{}')
ACTIVE=$(printf '%s' "$INPUT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('stop_hook_active',False))" 2>/dev/null || echo False)
[ "$ACTIVE" = "True" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
DIRTY=$(git status --porcelain 2>/dev/null | wc -l)
git fetch origin claude/mainbranch -q 2>/dev/null || true
AHEAD=$(git rev-list --count origin/claude/mainbranch..HEAD 2>/dev/null || echo 0)
if [ "$DIRTY" -gt 0 ] || [ "$AHEAD" -gt 0 ]; then
  echo "[收工律] 有未提交改动(${DIRTY})或未推送提交(${AHEAD})。停下前自检：①交付清单空了吗 ②门禁绿了吗（退出码直接量） ③提交推送了吗。只有两种情况允许中途交回：A/B 缺口裁决点、复查门（复查人≠施工人）。其余做完再停；禁把可执行项整理成欠账清单交回。若改动确属他人在途文件，说明一句再停。" >&2
  exit 2
fi
exit 0
