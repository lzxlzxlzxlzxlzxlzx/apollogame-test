"""Reviewable GAL roadmap synchronization.

The preview path is read-only. The apply path writes the file-backed project
console through its validator; neither path may perform an Owner decision.
"""

import argparse
import hashlib
import sys
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from main_entry.project_roadmap import (  # noqa: E402
    load,
    normalize_auto_closure,
    save,
    validate,
)


PROJECT_ID = "galgame-generation-engine"
ROADMAP = ROOT / "docs/projects" / PROJECT_ID / "project-roadmap.json"
EXPECTED_SHA256 = "dbaefb676a83cb41cac73c37651a2fe58bdec0f700c8a3c82fd5d2f72b8442c7"


def evidence(kind: str, ref: str, label: str) -> dict:
    return {"kind": kind, "ref": ref, "label": label}


UPDATES = {
    "ui-gallery-geometry-closure": {
        "status": "review",
        "description": (
            "GAL-UI-03C 已由非施工者独立签局部 S4 几何 PASS：回想/CG 网格、卡片与底栏"
            "按 1440×900 定稿 V2 收敛，原约 11px 顶距偏差关闭；不代签 S5/S6 视觉与演出。"
        ),
        "gates": {"selfCheck": "pass", "review": "pass", "owner": "not-required"},
        "evidence": [
            evidence("review", "docs/design/galgame/review/GAL-UI-03C.md", "03C 画廊几何独立复查"),
            evidence("document", "docs/design/galgame/gal-ui-03c-geometry-diff.md", "03C 同画布几何差异"),
        ],
    },
    "ui-settings-confirmations": {
        "status": "active",
        "description": (
            "C1 已由 Owner 选通用 Profile 与迁移；05A 确认政策、PUI Toggle.disabled、"
            "04A 四页设置/六确认接线及 04C 的 S4 几何均获局部独立 PASS。"
            "仍待恢复默认、未接音频/画面功能、正式退出宿主行为与 V2 S5/S6 全项验收；"
            "局部通过不等于本里程碑完成。"
        ),
        "evidence": [
            evidence("review", "docs/design/galgame/review/GAL-ENG-05A.md", "05A 通用确认政策复查"),
            evidence("review", "docs/design/galgame/review/GAL-PUI-04A.md", "Toggle.disabled 复查"),
            evidence("review", "docs/design/galgame/review/GAL-UI-04A.md", "04A 四页设置与确认局部复查"),
            evidence("review", "docs/design/galgame/review/GAL-UI-04C.md", "04C 设置几何复查"),
        ],
    },
    "replay-save-preview-auto": {
        "status": "active",
        "description": (
            "06A 自动/已读跳过调度、06B 非权威预览 sidecar、06C 隔离回想重播均获"
            "局部独立 PASS。下一步是正式截图采集与真实存储适配、跨会话存读档复验、"
            "V2 视觉/交互收敛；06B 现仍用测试色块，不能宣称完整缩略图体验。"
        ),
        "evidence": [
            evidence("review", "docs/design/galgame/review/GAL-ENG-06A.md", "06A 自动与跳过独立复查"),
            evidence("review", "docs/design/galgame/review/GAL-ENG-06B.md", "06B 非权威预览独立复查"),
            evidence("review", "docs/design/galgame/review/GAL-ENG-06C.md", "06C 隔离回想独立复查"),
        ],
    },
    "media-and-final-skin": {
        "status": "active",
        "description": (
            "8 张 V2 demo 单件原图已审计登记，GAL 稳定 assetKey 消费与 PUI S1–S4"
            "局部接口/消费复查在档。S5 差异单仍为 CONCERNS：ghost 胶囊底/悬停、"
            "部分亮主题对比度、设置/确认/槽卡细节未 1:1；BGM、语音、视频、"
            "转场关键帧和 S6 时序仍未完成。demo 背景/立绘/CG 不作新作品隐式内容。"
        ),
        "evidence": [
            evidence("review", "docs/design/galgame/review/GAL-ART-01A-S4-consumer.md", "S4 GAL 素材消费局部复查"),
            evidence("document", "docs/design/galgame/gal-art-01a-s5-diff.md", "S5 同画布未闭差异"),
            evidence("artifact", "public/games/gal-template/art/index.json", "V2 demo 单件素材索引"),
        ],
    },
    "draft-review-contract": {
        "status": "active",
        "description": (
            "P0–P4 DraftEnvelope、稳定 ID、规范指纹、审核事件 reducer 与上下游失效"
            "纯数据合同已获 GAL-PIPE-01A 局部独立 PASS；尚无正式审计持久化、"
            "权限/并发边界、写作项目适配或 P5–P9 装配，不得称完整产线审核门完成。"
        ),
        "evidence": [
            evidence("review", "docs/design/galgame/review/GAL-PIPE-01A.md", "P0–P4 纯合同独立复查"),
            evidence("artifact", "src/authoring/gal-draft-types.ts", "草稿信封与审核事件类型"),
        ],
    },
    "ui-core-slice": {
        "evidence": [
            evidence("review", "docs/design/galgame/review/GAL-UI-03D.md", "4×3 槽卡 S4 几何复查"),
            evidence("review", "docs/design/galgame/review/GAL-UI-03E.md", "剧情对话 S4 几何复查"),
        ],
    },
}


def make_candidate(current: dict) -> dict:
    result = deepcopy(current)
    by_id = {item["id"]: item for item in result["milestones"]}
    for milestone_id, update in UPDATES.items():
        item = by_id[milestone_id]
        for field in ("status", "description", "gates"):
            if field in update:
                item[field] = deepcopy(update[field])
        refs = {entry["ref"] for entry in item["evidence"]}
        for entry in update.get("evidence", []):
            if entry["ref"] not in refs:
                item["evidence"].append(deepcopy(entry))
                refs.add(entry["ref"])
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preview", action="store_true", help="Read-only validation and change summary")
    mode.add_argument("--apply", action="store_true", help="Persist progress without approving Owner gates")
    args = parser.parse_args()

    actual_sha = hashlib.sha256(ROADMAP.read_bytes()).hexdigest()
    if actual_sha != EXPECTED_SHA256:
        print(f"REFUSED: roadmap changed; expected {EXPECTED_SHA256}, actual {actual_sha}")
        return 2
    current = load(PROJECT_ID)
    candidate = make_candidate(current)
    issues = validate(candidate, current)
    if issues:
        print(f"REFUSED: invalid candidate: {issues}")
        return 3
    normalized, auto_closed = normalize_auto_closure(candidate)
    print(f"project={PROJECT_ID} proposedChanges={len(UPDATES)} autoClosedOnSave={auto_closed}")
    old = {item["id"]: item for item in current["milestones"]}
    for item in candidate["milestones"]:
        previous = old[item["id"]]
        if item != previous:
            print(
                f"{item['id']}: {previous['status']} -> {item['status']}; "
                f"evidence {len(previous['evidence'])} -> {len(item['evidence'])}"
            )
    if args.preview:
        print("PREVIEW ONLY: no file was written")
        return 0
    result = save(PROJECT_ID, candidate)
    if not result.get("success"):
        print(f"SAVE FAILED: {result.get('diagnostics')}")
        return 4
    print(f"SAVED: autoClosed={result.get('autoClosed')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
