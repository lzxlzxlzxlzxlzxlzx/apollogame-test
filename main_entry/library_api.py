"""库端点（返回 (status,data) 供 APIHandler 分派）+ 卡带统计。"""
import subprocess
import json
import shutil
import re

from .blueprints import PRESET_BLUEPRINTS
from .library import _art_replace_cli, _write_meta, _git_commit_all, _git_game, _git_ok, _history, _list_library, _preset_manifest, _read_design, _scaffold, _snapshot, _touch_meta, _version_save, _version_save_all, _write_design_file
from .paths import LIBRARY_DIR, _dedup_slug, _game_dir, _lib_parts, _run_manifest_check, _slugify, _valid_design_relpath, _valid_slug, _write_json
from .sysutil import ROOT, _spawn, c
from .workshop_store import _WORKSHOP_CHATS_DIR

# ── 库端点（返回 (status, data) 元组，供 APIHandler 分派）──

def library_get(path: str) -> tuple:
    slug, action = _lib_parts(path)
    if slug is None:
        return (200, _list_library())
    game_dir = _game_dir(slug)  # 校验 slug / 防越界（非法 → ValueError → 400）
    if not game_dir.is_dir():
        return (404, {'error': f'游戏不存在: {slug}'})
    if action == 'manifest':
        try:
            return (200, json.loads((game_dir / 'manifest.json').read_text(encoding='utf-8')))
        except FileNotFoundError:
            return (404, {'error': 'manifest 不存在'})
        except Exception as e:
            return (400, {'error': f'manifest 解析失败: {e}'})
    if action == 'history':
        return (200, _history(game_dir))
    if action == 'design':
        return (200, {'files': _read_design(game_dir)})
    return (404, {'error': f'未知库端点: {path}'})

def library_design_put(slug: str, rel: str, body: dict) -> tuple:
    """PUT /api/library/<slug>/design/<rel>：写单篇 design .md + commit（note 可选）。仅 .md·路径防护。"""
    game_dir = _game_dir(slug)
    if not game_dir.is_dir():
        return (404, {'success': False, 'error': f'游戏不存在: {slug}'})
    if not _valid_design_relpath(rel):
        return (400, {'success': False, 'error': f'非法 design 路径（仅 .md·顶层或 systems/ 子目录）: {rel!r}'})
    content = body.get('content')
    if not isinstance(content, str):
        return (400, {'success': False, 'error': 'content 必须是字符串'})
    _write_design_file(game_dir, rel, content)
    _touch_meta(game_dir)
    versioned = _version_save_all(game_dir, str(body.get('note') or f'design: {rel}'))
    return (200, {'success': True, 'slug': slug, 'path': rel, 'versioned': versioned})

def library_delete(slug: str) -> tuple:
    """DELETE /api/library/<slug>。删卡带（owner 07-11）：library/<slug> + public/games/<slug> + 工坊对话历史。
    只删**库卡带**——slug 不在 library/ 下（引擎内置游戏）一律 404，永远删不到源码游戏。不可恢复，前端必须确认。"""
    game_dir = _game_dir(slug)  # 防越界（非法 → ValueError → 400）
    if not game_dir.is_dir():
        return (404, {'success': False, 'error': f'卡带不存在（引擎内置游戏不可删）: {slug}'})
    removed = []
    shutil.rmtree(game_dir, ignore_errors=True)
    removed.append(f'library/{slug}')
    pub = ROOT / 'public' / 'games' / slug
    if pub.is_dir():
        shutil.rmtree(pub, ignore_errors=True)
        removed.append(f'public/games/{slug}')
    chat = _WORKSHOP_CHATS_DIR / f'{slug}.json'
    if chat.is_file():
        chat.unlink()
        removed.append('workshop-chats')
    print(c('  [LIB]', 'y'), f'删除卡带 {slug} · {"+".join(removed)}')
    return (200, {'success': True, 'slug': slug, 'removed': removed})

def _is_empty_shell(slug: str) -> bool:
    """这个 slug 是不是「上一次建库失败留下的空壳」——复用它之前必须过的四道。

    **「零实体 = 空壳」是不够的**（独立审查 2026-09-12 第二轮打回的正确意见）：DesignStudio 的
    正常流程就是「先建库 → 讨论 → 落 design/*.md → 以后才有实体」。只看实体数，会把一个
    作者刚写完设计稿、还没摆实体的真项目判成垃圾，然后**把它的 meta 覆盖掉**。所以四道全过才算空壳：
      ① manifest 读得出来 ② 零实体 ③ 零能力 ④ **零设计稿**（`design/` 下没有任何 .md）。
    ③④ 任一非空，就说明有人真往里放过东西 —— 那不是失败残骸，照旧 dedup 另起一个。
    """
    if not _valid_slug(slug):
        return False
    d = LIBRARY_DIR / slug
    if not d.is_dir():
        return False
    try:
        mf = json.loads((d / 'manifest.json').read_text(encoding='utf-8'))
    except Exception:
        return False
    ents = mf.get('entities')
    if isinstance(ents, dict) and len(ents) > 0:
        return False
    caps = mf.get('capabilities')
    if isinstance(caps, (list, tuple)) and len(caps) > 0:
        return False
    ddir = d / 'design'
    if ddir.is_dir() and any(p.suffix == '.md' for p in ddir.rglob('*') if p.is_file()):
        return False
    return True


def _reusable_shell_for(name: str) -> str | None:
    """同名项目里，有没有一个可复用的空壳（返回它的 slug）。

    **为什么按名字找、不按 slug 找**（独立审查 2026-09-12 第二轮实测复现的缺陷）：
    中文名走 `_slugify` 会落到 `_next_game_no()`，而那个函数**每次调用都发一个新号**。
    于是「建库 → 存 manifest 失败 → 作者点重试」时，两次的 `base` 根本不是同一个字符串
    （测试小游戏 → `game-212`，重试 → `game-213`），`_is_empty_shell(base)` 永远为假，
    复用逻辑形同不存在 —— 英文名能复用、中文名一路生孤儿，正是复现出来的样子。
    按 `meta.name` 找就与 slug 怎么派生无关了。多个同名空壳取 slug 最小的那个（确定性）。
    """
    if not name or not LIBRARY_DIR.is_dir():
        return None
    for d in sorted(LIBRARY_DIR.iterdir(), key=lambda p: p.name):
        if not d.is_dir() or not _valid_slug(d.name):
            continue
        try:
            meta = json.loads((d / 'meta.json').read_text(encoding='utf-8'))
        except Exception:
            continue
        if str(meta.get('name') or '').strip() != name:
            continue
        if _is_empty_shell(d.name):
            return d.name
    return None


def library_create(body: dict) -> tuple:
    name = str(body.get('name') or '').strip()
    if not name:
        return (400, {'success': False, 'error': 'name 必填'})
    template = body.get('template')
    if template and template in PRESET_BLUEPRINTS:
        manifest = _preset_manifest(PRESET_BLUEPRINTS[template])
    else:
        manifest = {'capabilities': [], 'entities': {}}
    # 一句话玩法（REQ-WORKSHOP C1）：一处来源两处受益——meta.description（卡带架副标题）+ concept.pitch（S1 立项卡）。
    desc = str(body.get('description') or '').strip()[:300]
    meta_over = dict(body.get('meta') or {})
    if desc:
        meta_over['description'] = desc

    # ⚠ **重试不许再生一个孤儿**（独立审查 2026-09-12 两轮打回）：前端的「建库 → 存 manifest」是两步，
    # 第二步失败后作者点重试，首版每次都 `_dedup_slug` 造一个新 slug ⇒ 一串 `xxx-2` / `xxx-3` 空项目。
    # 真正的事务化 API（requestId + 一次调用落两件）是接口级改动，得 owner 定形状；这里治症状：
    # 同名项目已存在**且是可复用空壳**就复用它，而不是另起炉灶。非空的同名项目照旧 dedup（作者真想要第二个）。
    # 第二轮修的两处：① 按**名字**找空壳（中文名的 slug 每次都不同，按 slug 找等于没找·见 _reusable_shell_for）
    # ② 「空壳」的判据从「零实体」收紧到「零实体 + 零能力 + 零设计稿」（别把刚写完设计稿的真项目当残骸覆盖）。
    # 先按**名字**找可复用的空壳（与 slug 怎么派生无关——中文名的 slug 每次都不一样，见 _reusable_shell_for）。
    existing = _reusable_shell_for(name)
    if existing is not None:
        slug, reused = existing, True
    else:
        base = _slugify(name)
        slug = base if _is_empty_shell(base) else _dedup_slug(base)
        reused = slug == base and _is_empty_shell(base)
    if reused:
        _write_meta(_game_dir(slug), name, str(body.get('provider') or 'user'), meta_over)
        meta = json.loads((_game_dir(slug) / 'meta.json').read_text(encoding='utf-8'))
        versioned = _version_save(_game_dir(slug), manifest, 'create (reuse empty shell)')
    else:
        _, meta, versioned = _scaffold(slug, name, manifest, str(body.get('provider') or 'user'),
                                       meta_over, 'create', pitch=desc)
    return (200, {'success': True, 'slug': slug, 'meta': meta, 'versioned': versioned, 'reused': reused})

def library_install_sample(body: dict) -> tuple:
    """装官方示例卡带。preset='all'（或缺省）=全套幂等安装（已存在的跳过）；指定单个 preset 也幂等。
    slug 取 preset 首选名（platformer/pong 现无首选名覆盖），无首选名回退 sample-<preset>。"""
    preset_name = str(body.get('preset') or 'all')
    names = list(PRESET_BLUEPRINTS) if preset_name == 'all' else [preset_name]
    if any(n not in PRESET_BLUEPRINTS for n in names):
        return (400, {'success': False, 'error': f'未知 preset: {preset_name}（可选: all, {", ".join(PRESET_BLUEPRINTS)}）'})
    installed, skipped = [], []
    for n in names:
        preset = PRESET_BLUEPRINTS[n]
        slug = preset.get('slug') or _slugify(f'sample-{n}')
        if _game_dir(slug).is_dir():  # 幂等：已装过不重装不重号
            skipped.append(slug)
            continue
        _scaffold(slug, preset.get('name', n), _preset_manifest(preset), 'sample',
                  {'description': str(preset.get('description') or '')}, f'install sample {n}',
                  pitch=str(preset.get('description') or ''))
        installed.append(slug)
    return (200, {'success': True, 'installed': installed, 'skipped': skipped, 'slug': (installed + skipped)[0] if (installed or skipped) else None})

def library_put_manifest(slug: str, body: dict) -> tuple:
    game_dir = _game_dir(slug)
    if not game_dir.is_dir():
        return (404, {'success': False, 'error': f'游戏不存在: {slug}'})
    manifest = body.get('manifest')
    if not isinstance(manifest, dict):
        return (400, {'success': False, 'error': 'manifest 必须是对象 { capabilities, entities }'})
    ok, msg = _run_manifest_check(manifest)  # 先校验
    if not ok:
        return (400, {'success': False, 'error': msg})  # 校验错误文本（供回喂 LLM 修）
    _write_json(game_dir / 'manifest.json', manifest)  # 后落盘
    _touch_meta(game_dir)
    versioned = _version_save(game_dir, manifest, str(body.get('note') or 'update'))
    try:  # PUT 即台账刷新（REQ-WORKSHOP C1：manifest 变了美术需求跟着变·mergeLedger append-only 保号不伤已钉行）
        _art_replace_cli(['derive', slug])
    except Exception:
        pass  # 刷新失败不阻塞落盘（美术平台打开时客户端 derive 兜底仍在）
    # warnings 统一成**数组**（前端逐条渲染；首版是整块字符串，调用方只能整段丢或整段贴）。
    warn_lines = [ln for ln in (msg or '').strip().splitlines() if ln.strip()]
    return (200, {'success': True, 'slug': slug, 'versioned': versioned,
                  'warnings': warn_lines, 'versionedMode': versioned})

def library_rollback(slug: str, body: dict) -> tuple:
    game_dir = _game_dir(slug)
    if not game_dir.is_dir():
        return (404, {'success': False, 'error': f'游戏不存在: {slug}'})
    rev = str(body.get('rev') or '').strip()
    if not rev:
        return (400, {'success': False, 'error': 'rev 必填'})
    if _git_ok() and (game_dir / '.git').exists():
        if not re.match(r'^[0-9a-fA-F]{7,40}$', rev):
            return (400, {'success': False, 'error': f'非法 git rev: {rev!r}'})
        r = _git_game(game_dir, ['checkout', rev, '--', 'manifest.json'])
        if r.returncode != 0:
            return (400, {'success': False, 'error': f'git checkout 失败: {(r.stderr or "").strip()[:300]}'})
        _touch_meta(game_dir)
        _git_commit_all(game_dir, f'rollback to {rev}')
        return (200, {'success': True, 'slug': slug, 'rev': rev, 'mode': 'git'})
    # 快照降级：从 snapshots/<rev>.json 恢复。
    if not re.match(r'^[0-9A-Za-z\-T]+$', rev):
        return (400, {'success': False, 'error': f'非法快照 rev: {rev!r}'})
    snap = game_dir / 'snapshots' / f'{rev}.json'
    if not snap.is_file():
        return (404, {'success': False, 'error': f'快照不存在: {rev}'})
    try:
        manifest = json.loads(snap.read_text(encoding='utf-8'))
    except Exception as e:
        return (400, {'success': False, 'error': f'快照解析失败: {e}'})
    _write_json(game_dir / 'manifest.json', manifest)
    _touch_meta(game_dir)
    _snapshot(game_dir, manifest)
    return (200, {'success': True, 'slug': slug, 'rev': rev, 'mode': 'snapshot'})

def _run_bench(manifest: dict) -> tuple:
    """跑 scripts/bench-manifest.mjs 子进程（vite-node·引擎真 ZeroCraftBench 五轴）。返回 (ok, data|error)。"""
    proc = subprocess.run(
        **_spawn(['npx', 'vite-node', 'scripts/bench-manifest.mjs']),
        cwd=ROOT, input=json.dumps(manifest, ensure_ascii=False),
        capture_output=True, encoding='utf-8', errors='replace', timeout=60,
    )
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout or '体检失败（无输出）').strip()
    try:
        # CLI 只在末行输出机读 JSON（stdout 干净）。
        return True, json.loads((proc.stdout or '').strip().splitlines()[-1])
    except Exception as e:
        return False, f'体检输出解析失败: {e}（{(proc.stdout or "")[:200]}）'

def library_bench(slug: str) -> tuple:
    """POST /api/library/<slug>/bench：读该卡带 manifest → CLI 五轴体检 → 透传 {score, pass, axes, ...}。"""
    game_dir = _game_dir(slug)
    if not game_dir.is_dir():
        return (404, {'success': False, 'error': f'游戏不存在: {slug}'})
    try:
        manifest = json.loads((game_dir / 'manifest.json').read_text(encoding='utf-8'))
    except Exception as e:
        return (400, {'success': False, 'error': f'manifest 读取失败: {e}'})
    ok, data = _run_bench(manifest)
    if not ok:
        return (400, {'success': False, 'error': data})
    return (200, {'success': True, **data})

def handle_library_stats(slug: str) -> dict:
    """GET /api/library/<slug>/stats。卡带体量一览（owner 07-11「游戏该有个代码统计」）：
    游戏=纯数据——统计的是 manifest/设计稿/台账这些文本工件的文件数与行数（.git/snapshots 不计；
    二进制只计文件数不计行）。"""
    if not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug or "(空)"}'}
    lib = LIBRARY_DIR / slug
    pub = ROOT / 'public' / 'games' / slug
    if not lib.is_dir() and not pub.is_dir():
        return {'success': False, 'error': f'游戏不存在: {slug}'}
    text_ext = {'.json', '.md', '.txt', '.csv'}
    out = {'files': 0, 'lines': 0, 'bytes': 0, 'breakdown': []}
    for base, label in ((lib, 'library'), (pub, 'assets')):
        if not base.is_dir():
            continue
        for f in sorted(base.rglob('*')):
            if not f.is_file():
                continue
            parts = f.relative_to(base).parts
            if '.git' in parts or 'snapshots' in parts:
                continue
            out['files'] += 1
            try:
                out['bytes'] += f.stat().st_size
            except OSError:
                pass
            if f.suffix.lower() in text_ext:
                try:
                    n_lines = f.read_text('utf-8', errors='replace').count('\n') + 1
                except Exception:
                    continue
                out['lines'] += n_lines
                out['breakdown'].append({'path': f'{label}/{f.relative_to(base).as_posix()}', 'lines': n_lines})
    out['breakdown'] = sorted(out['breakdown'], key=lambda x: -x['lines'])[:20]
    return {'success': True, 'slug': slug, **out}
