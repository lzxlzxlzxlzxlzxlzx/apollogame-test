"""路径/slug 校验与归一化、库/设计相对路径防护、共享路径常量、引擎 manifest 校验壳。"""
import subprocess
import time
import json
import re
import unicodedata
from pathlib import Path

from .sysutil import ROOT, _spawn

# 内置游戏目录名匹配：连字符可选——`game-e`/`game-103`（带连字符）与 `game101`/`game102`
# （数字槽·无连字符）都算内置游戏（否则 /api/games 枚举漏掉无连字符的数字游戏·平台货架看不到）。
GAME_RE = re.compile(r'game-?[a-z0-9]+')

LIBRARY_DIR = ROOT / 'library'
_SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')

def art_root(slug: str) -> Path:
    """该游戏美术资料库的**磁盘根**（单一真相·REQ-CARTART 2026-08-06）：
      · 创作台卡带（`library/<slug>/` 存在）→ `library/<slug>/art`——随卡带自己的 git 仓版本化
        （`_version_save` 本就 `add -A` 整个卡带目录），**不入引擎仓**，故换图不再与 mainbranch 撞冲突；
      · 内置游戏 → `public/games/<slug>/art`——tracked 出货内容，照旧。
    **URL 契约 `/games/<slug>/art/**` 两者共用**：引擎侧（game-art-load.ts / manifest-game.ts）只认
    URL，存储在哪是伺服细节（server.py `_serve_public_games` + vite `serveLiveGameAssets` 双宿主回退）。
    故台账/索引里的 servedPath **一字不用改**，本迁移零数据格式变更。JS 侧同源实现见 `scripts/art-paths.mjs`。"""
    if (LIBRARY_DIR / slug).is_dir():
        return LIBRARY_DIR / slug / 'art'
    return ROOT / 'public' / 'games' / slug / 'art'

def _valid_slug(slug) -> bool:
    return isinstance(slug, str) and 0 < len(slug) <= 64 and '..' not in slug and _SLUG_RE.match(slug) is not None

def _slugify(name: str) -> str:
    """名称 → slug：ascii 化 + 小写 + 非字母数字折成 '-' + 去首尾/合并连字符。
    转不出字母（中文名等）→ 唯一数字编号 game-001/002…（owner 07-11：库里要有唯一代号，别落光秃秃的 game）。"""
    s = unicodedata.normalize('NFKD', str(name)).encode('ascii', 'ignore').decode('ascii').lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or _next_game_no()

#: 编号占用的四个落点 —— 少扫一个就会发出已被占用的号（见 _next_game_no 的事故说明）。
_GAME_NO_BASES = ('library', 'public/games', 'games', 'docs/design')
#: `game-104` 与 `game104` 是**同一个编号的两种写法**，都算占用。
_GAME_NO_RE = re.compile(r'game-?(\d{2,})')


def _next_game_no() -> str:
    """下一个空闲编号 slug（`game-NNN`）。

    WARN **必须四处全扫、且两种写法都认**（独立审查 2026-09-12 的 P0 症状，复跑挖到的真根因）：
    首版只扫 `library/` 与 `public/games/`，且正则只认带连字符的 `game-(\d{3,})`。
    而本仓**手写**的游戏叫 `game101 / game104 / game211`（不带连字符），住在 `games/` 与 `docs/design/`。
    于是给一个中文名项目建库时，计数器看不见 `docs/design/game104`，转头发出 `game-104` ——
    两个肉眼几乎一样的 slug 同时存在，正是审查方报的「同时出现 game104 和 game-104」。
    （复现：干净库上 `library_create({'name': '测试小游戏'})` 直接吐 `game-104`。）
    """
    top = 0
    for rel in _GAME_NO_BASES:
        base = LIBRARY_DIR if rel == 'library' else ROOT.joinpath(*rel.split('/'))
        if not base.is_dir():
            continue
        for d in base.iterdir():
            m = _GAME_NO_RE.fullmatch(d.name)
            if m:
                top = max(top, int(m.group(1)))
    return f'game-{top + 1:03d}'

def _dedup_slug(base: str) -> str:
    """已存在则加 -2/-3… 后缀直到不冲突。"""
    if not (LIBRARY_DIR / base).exists():
        return base
    i = 2
    while (LIBRARY_DIR / f'{base}-{i}').exists():
        i += 1
    return f'{base}-{i}'

def _game_dir(slug: str) -> Path:
    """resolve library/<slug> 并断言仍在 library/ 子树内；非法 slug / 越界 → ValueError。"""
    if not _valid_slug(slug):
        raise ValueError(f'非法 slug: {slug!r}')
    lib = LIBRARY_DIR.resolve()
    d = (LIBRARY_DIR / slug).resolve()
    if d != lib and lib not in d.parents:
        raise ValueError(f'路径越界（必须在 library/ 下）: {slug!r}')
    return d

def _lib_parts(path: str):
    """'/api/library[/<slug>[/<action>]]' → (slug|None, action|None)。"""
    segs = [s for s in path.split('/') if s]  # ['api','library',...]
    rest = segs[2:]
    if not rest:
        return (None, None)
    if len(rest) == 1:
        return (rest[0], None)
    return (rest[0], rest[1])

# ── design 目录（设计先行流：pitch/systems/content/capability-plan，与游戏同库同 git 版本化）──
# 路径防护：design/ 子树只许 .md；每个路径段字符白名单 [A-Za-z0-9._-]（堵掉 ../ 与斜杠花招）；
# 形状白名单：顶层 <name>.md 或 systems/<name>.md（深度 ≤2，第二层只能在 systems/ 下）。
_DESIGN_SEG_RE = re.compile(r'^[A-Za-z0-9._-]+$')

def _valid_design_relpath(rel) -> bool:
    if not isinstance(rel, str) or not rel or rel != rel.strip():
        return False
    norm = rel.replace('\\', '/')
    if norm.startswith('/') or norm.endswith('/'):
        return False
    segs = norm.split('/')
    if any(s in ('', '.', '..') or not _DESIGN_SEG_RE.match(s) for s in segs):
        return False
    if not norm.endswith('.md'):
        return False
    if len(segs) == 1:
        return True
    if len(segs) == 2:
        return segs[0] == 'systems'
    return False

def _design_parts(path: str):
    """'/api/library/<slug>/design/<rel...>' → (slug, rel) 或 (None, None)。"""
    segs = [s for s in path.split('/') if s]  # ['api','library',slug,'design',...rel]
    if len(segs) >= 5 and segs[0] == 'api' and segs[1] == 'library' and segs[3] == 'design':
        return segs[2], '/'.join(segs[4:])
    return None, None

def _detect_indent(path: Path, default: int = 2) -> int:
    """探测既有 JSON 文件缩进（首个缩进键行的前导空格数·制表符按 2 计）——回写同格式，避免
    整文件重格式化 churn（owner 2026-07-22「换一张替换图 index/台账全文都 diff」；各工具写这些文件
    缩进不一：game-c-art-gen 用 1 空格·pipeline 用 2）。缺省 2（新文件）。"""
    try:
        for line in path.read_text(encoding='utf-8').splitlines():
            stripped = line.lstrip(' \t')
            if stripped.startswith('"') and len(line) > len(stripped):
                return len(line[:len(line) - len(stripped)].replace('\t', '  '))
    except Exception:
        pass
    return default

def _write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=_detect_indent(path)) + '\n', encoding='utf-8')

def _now_iso() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%S')

def _run_manifest_check(manifest: dict) -> tuple:
    """跑引擎真校验（scripts/manifest-check.mjs 子进程）。返回 (ok, message)。"""
    proc = subprocess.run(
        **_spawn(['npx', 'vite-node', 'scripts/manifest-check.mjs']),
        cwd=ROOT, input=json.dumps(manifest, ensure_ascii=False),
        capture_output=True, encoding='utf-8', errors='replace', timeout=120,
    )
    if proc.returncode == 0:
        return True, (proc.stderr or '').strip()
    return False, (proc.stderr or proc.stdout or '校验失败（无输出）').strip()
