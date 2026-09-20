from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageStat


ROOT = Path(__file__).resolve().parents[3]
PILOT = ROOT / "experiments" / "game-105-ai-art"
SPEC_PATH = PILOT / "specs" / "card-frame.json"
RAW = PILOT / "candidates" / "card-frame" / "round-01" / "candidate-01.png"
NORMALIZED = PILOT / "normalized" / "card-frame" / "round-01" / "candidate-01-normalized.png"
BASELINES = {
    "desktop": PILOT / "baseline" / "player-card-1280x720.png",
    "narrow": PILOT / "baseline" / "player-card-800x450.png",
}
FORMAL = {
    "public/games/game-105/art/ui/card-frame.png": ROOT / "public/games/game-105/art/ui/card-frame.png",
    "public/games/game-105/art/index.json": ROOT / "public/games/game-105/art/index.json",
    "public/games/game-105/pipeline.json": ROOT / "public/games/game-105/pipeline.json",
}


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def prepare() -> None:
    copies = {
        ROOT / "public/games/game-105/probe/S7-usability-player-card-1280x720.png": BASELINES["desktop"],
        ROOT / "public/games/game-105/probe/S7-usability-player-card-800x450.png": BASELINES["narrow"],
        ROOT / "public/games/game-105/art/ui/card-frame.png": PILOT / "baseline/card-frame-current.png",
    }
    for source, destination in copies.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or sha256(source) != sha256(destination):
            shutil.copy2(source, destination)


def normalize() -> dict[str, object]:
    image = Image.open(RAW).convert("RGB")
    # The built-in generator returned a baked gray checkerboard. Locate the card
    # deterministically from chromatic (rose/gold/plum) border pixels.
    pixels = image.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(image.height):
        for x in range(image.width):
            r, g, b = pixels[x, y]
            if max(r, g, b) - min(r, g, b) >= 34 and r >= g and r >= b:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise RuntimeError("No chromatic card border found; normalization aborted")
    pad = 10
    bounds = (
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(image.width, max(xs) + pad + 1),
        min(image.height, max(ys) + pad + 1),
    )
    cropped = image.crop(bounds).resize((640, 400), Image.Resampling.LANCZOS)
    alpha = Image.new("L", cropped.size, 0)
    # Keep a guaranteed transparent canvas margin so a renderer never samples a
    # clipped opaque edge. The blur stays inside that margin.
    ImageDraw.Draw(alpha).rounded_rectangle((8, 8, 631, 391), radius=31, fill=255)
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.0))
    rgba = cropped.convert("RGBA")
    rgba.putalpha(alpha)
    NORMALIZED.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(NORMALIZED, optimize=True)
    report = {
        "source": str(RAW.relative_to(ROOT)).replace("\\", "/"),
        "output": str(NORMALIZED.relative_to(ROOT)).replace("\\", "/"),
        "operation": "detect chromatic border, crop, resize to 640x400, apply deterministic rounded alpha mask",
        "sourceBounds": list(bounds),
        "warning": "The raw generator output lacked alpha. This normalized derivative is for pilot validation only.",
    }
    write_json(PILOT / "reports/normalization-round-01.json", report)
    return report


def checker_risk(image: Image.Image) -> float:
    rgba = image.convert("RGBA")
    rgb = rgba.convert("RGB")
    alpha = rgba.getchannel("A")
    width, height = rgba.size
    band = max(8, int(min(width, height) * 0.08))
    samples: list[int] = []
    for y in range(height):
        for x in range(width):
            if x >= band and x < width - band and y >= band and y < height - band:
                continue
            if alpha.getpixel((x, y)) < 32:
                continue
            r, g, b = rgb.getpixel((x, y))
            chroma = max(r, g, b) - min(r, g, b)
            if chroma < 16 and 65 <= (r + g + b) / 3 <= 225:
                samples.append(1)
            else:
                samples.append(0)
    return sum(samples) / max(1, len(samples))


def inspect(path: Path, label: str) -> dict[str, object]:
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    checks = spec["checks"]
    issues: list[dict[str, str]] = []
    try:
        with Image.open(path) as opened:
            opened.verify()
        image = Image.open(path).convert("RGBA")
    except Exception as exc:
        return {"label": label, "path": str(path), "passed": False, "issues": [{"code": "parse", "message": str(exc)}]}

    width, height = image.size
    ratio = width / height
    original_mode = Image.open(path).mode
    alpha = image.getchannel("A")
    alpha_extrema = alpha.getextrema()
    has_alpha = "A" in original_mode and alpha_extrema[0] < 255
    if not (spec["aspectRatio"]["min"] <= ratio <= spec["aspectRatio"]["max"]):
        issues.append({"code": "aspect", "message": f"aspect ratio {ratio:.3f} is outside the allowed range"})
    if not has_alpha:
        issues.append({"code": "alpha", "message": f"mode={original_mode}, alpha range={alpha_extrema}; genuine transparency is required"})
    if path.stat().st_size > checks["maxFileBytes"]:
        issues.append({"code": "file-size", "message": "file exceeds byte budget"})

    edge = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(edge)
    draw.rectangle((0, 0, width - 1, height - 1), outline=255, width=max(1, int(min(width, height) * 0.01)))
    edge_alpha = ImageChops.multiply(alpha, edge)
    opaque_outer_edge_ratio = sum(1 for p in edge_alpha.get_flattened_data() if p > 32) / max(1, sum(1 for p in edge.get_flattened_data() if p > 0))
    if opaque_outer_edge_ratio > checks["maxOpaqueOuterEdgeRatio"]:
        issues.append({"code": "outer-edge", "message": f"opaque outer edge ratio {opaque_outer_edge_ratio:.3f} suggests clipped/dirty alpha"})

    safe = spec["safeTextArea"]
    safe_box = (safe["left"], safe["top"], width - safe["right"], height - safe["bottom"])
    safe_rgb = image.convert("RGB").crop(safe_box)
    safe_luma = safe_rgb.convert("L")
    luma_std = ImageStat.Stat(safe_luma).stddev[0]
    edges = safe_luma.filter(ImageFilter.FIND_EDGES)
    edge_mean = ImageStat.Stat(edges).mean[0]
    if luma_std > checks["maxSafeAreaLumaStdDev"]:
        issues.append({"code": "safe-area-variance", "message": f"safe-area luma stddev {luma_std:.2f} is too high"})
    if edge_mean > checks["maxSafeAreaEdgeMean"]:
        issues.append({"code": "safe-area-edges", "message": f"safe-area edge mean {edge_mean:.2f} is too high"})
    risk = checker_risk(image)
    if risk > checks["maxCheckerRisk"]:
        issues.append({"code": "checker-risk", "message": f"visible gray checker risk {risk:.3f} exceeds threshold"})

    return {
        "label": label,
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "passed": not issues,
        "metrics": {
            "mode": original_mode,
            "width": width,
            "height": height,
            "aspectRatio": round(ratio, 4),
            "alphaRange": list(alpha_extrema),
            "fileBytes": path.stat().st_size,
            "opaqueOuterEdgeRatio": round(opaque_outer_edge_ratio, 4),
            "checkerRisk": round(risk, 4),
            "safeAreaLumaStdDev": round(luma_std, 4),
            "safeAreaEdgeMean": round(edge_mean, 4),
        },
        "issues": issues,
    }


def check() -> dict[str, object]:
    results = [inspect(RAW, "raw-generated-candidate"), inspect(NORMALIZED, "normalized-candidate")]
    report = {
        "schemaVersion": 1,
        "spec": "experiments/game-105-ai-art/specs/card-frame.json",
        "method": {
            "parse": "Pillow verify",
            "alpha": "source mode contains alpha and alpha minimum is below 255",
            "outerEdge": "ratio of visible alpha on the outer 1% perimeter",
            "checkerRisk": "low-chroma mid-luma visible pixels within the outer 8% band",
            "safeArea": "luminance standard deviation and FIND_EDGES mean inside the declared text-safe rectangle"
        },
        "candidates": results,
    }
    write_json(PILOT / "reports/technical-check-round-01.json", report)
    return report


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [Path("C:/Windows/Fonts/msyh.ttc"), Path("C:/Windows/Fonts/simhei.ttf")]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def composite_one(name: str, baseline_path: Path, frame: Image.Image, box: tuple[int, int, int, int]) -> Path:
    baseline = Image.open(baseline_path).convert("RGBA")
    x, y, w, h = box
    staged = frame.resize((w, h), Image.Resampling.LANCZOS)
    # Clear the defective source card (including its baked checkerboard) before
    # placing the transparent candidate. This is an offline context mockup, not
    # a pixel-accurate runtime capture.
    ImageDraw.Draw(baseline).rectangle((x, y, x + w, y + h), fill=(92, 34, 61, 255))
    baseline.alpha_composite(staged, (x, y))
    draw = ImageDraw.Draw(baseline)
    scale = baseline.width / 1280
    ink = (74, 38, 62, 255)
    draw.text((x + int(38 * scale), y + int(34 * scale)), "轻松分享", font=font(max(12, int(18 * scale))), fill=ink)
    draw.text((x + int(38 * scale), y + int(68 * scale)), "说一个让你放松的瞬间。", font=font(max(13, int(22 * scale))), fill=ink)
    output = PILOT / "composites" / f"{name}-candidate-01.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    baseline.convert("RGB").save(output, quality=94)
    return output


def composite(report: dict[str, object]) -> list[str]:
    candidate = next(item for item in report["candidates"] if item["label"] == "normalized-candidate")
    if not candidate["passed"]:
        return []
    frame = Image.open(NORMALIZED).convert("RGBA")
    outputs = [
        composite_one("player-card-1280x720", BASELINES["desktop"], frame, (40, 450, 485, 270)),
        composite_one("player-card-800x450", BASELINES["narrow"], frame, (25, 278, 310, 172)),
    ]
    return [str(path.relative_to(ROOT)).replace("\\", "/") for path in outputs]


def finish_report(technical: dict[str, object], composites: list[str]) -> None:
    raw = technical["candidates"][0]
    normalized = technical["candidates"][1]
    result = {
        "pilot": "Pilot 1 / round 01 / card frame",
        "sourceIsRealGeneratedAsset": True,
        "rawVerdict": "reject" if not raw["passed"] else "pass",
        "normalizedVerdict": "provisional-pass" if normalized["passed"] else "reject",
        "issues": [
            {
                "severity": "P0",
                "asset": "round-01-candidate-01",
                "problem": "The built-in generator returned RGB with a baked checkerboard instead of genuine alpha.",
                "evidence": raw["metrics"],
                "promptPatch": "Return actual transparent pixels outside the card. Do not visualize transparency with any checkerboard. Output RGBA PNG and keep every canvas-edge pixel fully transparent."
            },
            {
                "severity": "P1",
                "asset": "round-01-candidate-01-normalized",
                "problem": "Decorative moon/star symbols conflict with the no-icons constraint and may be too prominent for a stretch-safe frame.",
                "promptPatch": "Remove all moon and star symbols. Keep only abstract restrained corner filigree; leave the long edge middles plain and repeatable."
            },
            {
                "severity": "P1",
                "asset": "offline-composites",
                "problem": "The offline mockup replaces the defective image region but does not reconstruct the original input and button layers, so control fit cannot be accepted from these composites.",
                "promptPatch": "No image-generation patch. If the owner selects this direction, validate controls in the isolated runtime-preview step before proposing any formal replacement."
            }
        ],
        "composites": composites,
        "decision": "The raw candidate is not eligible. The normalized derivative may be reviewed only as a composition experiment; it must not enter runtime or formal approval.",
        "nextRoundPromptPatch": [
            "actual RGBA transparency, all canvas-edge pixels alpha 0",
            "no transparency-grid visualization",
            "no moon, stars, hearts, icons, glyphs, letters or digits",
            "plain stretch-safe long-edge middles",
            "quieter rose-gold border and larger untextured center"
        ]
    }
    write_json(PILOT / "reports/initial-review-round-01.json", result)


def verify_formal_hashes() -> bool:
    before = json.loads((PILOT / "reports/formal-hashes-before.json").read_text(encoding="utf-8"))
    after = {key: sha256(path) for key, path in FORMAL.items()}
    unchanged = before["files"] == after
    write_json(PILOT / "reports/formal-hashes-after.json", {
        "algorithm": "SHA256",
        "files": after,
        "matchesBefore": unchanged,
    })
    return unchanged


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["prepare", "normalize", "check", "composite", "verify", "all"])
    args = parser.parse_args()
    if args.command in {"prepare", "all"}:
        prepare()
    if args.command in {"normalize", "all"}:
        normalize()
    technical = None
    if args.command in {"check", "composite", "all"}:
        technical = check()
    composites: list[str] = []
    if args.command in {"composite", "all"}:
        composites = composite(technical)
        finish_report(technical, composites)
    unchanged = True
    if args.command in {"verify", "all"}:
        unchanged = verify_formal_hashes()
    if args.command == "all":
        normalized_passed = technical["candidates"][1]["passed"]
        if not normalized_passed or not composites or not unchanged:
            raise SystemExit(1)
        print(f"PASS: normalized candidate passed; composites={len(composites)}; formal files unchanged={unchanged}")
    elif args.command == "verify" and not unchanged:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
