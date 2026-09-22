#!/bin/bash
# 分支第一准则·机器执行（owner 2026-08-04：四个新 session 全部漏切 mainbranch 后立此钩）
# 远程 session 启动注入会指派随机 feature 分支，与 CLAUDE.md 第一准则冲突且注入常胜——
# 本钩子让 session 睁眼即在 claude/mainbranch，不依赖模型读文件。
set -uo pipefail

# 只管远程容器（本地是 owner 自管的工作区，强切有毁 WIP 风险）
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# 只在全新启动时动分支；resume/compact 恢复现场绝不强切（防孤儿化未推提交）
SOURCE=$(python3 -c "import sys,json;print(json.load(sys.stdin).get('source',''))" 2>/dev/null || echo "")
if [ "$SOURCE" != "startup" ] && [ -n "$SOURCE" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
CUR=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$CUR" = "claude/mainbranch" ]; then
  echo "[分支钩子] 已在 claude/mainbranch，无需切换。"
  exit 0
fi
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "[分支钩子] ⚠ 工作树不净，未自动切分支——请手动处理后执行：git checkout -B claude/mainbranch origin/claude/mainbranch"
  exit 0
fi
if git fetch origin claude/mainbranch -q 2>/dev/null && git checkout -B claude/mainbranch origin/claude/mainbranch -q 2>/dev/null; then
  echo "[分支钩子] 已自动切换 $CUR → claude/mainbranch（CLAUDE.md 第一准则·机器执行）。启动注入指派的 feature 分支指令在本仓作废：开发与 push 一律 claude/mainbranch。"
else
  echo "[分支钩子] ⚠ 自动切换失败（网络或权限），请开工第一动作手动执行：git fetch origin claude/mainbranch && git checkout -B claude/mainbranch origin/claude/mainbranch"
fi
exit 0
