"""用户游戏库核心：git 版本化 + design 读写 + meta/scaffold + 列表/历史 + art-derive 壳。"""
import subprocess
import time
import json
import shutil
from pathlib import Path

from .config import _gen_env
from .games_list import _game_cover_url
from .paths import LIBRARY_DIR, _game_dir, _now_iso, _valid_design_relpath, _valid_slug, _write_json
from .pipeline_board import _pipeline_cli
from .sysutil import ROOT, _spawn

# ── 用户游戏库（创作台 v1 地基）──────────────────────────────
# library/<slug>/manifest.json（游戏唯一真相·纯数据）+ meta.json（展示元数据）+ 版本化。
# 版本化：探测到 git 二进制 → 每游戏目录自成一个独立 git 仓（git init + 每次保存 commit）；
#         无 git → snapshots/<ts>.json 降级。library/ 整目录在 .gitignore 里（用户数据不入引擎仓）。
# 安全：一切路径先经 _game_dir 归一化 + 断言在 library/ 子树内（照 handle_asset_import 的防穿越模式，
#       且 slug 白名单 [a-z0-9-] 从根上堵掉 ../ 与斜杠）。所有写操作严格限定 library/ 之下。


# 提交署名走本地 -c（不依赖机器有无全局 git 身份，避免 commit 因缺 user.email 失败）。
_GIT_AUTHOR = ['-c', 'user.name=ZeroCraft Preview', '-c', 'user.email=studio@zerocraft.local']
_GIT_OK = None  # 缓存 git 可用性（写盘前探测一次）。

def _git_ok() -> bool:
    global _GIT_OK
    if _GIT_OK is None:
        _GIT_OK = shutil.which('git') is not None
    return _GIT_OK

def _art_replace_cli(args: list, timeout: int = 300) -> dict:
    """shell scripts/art-replace.mjs → 解析末行 JSON（前面可能有 warn）。
    timeout 缺省 300s（同步端点用·别让 HTTP 请求吊死）；**后台 job 线传 7200**——批量在真 key 下
    本就该跑几十分钟，其上限不该由一次 HTTP 请求的生命周期决定（REQ-ARTPAR 第一步）。"""
    try:
        proc = subprocess.run(**_spawn(['node', 'scripts/art-replace.mjs', *args]), cwd=ROOT, capture_output=True, timeout=timeout, env=_gen_env())
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': '美术工作流超时'}
    out = proc.stdout.decode('utf-8', 'replace').strip()
    line = out.splitlines()[-1] if out else ''
    try:
        return json.loads(line)
    except Exception:
        err = proc.stderr.decode('utf-8', 'replace').strip() or out
        return {'ok': False, 'error': f'解析失败: {err[:400]}'}

def _git_game(game_dir: Path, args: list[str], timeout: int = 15):
    return subprocess.run(['git', *args], cwd=str(game_dir), capture_output=True,
                          encoding='utf-8', errors='replace', timeout=timeout)

def _git_commit_all(game_dir: Path, message: str) -> bool:
    """有 git → init（首次）+ add -A + commit，成功返回 True；无 git / **真失败** → False（调用方走快照降级）。

    ⚠ **退出码必须查**（独立审查 2026-09-12 打回）：首版 init/add/commit 三步一个退出码都不看、
    最后无条件 `return True` —— git 锁冲突、权限错、仓损坏全都被伪装成"版本已保存"。
    版本保存是**回滚的底牌**，假成功等于底牌悄悄没了，比直接报错危险得多。
    唯一该当成功的非零码是 `nothing to commit`（内容没变），其余一律判失败让调用方降级到快照。
    """
    if not _git_ok():
        return False
    if not (game_dir / '.git').exists():
        r = _git_game(game_dir, ['init', '-q'])
        if r.returncode != 0:
            return False
    r = _git_game(game_dir, ['add', '-A'])
    if r.returncode != 0:
        return False
    r = _git_game(game_dir, [*_GIT_AUTHOR, 'commit', '-q', '-m', message])
    if r.returncode != 0:
        # 「没有要提交的东西」= 内容没变，是正常路径；别的非零码都是真失败。
        blob = f'{r.stdout or ""}{r.stderr or ""}'
        if 'nothing to commit' in blob or 'nothing added to commit' in blob or 'no changes added' in blob:
            return True
        return False
    return True

def _snapshot(game_dir: Path, manifest: dict) -> str:
    """快照降级：把当前 manifest 落 snapshots/<ts>.json，返回 rev（文件名 stem）。"""
    snap_dir = game_dir / 'snapshots'
    snap_dir.mkdir(exist_ok=True)
    ts = time.strftime('%Y%m%dT%H%M%S')
    p = snap_dir / f'{ts}.json'
    n = 1
    while p.exists():
        p = snap_dir / f'{ts}-{n}.json'
        n += 1
    p.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return p.stem

def _version_save(game_dir: Path, manifest: dict, message: str) -> str:
    """存一版：git 提交或快照降级，返回 'git' / 'snapshot'。"""
    if _git_commit_all(game_dir, message):
        return 'git'
    _snapshot(game_dir, manifest)
    return 'snapshot'

def _version_save_all(game_dir: Path, message: str) -> str:
    """存一版（不指定 manifest，用于 design 文档改动）：git 提交整目录；无 git → 快照当前 manifest 作版本标记。"""
    if _git_commit_all(game_dir, message):
        return 'git'
    try:
        manifest = json.loads((game_dir / 'manifest.json').read_text(encoding='utf-8'))
    except Exception:
        manifest = {}
    _snapshot(game_dir, manifest)
    return 'snapshot'

def _read_design(game_dir: Path) -> dict:
    """design/ 下所有合法 .md → {相对路径: 内容}（按路径排序·稳定）。"""
    ddir = game_dir / 'design'
    out = {}
    if not ddir.is_dir():
        return out
    for p in sorted(ddir.rglob('*.md')):
        try:
            rel = p.relative_to(ddir).as_posix()
        except Exception:
            continue
        if not _valid_design_relpath(rel):
            continue
        try:
            out[rel] = p.read_text(encoding='utf-8')
        except Exception:
            pass
    return out

def _write_design_file(game_dir: Path, rel: str, content: str) -> None:
    """写单篇 design .md（rel 须已过 _valid_design_relpath）。再断言归一化后仍在 design/ 子树内（纵深防护）。"""
    ddir = (game_dir / 'design').resolve()
    target = (game_dir / 'design' / rel)
    resolved = target.resolve()
    if resolved != ddir and ddir not in resolved.parents:
        raise ValueError(f'design 路径越界: {rel!r}')
    target.parent.mkdir(parents=True, exist_ok=True)
    text = content if content.endswith('\n') else content + '\n'
    target.write_text(text, encoding='utf-8')

def _write_meta(game_dir: Path, name: str, provider: str, overrides: dict | None) -> dict:
    now = _now_iso()
    meta = {
        'name': name,
        'subtitle': '',
        'description': '',  # 一句话玩法（REQ-WORKSHOP C1：立项卡 pitch 的持久位·前端 library-model 已消费）
        'color': '#1e293b',
        'accentColor': '#38bdf8',
        'icon': '🎮',
        'createdAt': now,
        'updatedAt': now,
        'provider': provider,
    }
    if isinstance(overrides, dict):
        meta.update({k: v for k, v in overrides.items() if k in meta and k not in ('createdAt',)})
    _write_json(game_dir / 'meta.json', meta)
    return meta

def _touch_meta(game_dir: Path) -> None:
    p = game_dir / 'meta.json'
    try:
        meta = json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        return
    meta['updatedAt'] = _now_iso()
    _write_json(p, meta)

# match3/dressup 已升级为内置数据游戏（public/games/game-j|game-m/manifest.json·owner 2026-07-10）
# ——装示例位留给未来精选好游戏。

def _preset_manifest(preset: dict) -> dict:
    """PRESET_BLUEPRINTS 条目 → 纯规范 manifest（只留 capabilities + entities，name/描述归 meta）。"""
    return {'capabilities': list(preset.get('capabilities', [])), 'entities': preset.get('entities', {})}

def _scaffold(slug: str, name: str, manifest: dict, provider: str, meta_overrides: dict | None,
              commit_msg: str, pitch: str = '') -> tuple:
    """新建游戏目录：写 manifest + meta，落首个版本。返回 (game_dir, meta, versioned)。"""
    game_dir = _game_dir(slug)
    game_dir.mkdir(parents=True, exist_ok=False)
    _write_json(game_dir / 'manifest.json', manifest)
    meta = _write_meta(game_dir, name, provider, meta_overrides)
    versioned = _version_save(game_dir, manifest, commit_msg)
    try:  # 落库即台账（owner 2026-07-10「为什么老虎机没有美术需求表」→ 机器化：新卡带自动 derive）
        _art_replace_cli(['derive', slug])
    except Exception:
        pass  # 台账推导失败不阻塞建库（打开美术平台仍会自动初始化兜底）
    if pitch:  # 建库即立项卡（REQ-WORKSHOP C1：S1 机器门开箱绿·生产板/Workshop 免手填）
        try:
            _pipeline_cli(['concept', slug, '--name', name, '--pitch', pitch])
        except Exception:
            pass  # 立项卡失败不阻塞建库（生产板 S1 侧栏仍可手填兜底）
    return game_dir, meta, versioned

def _list_library() -> list:
    out = []
    if not LIBRARY_DIR.exists():
        return out
    for d in sorted(LIBRARY_DIR.iterdir()):
        if not d.is_dir() or not _valid_slug(d.name):
            continue
        try:
            meta = json.loads((d / 'meta.json').read_text(encoding='utf-8'))
        except Exception:
            meta = {}
        empty = False
        try:
            mf = json.loads((d / 'manifest.json').read_text(encoding='utf-8'))
            valid = True
            ents = mf.get('entities') if isinstance(mf, dict) else None
            empty = not (isinstance(ents, dict) and len(ents) > 0)  # 空卡带=没生成过玩法内容（07-11：别放行到运行器黑屏）
        except Exception:
            valid = False
        ddir = d / 'design'
        has_design = ddir.is_dir() and any(ddir.rglob('*.md'))
        entry = {'slug': d.name, 'meta': meta, 'valid': valid, 'empty': empty, 'hasDesign': has_design,
                 # TS 例外旗（owner 07-11·记债可见）：allowTs=打了勾；hasLogic=盘上真有 logic.ts
                 'allowTs': bool(meta.get('allowTs')), 'hasLogic': (d / 'logic.ts').is_file()}
        cover = _game_cover_url(d.name)
        if cover:
            entry['coverUrl'] = cover  # AI 文生图封面（若已生成）→ 卡片外观
        out.append(entry)
    return out

def _history(game_dir: Path) -> dict:
    if _git_ok() and (game_dir / '.git').exists():
        r = _git_game(game_dir, ['log', '--format=%H%x1f%s%x1f%cI', '-50'])
        entries = []
        for line in (r.stdout or '').splitlines():
            parts = line.split('\x1f')
            if len(parts) == 3:
                entries.append({'rev': parts[0], 'subject': parts[1], 'date': parts[2]})
        return {'mode': 'git', 'entries': entries}
    entries = []
    snap_dir = game_dir / 'snapshots'
    if snap_dir.exists():
        for p in sorted(snap_dir.glob('*.json'), reverse=True):
            entries.append({'rev': p.stem, 'subject': 'snapshot', 'date': p.stem})
    return {'mode': 'snapshot', 'entries': entries}
