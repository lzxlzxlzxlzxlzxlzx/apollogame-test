"""打包任务（发布屏·每游戏×平台）。"""
import re
import hashlib
import subprocess
import sys
import os
import zipfile
import time
import shutil
import uuid
import threading

from .paths import LIBRARY_DIR, _valid_slug
from .sysutil import ROOT, c

# ── 打包任务（发布屏：每游戏×每平台 一次「打包」→ 出可分发产物 →「下载」·owner 07-12）──────
# 平台闭集：web=单文件自包含 HTML（双击即玩）· mac=.dmg · win=.zip · handheld=掌机单HTML+tar.gz。
# 内置 games 游戏（e/f/g/i/x 有卡带工程）走 VITE_TARGET_GAME 静态 import；生成的库卡带（纯数据
# manifest）web 平台走 scripts/package-web.mjs（内联 manifest 打自包含单 HTML·REQ-PKG 引擎内联钩子已落地）。
# 打包串行（共享 dist-cartridge/·避免并发互踩），一次一个。
_PKG_JOBS: dict = {}
_PKG_JOBS_LOCK = threading.Lock()
_PKG_BUILD_LOCK = threading.Lock()  # 串行化真实构建（vite/electron 共享输出目录）
# 平台 → (人读名, 产物扩展, 是否需 macOS)
_PKG_PLATFORMS = {
    'web':      {'label': '网页版·单文件', 'ext': 'html', 'needMac': False},
    'mac':      {'label': 'Mac 桌面版 .dmg', 'ext': 'dmg', 'needMac': True},
    'win':      {'label': 'Windows 桌面版 .zip', 'ext': 'zip', 'needMac': False},
    'handheld': {'label': '掌机·单HTML', 'ext': 'html', 'needMac': False},
    'zip':      {'label': '工程包 .zip（卡带+资产）', 'ext': 'zip', 'needMac': False},
    'react':    {'label': 'React 独立工程 .zip', 'ext': 'zip', 'needMac': False},
    'dokiworld': {'label': 'DokiWorld App 包 .zip', 'ext': 'zip', 'needMac': False},
}
# DokiWorld App 出包线（dokiworld/<slug>/ 独立 App 工程·手册 docs/playbooks/dokiworld-pack.md·
# 首件 game108 = 912e03c0）。可用性判据 = 目录里有 package.json；没接入的游戏发布屏明示指引不隐藏。
DOKIWORLD_DIR = ROOT / 'dokiworld'
_DOKI_GUIDE = '未接入 DokiWorld——照 docs/playbooks/dokiworld-pack.md 在 dokiworld/<slug>/ 建 App 工程后此格即通'
# 内置卡带工程游戏（有 games 入口·可打卡带/桌面）——与 scripts/dist.py 的 GAME_META 对齐。
_PKG_BUILTIN_META = {
    'game-e': ('ApolloBalatroDeck', 'com.apollo.gamee'),
    'game-f': ('ApolloPixelKingdoms', 'com.apollo.gamef'),
    'game-g': ('FateflipPoker', 'com.apollo.gameg'),
}
# cartridge-entry 能静态 import 的工程游戏（与其 startLoad 分支一致）——不在此集内的 slug=库卡带（纯数据）。
_CARTRIDGE_ENGINE_GAMES = {'game-e', 'game-f', 'game-g', 'game-i'}

def _pkg_job_update(jid: str, **kw) -> None:
    with _PKG_JOBS_LOCK:
        if jid in _PKG_JOBS:
            _PKG_JOBS[jid].update(kw)

def _pkg_job_view(j: dict) -> dict:
    return {'id': j['id'], 'slug': j['slug'], 'platform': j['platform'],
            'platformLabel': _PKG_PLATFORMS.get(j['platform'], {}).get('label', j['platform']),
            'step': j['step'], 'done': j['done'], 'error': j['error'],
            'artifactName': j.get('artifactName'), 'ready': bool(j.get('artifact') and not j['error']),
            'elapsedSec': int(time.time() - j['startedAt'])}

def _run_pkg_job(jid: str, slug: str, platform: str) -> None:
    """后台打包线程。产物路径落 job['artifact']（绝对路径），下载端点据 jid 取。真实构建串行。"""
    try:
        info = _PKG_PLATFORMS[platform]
        # zip=工程包：任何卡带/内置都能出（内存 zip 逻辑复用 _serve_export 的树规则）——先落到 release/ 供下载。
        if platform == 'zip':
            _pkg_job_update(jid, step=1)
            out = _pkg_build_zip(slug)
            _pkg_job_update(jid, done=True, artifact=str(out), artifactName=out.name); return
        # react=独立工程：tools/export-game.mjs 抽出纯游戏闭包 → 自包含 TS+Vite 工程（含 React 封装）→ zip。
        # 任何有 mount 入口的游戏都可（内置 e/f/g/x + 玩法游戏 a/b/c 等）；无 mount 入口的库卡带会报错指路。
        if platform == 'react':
            _pkg_job_update(jid, step=1)
            out = _pkg_build_export(slug, 'plain')
            _pkg_job_update(jid, done=True, artifact=str(out), artifactName=out.name); return
        # dokiworld=DokiWorld App 包（dokiworld/<slug>/ 独立 App 工程线·REQ-DOKIPACK 首件形态）：
        # app 目录内 npm ci（缺 node_modules 才装）→ npm run build（内部含 manifest 生成+校验）→
        # dist/ 打成 <slug>-dokiworld.zip（zip 根=dist 内容·自包含）。
        if platform == 'dokiworld':
            _pkg_job_update(jid, step=1)
            with _PKG_BUILD_LOCK:  # 串行真实构建（vite 共享缓存）
                out = _pkg_build_dokiworld_app(slug)
            _pkg_job_update(jid, done=True, artifact=str(out), artifactName=out.name); return
        # 单文件/桌面/掌机：现管线只支持内置工程游戏。生成的库卡带 → 明确指路（不伪造产物）。
        is_builtin = slug in _PKG_BUILTIN_META
        if not is_builtin:
            _pkg_job_update(jid, done=True, error=(
                f'「{info["label"]}」暂只支持内置工程游戏（e/f/g/x）。生成的卡带打成独立可运行包需引擎'
                '「从内联 manifest 启动」钩子——已记 requests.md 缺口，落地后此项即通。当前可先下「工程包 .zip」。'))
            return
        if info['needMac'] and sys.platform != 'darwin':
            _pkg_job_update(jid, done=True, error=(
                f'Mac .dmg 需在 macOS 上打包（本机 ={sys.platform}）。在你的 Mac 上跑：'
                f'  python3 scripts/dist.py  → 选 {slug} → Mac .dmg。产物在 release/{slug}/bin/。'))
            return
        with _PKG_BUILD_LOCK:  # 串行真实构建
            _pkg_job_update(jid, step=1)
            out = _pkg_build_platform(slug, platform)
        if not out or not out.exists():
            _pkg_job_update(jid, done=True, error='构建完成但未找到产物文件（见服务端日志）'); return
        _pkg_job_update(jid, done=True, artifact=str(out), artifactName=out.name)
        print(c('  [PKG]', 'g'), f'job {jid} → {slug}/{platform} → {out.name}')
    except subprocess.CalledProcessError as e:
        _pkg_job_update(jid, done=True, error=f'构建失败（退出码 {e.returncode}）：{str(e)[:200]}')
    except Exception as e:
        _pkg_job_update(jid, done=True, error=str(e)[:280])

def _pkg_build_zip(slug: str):
    """工程包 zip（卡带本体+资产·排除 mock/快照）——落 release/<slug>/<slug>.zip 供下载端点取。"""
    lib = LIBRARY_DIR / slug
    pub = ROOT / 'public' / 'games' / slug
    out_dir = ROOT / 'release' / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f'{slug}.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        def _add(root_dir, prefix):
            if not root_dir.is_dir():
                return
            for p in sorted(root_dir.rglob('*')):
                if not p.is_file():
                    continue
                parts = p.relative_to(root_dir).parts
                if '.git' in parts or 'snapshots' in parts or 'mock' in parts:
                    continue
                z.write(p, f'{slug}/{prefix}{p.relative_to(root_dir).as_posix()}')
        _add(lib, '')
        _add(pub, 'assets/' if lib.is_dir() else '')
    return out

# ── 打包出图：超 1080P 的 PNG 同比例缩到框内（owner 2026-07-22）───────────────────
# 口径：等比缩小放进 1920×1080 框（长边≤1920·短边≤1080），只缩不放，仅 PNG。检测零依赖
# （读 IHDR 拿尺寸）；仅当确有超标图才需 Pillow，缺则报错指路（无超标图=完全 no-op）。
_PNG_MAX_W, _PNG_MAX_H = 1920, 1080

def _png_size(path):
    """零依赖读 PNG 宽高（IHDR）。非 PNG/损坏返回 None。"""
    import struct
    try:
        with open(path, 'rb') as f:
            head = f.read(24)
    except OSError:
        return None
    if head[:8] != b'\x89PNG\r\n\x1a\n' or head[12:16] != b'IHDR':
        return None
    return struct.unpack('>II', head[16:24])

def _resize_pngs_in(root):
    """就地把 root 下超 1920×1080 框的 PNG 同比例缩进框内。返回处理张数。"""
    from pathlib import Path
    oversized = []
    for p in Path(root).rglob('*.png'):
        sz = _png_size(str(p))
        if sz and (sz[0] > _PNG_MAX_W or sz[1] > _PNG_MAX_H):
            oversized.append((p, sz))
    if not oversized:
        return 0
    try:
        from PIL import Image
    except ImportError:
        names = ', '.join(p.name for p, _ in oversized[:3])
        raise RuntimeError(
            f'检测到 {len(oversized)} 张超 1080P 的 PNG（{names}…）需缩图，但未装 Pillow → 请 pip install Pillow 后重试。')
    for p, (w, h) in oversized:
        scale = min(_PNG_MAX_W / w, _PNG_MAX_H / h)
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        im = Image.open(p)
        if im.mode in ('P', 'LA'):
            im = im.convert('RGBA')
        im.resize((nw, nh), Image.LANCZOS).save(p, 'PNG', optimize=True)
    return len(oversized)

def _pkg_build_export(slug: str, target: str = 'plain'):
    """独立导出 zip（导出插件架构）：tools/export-game.mjs 追游戏 mount 入口的传递依赖闭包 → 剥掉平台
    （launcher/studio/账号/大厅/Steam/Electron/其它游戏）→ 自包含 TS+Vite 工程（<Game{X}/> React 封装
    + 独立 index.html + 对接说明）→ zip 供下载。target='plain' 出中性 React 工程；target='dokiworld'
    套 DokiWorld 导出插件（协议桥 + 计分注入 + 资源展平）。产物内含 npm i && npm run dev 即可跑的完整源码。"""
    tool = ROOT / 'tools' / 'export-game.mjs'
    if not tool.is_file():
        raise RuntimeError('缺 tools/export-game.mjs（独立导出脚本未就位）')
    suffix = '' if target == 'plain' else f'-{target}'
    label = 'react' if target == 'plain' else target
    work = ROOT / 'release' / slug / f'{label}-src'
    if work.exists():
        shutil.rmtree(work)
    work.parent.mkdir(parents=True, exist_ok=True)
    cmd = ['node', str(tool), slug, '--out', str(work)]
    if target != 'plain':
        cmd += ['--target', target]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        tail = (r.stderr or r.stdout or '').strip().splitlines()[-1:] or ['']
        raise RuntimeError(f'导出失败（target={target}）：{slug}。{tail[0][:200]}')
    _resize_pngs_in(work)  # 打包出图：超 1080P 的 PNG 同比例缩进 1920×1080 框
    out = ROOT / 'release' / slug / f'{slug}{suffix}.zip'
    top = f'{slug}{suffix}'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(work.rglob('*')):
            if not p.is_file():
                continue
            parts = p.relative_to(work).parts
            if 'node_modules' in parts or 'dist' in parts:  # 只打源码，不打依赖/构建产物（mock 已在导出层精确排除·勿在此宽匹配误伤 art/gen/mock 真美术）
                continue
            z.write(p, f'{top}/{p.relative_to(work).as_posix()}')
    return out

# 本地预览启动器（打进 doki-dist zip 根·不进部署目录）：一键把 dist 挂到正确的 /games/<slug>/
# 路径、加 CORS 头、开浏览器——供交付方快速 review，不双击 file:// 踩坑。
_REVIEW_PY_BODY = r'''
import http.server, os, sys, threading, webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
PREFIX = '/games/' + SLUG + '/'

class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = path.split('?', 1)[0].split('#', 1)[0]
        if p == '/' or p == '/index.html':
            p = PREFIX + 'index.html'
        if p.startswith(PREFIX):
            return os.path.join(ROOT, SLUG, *p[len(PREFIX):].split('/'))
        return os.path.join(ROOT, *p.lstrip('/').split('/'))
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        super().end_headers()
    def log_message(self, *a):
        pass

def main():
    port = 8080
    for _ in range(20):
        try:
            httpd = http.server.HTTPServer(('127.0.0.1', port), H)
            break
        except OSError:
            port += 1
    else:
        print('no free port'); sys.exit(1)
    url = 'http://localhost:%d%sindex.html' % (port, PREFIX)
    print('\n  %s  —  serving at:\n  %s\n  (Ctrl+C to stop)\n' % (SLUG, url))
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
'''

def _review_py(slug: str) -> str:
    return 'SLUG = "%s"\n%s\nif __name__ == "__main__":\n    main()\n' % (slug, _REVIEW_PY_BODY)

_REVIEW_BAT = '@echo off\r\ncd /d "%~dp0"\r\npython review.py || py review.py\r\npause\r\n'
_REVIEW_SH = '#!/usr/bin/env bash\ncd "$(dirname "$0")"\nexec python3 review.py\n'

def _review_readme(slug: str) -> str:
    return (
        'DokiWorld cartridge: %s\n\n'
        'PREVIEW LOCALLY (quick review):\n'
        '  - Windows: double-click review.bat\n'
        '  - macOS/Linux: ./review.sh   (or: python3 review.py)\n'
        '  It serves the game at http://localhost:8080/games/%s/index.html and opens your browser.\n'
        '  (Do NOT double-click %s/index.html directly — ES modules + absolute asset paths need\n'
        '   an HTTP server mounted at /games/%s/.)\n\n'
        'DEPLOY:\n'
        '  Copy the %s/ folder into DokiWorld at frontend/public/games/%s/.\n'
        '  Serve its assets with Access-Control-Allow-Origin: * and Cross-Origin-Resource-Policy: cross-origin.\n'
    ) % (slug, slug, slug, slug, slug, slug)

# _pkg_build_export_dist 已随 doki-dist 平台退役删除（2026-08-13·owner「只要一个」·git 历史可寻）
def list_dokiworld_apps() -> list:
    """已接入 DokiWorld App 出包线的 slug（dokiworld/<slug>/package.json 存在=已接入·首件 game108）。"""
    if not DOKIWORLD_DIR.is_dir():
        return []
    return sorted(p.name for p in DOKIWORLD_DIR.iterdir() if p.is_dir() and (p / 'package.json').is_file())

def handle_dokiworld_apps() -> dict:
    """GET /api/package/dokiworld-apps → 发布屏 DokiWorld 列可用性（未接入的格明示指引不隐藏）。"""
    return {'success': True, 'apps': list_dokiworld_apps()}

# 「这一行是**原因**」的形状。分两档挑，**先挑第一档**：
#   一档 = 真正的报错抬头（`Error [CODE]: 说明` / `TypeError: …` / `npm ERR! …`）
#   二档 = 说得出问题但没有抬头的（`… is not defined` / `… failed`）
# 排除档 = 栈帧 `at …`、源码回显 `return new ERR_…(`、光标行 `^`、收尾 `}`。
# ⚠ 排除档不是想出来的：第一版正则把**源码回显那行**（`return new ERR_PACKAGE_PATH_NOT_EXPORTED(`）
#   当成了原因——它确实含 `ERR_` 且排在真原因前面。拿真实 stderr 当夹具才量出来。
_CAUSE_SKIP_RE = re.compile(r'^(?:at\s|return\s|\^|\}|\{|>\s)')
_CAUSE_1_RE = re.compile(r'^(?:npm ERR!|[A-Za-z]*Error\b[^:]*:)')
_CAUSE_2_RE = re.compile(r'\b(?:is not (?:defined|found|exported)|failed|Cannot find|cannot find)\b')

def _pick_cause(lines):
    """从子进程输出里挑出**最像原因**的那一行（挑不到返回 None·不硬凑）。"""
    usable = [ln for ln in lines if not _CAUSE_SKIP_RE.match(ln)]
    return (next((ln for ln in usable if _CAUSE_1_RE.match(ln)), None)
            or next((ln for ln in usable if _CAUSE_2_RE.search(ln)), None))

def _proc_tail(r, n: int = 6) -> str:
    """子进程输出压成一行带回 UI —— **原因在前、尾部在后**，不吞错。

    ⚠ 2026-08-19：旧版只取**最后 n 行**。Node 的报错格式是「先一行原因、再十来行栈帧」，
    于是尾部全是 `at ModuleJob._link (...)` 这种栈帧，而唯一有用的那句
    `Package subpath './runtime-extensions' is not defined by "exports"` 正好被挤掉。
    owner 那次拿到的报错里一个字都没说清是什么问题——排查成本全花在这上面。
    故：先挑出**第一条像"原因"的行**放最前，再接尾部；两者去重。
    """
    txt = ((r.stderr or '') + '\n' + (r.stdout or '')).strip()
    lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
    if not lines:
        return '(无输出)'
    cause = _pick_cause(lines)
    picked = ([cause] if cause else []) + [ln for ln in lines[-n:] if ln != cause]
    return ' / '.join(picked)[:400]

# zip 层产物卫生（手册红线 §9：dist 绝不装源码引用/token/.env——build 已保证·打包前再断言一次）。
_DOKI_SECRET_RE = re.compile(r'sk-ant-[0-9A-Za-z_-]{8,}|sk-proj-[0-9A-Za-z_-]{8,}|ghp_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{8,}')
_DOKI_TEXT_EXTS = {'.html', '.htm', '.js', '.mjs', '.css', '.json', '.txt', '.svg', '.map', '.md'}

def _assert_doki_dist_hygiene(dist, files) -> None:
    """打进 zip 的文件逐个过卫生门：node_modules/.env 零容忍 + 文本文件零 token。违规=硬抛不出包。"""
    for p in files:
        rel = p.relative_to(dist)
        if 'node_modules' in rel.parts:
            raise RuntimeError(f'产物卫生：dist 混入 node_modules（{rel.as_posix()}）——拒绝出包')
        name = p.name.lower()
        if name == '.env' or name.startswith('.env.'):
            raise RuntimeError(f'产物卫生：dist 发现 {rel.as_posix()}（.env 红线）——拒绝出包')
        if p.suffix.lower() in _DOKI_TEXT_EXTS:
            try:
                m = _DOKI_SECRET_RE.search(p.read_text(encoding='utf-8', errors='ignore'))
            except OSError:
                continue
            if m:
                raise RuntimeError(f'产物卫生：{rel.as_posix()} 疑似含密钥（{m.group(0)[:10]}…）——拒绝出包')

def _write_doki_checksums(dist) -> None:
    """发布屏在所有闭包步骤之后重建最终校验清单，避免后复制的文档漏签。"""
    sums = []
    for p in sorted(path for path in dist.rglob('*') if path.is_file()):
        rel = p.relative_to(dist).as_posix()
        if rel == 'SHA256SUMS.txt':
            continue
        sums.append(f'{hashlib.sha256(p.read_bytes()).hexdigest().upper()}  {rel}')
    (dist / 'SHA256SUMS.txt').write_text('\n'.join(sums) + '\n', encoding='utf-8')

_DOKI_STAMP = '.doki-install-stamp'

def _doki_deps_stale(app):
    """node_modules 与 lockfile 脱节了没有；返回**人能读的原因**，None=不用重装。

    ⚠ 2026-08-19 事故：旧判据是 `if not node_modules.is_dir()` —— 只管"有没有装过"，
    **不管装的是不是当前 lockfile 那一版**。于是升了依赖之后，任何**装过一次**的机器
    永远不重装，拿旧依赖去 build。实测表症：SDK ^2.1.0→^3.0.0 之后 owner 那台机器报
    `ERR_PACKAGE_PATH_NOT_EXPORTED`（新代码 import 的子路径在旧 SDK 里不存在），
    而报错里一个字都没提"依赖是旧的"——最难查的那类。

    判法：把 lockfile 的哈希戳在 node_modules 里，对不上就重装。
    没有 lockfile 的仓不判（交给 npm 自己），别把"无从判断"当成"要重装"。
    """
    nm = app / 'node_modules'
    if not nm.is_dir():
        return '缺 node_modules（没装过）'
    lock = app / 'package-lock.json'
    if not lock.is_file():
        return None
    stamp = nm / _DOKI_STAMP
    if not stamp.is_file():
        return 'node_modules 没有安装戳——无从证明它与当前 lockfile 一致（多半是升级前装的）'
    try:
        seen = stamp.read_text(encoding='utf-8').strip()
    except OSError:
        return '安装戳读不出来'
    if seen != hashlib.sha256(lock.read_bytes()).hexdigest():
        return 'package-lock.json 变过（依赖升过版，装着的还是旧的）'
    return None

def _pkg_build_dokiworld_app(slug: str):
    """DokiWorld App 包（dokiworld/<slug>/ 出包线·手册 docs/playbooks/dokiworld-pack.md）：
    app 目录内 npm ci（**node_modules 与 lockfile 脱节就重装**·registry 直连）→ npm run build
    （内部含 manifest 生成+校验+自包含改写）→ dist/ 全量打成
    release/<slug>/<slug>-dokiworld.zip（zip 根=dist 内容·解压即自包含静态包）。
    任一步失败把子进程输出原样抛给 UI。"""
    app = DOKIWORLD_DIR / slug
    if not (app / 'package.json').is_file():
        raise RuntimeError(f'{slug} {_DOKI_GUIDE}')
    stale = _doki_deps_stale(app)
    if stale:
        r = subprocess.run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=app, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f'npm ci 失败（{stale}·退出码 {r.returncode}）：{_proc_tail(r)}')
        lock = app / 'package-lock.json'
        if lock.is_file():
            (app / 'node_modules' / _DOKI_STAMP).write_text(
                hashlib.sha256(lock.read_bytes()).hexdigest(), encoding='utf-8')
    b = subprocess.run(['npm', 'run', 'build'], cwd=app, capture_output=True, text=True)
    if b.returncode != 0:
        raise RuntimeError(f'npm run build 失败（退出码 {b.returncode}）：{_proc_tail(b)}')
    # schemaVersion 3 的调用说明由源码 manifest 单一清单统一刷新进 dist。
    # 这一步故意放在每个 App 自身 build 之后：即使新 App 忘了在 build.mjs 手写复制，发布屏也不会产出旧文档。
    docs = subprocess.run(
        ['node', str(ROOT / 'scripts' / 'dokiworld-docs-export.mjs'), slug],
        cwd=ROOT, capture_output=True, text=True)
    if docs.returncode != 0:
        raise RuntimeError(f'调用说明文档闭包失败（退出码 {docs.returncode}）：{_proc_tail(docs)}')
    dist = app / 'dist'
    missing = [f for f in ('index.html', 'manifest.json') if not (dist / f).is_file()]
    if not dist.is_dir() or missing:
        raise RuntimeError(f'构建完成但 dist/ 缺 {"、".join(missing) or "目录"}（见服务端日志）')
    _write_doki_checksums(dist)
    files = sorted(p for p in dist.rglob('*') if p.is_file())
    _assert_doki_dist_hygiene(dist, files)
    out_dir = ROOT / 'release' / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f'{slug}-dokiworld.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in files:
            z.write(p, p.relative_to(dist).as_posix())
    return out

def _pkg_build_platform(slug: str, platform: str):
    """内置工程游戏的真实构建。web=卡带单文件 HTML；handheld=掌机单HTML；mac/win=electron-builder。"""
    env = os.environ.copy()
    if platform == 'web':
        out_dir = ROOT / 'release' / slug; out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / f'{slug}.html'
        if slug in _CARTRIDGE_ENGINE_GAMES:
            # 工程游戏：VITE_TARGET_GAME 静态 import + 单文件。
            env['VITE_TARGET_GAME'] = slug
            env['VITE_SINGLEFILE'] = '1'
            subprocess.run(['npx', 'tsc', '--noEmit'], cwd=ROOT, check=True)
            subprocess.run(['npx', 'vite', 'build', '--config', 'vite.config.cartridge.ts'],
                           cwd=ROOT, check=True, env=env)
            src = ROOT / 'dist-cartridge' / 'cartridge.html'
            if src.exists():
                shutil.copy2(src, out)
        else:
            # 库卡带（纯数据 manifest）：package-web 内联 manifest → 自包含单 HTML（REQ-PKG 引擎内联钩子）。
            subprocess.run(['node', str(ROOT / 'scripts' / 'package-web.mjs'), slug, str(out)],
                           cwd=ROOT, check=True)
        return out
    if platform == 'handheld':
        subprocess.run([sys.executable, str(ROOT / 'scripts' / 'build_game.py'), slug], cwd=ROOT, check=True)
        html = ROOT / f'apollo-{slug}-rk3562.html'
        out_dir = ROOT / 'release' / slug; out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / html.name
        if html.exists():
            shutil.move(str(html), str(out))
        return out
    if platform in ('mac', 'win'):
        # 先出卡带工程再用 electron-builder 包（与 dist.py 一致）。
        env['VITE_TARGET_GAME'] = slug
        subprocess.run(['npx', 'tsc', '--noEmit'], cwd=ROOT, check=True)
        subprocess.run(['npx', 'vite', 'build', '--config', 'vite.config.cartridge.ts'], cwd=ROOT, check=True, env=env)
        product_name, app_id = _PKG_BUILTIN_META.get(slug, (slug, f'com.apollo.{slug.replace("-", "")}'))
        out_dir = f'release/{slug}/bin'
        flag = '--mac' if platform == 'mac' else '--win'
        subprocess.run(['npx', 'electron-builder', flag, '--config', 'electron-builder.yml',
                        f'-c.directories.output={out_dir}', f'-c.productName={product_name}',
                        f'-c.appId={app_id}'], cwd=ROOT, check=True)
        binp = ROOT / out_dir
        want = '.dmg' if platform == 'mac' else '.zip'
        hits = sorted(binp.rglob(f'*{want}')) if binp.is_dir() else []
        return hits[0] if hits else None
    return None

def handle_package_job_start(body: dict) -> dict:
    """POST /api/package/job。{slug, platform}。凭据前置校验（合法 slug + 已知平台 + 游戏存在）。"""
    slug = str(body.get('slug') or '').strip()
    platform = str(body.get('platform') or '').strip()
    if not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug}'}
    if platform not in _PKG_PLATFORMS:
        if platform in ('doki', 'doki-dist'):  # 2026-08-13 退役墓碑（owner「只要一个」）——防陈旧页面静默走旧线
            return {'success': False, 'error': '旧 DokiWorld 出口已退役——用「🌸 DokiWorld App 包」（官方 SDK 规范线·手册 docs/playbooks/dokiworld-pack.md）；页面若还显示旧按钮请刷新'}
        return {'success': False, 'error': f'未知平台: {platform}（{"/".join(_PKG_PLATFORMS)}）'}
    exists = (LIBRARY_DIR / slug / 'manifest.json').is_file() or (ROOT / 'games' / slug).is_dir() \
        or (ROOT / 'public' / 'games' / slug / 'manifest.json').is_file()
    if not exists:
        return {'success': False, 'error': f'游戏不存在: {slug}'}
    # DokiWorld App 线前置判据（同步拒·不烧后台线程）：未接入 = 明确指引，不伪造产物。
    if platform == 'dokiworld' and not (DOKIWORLD_DIR / slug / 'package.json').is_file():
        return {'success': False, 'error': f'{slug} {_DOKI_GUIDE}'}
    jid = uuid.uuid4().hex[:12]
    with _PKG_JOBS_LOCK:
        for old in sorted(_PKG_JOBS.values(), key=lambda x: x['startedAt'])[:-19]:  # 只留最近 20
            _PKG_JOBS.pop(old['id'], None)
        _PKG_JOBS[jid] = {'id': jid, 'slug': slug, 'platform': platform, 'step': 0,
                          'done': False, 'error': None, 'artifact': None, 'artifactName': None,
                          'startedAt': time.time()}
    threading.Thread(target=_run_pkg_job, args=(jid, slug, platform), daemon=True).start()
    print(c('  [PKG]', 'b'), f'job {jid} start · {slug} · {platform}')
    return {'success': True, 'id': jid}

def handle_package_job_get(jid: str) -> dict:
    with _PKG_JOBS_LOCK:
        j = _PKG_JOBS.get(jid)
        return {'success': True, 'job': _pkg_job_view(j)} if j else {'success': False, 'error': f'任务不存在: {jid}'}
