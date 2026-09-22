"""API 服务器（APIHandler 分派器）+ start_api_server + API_PORT（写穿透属主）。"""
import io
import os
import zipfile
import json
import re
import threading
import urllib.request
import urllib.parse
from pathlib import Path
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler

from .agent_chat import handle_agent_chat
from .art_replace import handle_art_batch, handle_art_derive, handle_art_ledger, handle_art_packs, handle_art_replace, handle_art_style_save, handle_art_style_delete
from .art_review import handle_asset_pending, handle_asset_review
from .art_jobs import handle_art_job_get, handle_art_jobs_list
from .art_sync import handle_art_cleanup_mock, handle_art_sync, handle_art_sync_status
from .artbrowser import handle_artbrowser_consumers, handle_artbrowser_history, handle_artbrowser_restore, handle_artbrowser_tree, resolve_history_blob
from .asset_annotate import handle_asset_autotag
from .assets import handle_asset_generate, handle_asset_generate_providers, handle_asset_import, handle_asset_matte, handle_asset_vendor
from .blueprints import PRESET_BLUEPRINTS
from .claude_code import handle_llm_live
from .config import _features
from .design_drafts import _draft_id_from_path, design_draft_delete, design_draft_get, design_draft_list, design_draft_put
from .design_ingest import design_preview_path, handle_design_finalize, handle_design_ingest, handle_design_ledger_get, handle_design_ui_brief
from .games_list import handle_catalog, handle_game_cover_generate, handle_games_list
from .generate_api import handle_generate
from .groups import handle_matlib_groups_get, handle_matlib_groups_put
from .artifacts import handle_artifacts_status, handle_artifacts_sync
from .job_board import handle_job_board
from .jobs import handle_generate_job_get, handle_generate_job_start, handle_generate_jobs_list
from .library_api import handle_library_stats, library_bench, library_create, library_delete, library_design_put, library_get, library_install_sample, library_put_manifest, library_rollback
from .llm_log import handle_llm_logs
from .llm_transport import get_available_providers
from .packaging import _PKG_JOBS, _PKG_JOBS_LOCK, handle_dokiworld_apps, handle_package_job_get, handle_package_job_start
from .paths import LIBRARY_DIR, _design_parts, _lib_parts, _valid_slug
from .pipeline_board import handle_pipeline_board, handle_pipeline_concept, handle_pipeline_gate, handle_pipeline_orch_abort, handle_pipeline_orch_dispatch, handle_pipeline_orch_status, handle_pipeline_signoff, handle_pipeline_wizard_concept
from .placeholder import handle_art_resolve
from .projects import handle_project_save
from .protocols import handle_capgaps_list
from .settings_api import handle_settings_get, handle_settings_put, handle_settings_test
from .sysutil import ROOT, VITE_PORT, c, env, get_project_status, handle_version, is_port_in_use, run_command
from .dist_check import dist_status
from .t2_replace import handle_art_approve, handle_art_regenerate, handle_art_reskin, handle_art_restore, handle_art_style, handle_art_swap, handle_art_upload
from .ts_carts import handle_library_doctor, library_put_logic, library_set_flags
from .workshop_state import handle_agent_chats_get, handle_agent_chats_put, handle_agent_session_reset, handle_ws_draft_get, handle_ws_draft_put

API_PORT = int(env('ZEROCRAFT_API_PORT', default='4000') or '4000')  # 平台打包：electron 挑空闲端口后经此 env 传入

# 已构建的前端产物目录（平台打包：`vite build` 产出的 studio launcher 静态站）。缺省 ROOT/dist；
# 电子壳/CI 可用 ZEROCRAFT_STATIC_DIR 另指（旧名 APOLLO_STATIC_DIR 过渡期仍读，如 platform-dist/dist）——
# 不设也不报错，纯 API 开发模式下该目录本就不存在，_serve_static 命中即 404，不影响任何现有 /api/* 端点。
STATIC_DIST_DIR = Path(env('ZEROCRAFT_STATIC_DIR') or (ROOT / 'dist'))

# ── API 服务器 ──

def _lib_dispatch(fn) -> tuple:
    """跑一个返回 (status, data) 的库端点，把 ValueError（非法 slug/越界）折成 400、其它异常折成 500。"""
    try:
        return fn()
    except ValueError as e:
        return (400, {'success': False, 'error': str(e)})
    except Exception as e:
        return (500, {'success': False, 'error': str(e)})

class APIHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, data) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(payload)

    def _send_file(self, abs_path, content_type: str) -> None:
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(abs_path.read_bytes())

    def _serve_workshop(self, path: str) -> None:
        """GET /workshop[/...] → 端出原版工作台（workshop/·同源→前端 fetch /api/* 免跨域）。
        原版 .dc.html + support.js 原样伺服（运行时自 boot）；路径穿越防护。"""
        if path == '/workshop':
            self.send_response(301); self.send_header('Location', '/workshop/'); self.end_headers(); return
        rel = 'index.dc.html' if path == '/workshop/' else path[len('/workshop/'):]
        base = (ROOT / 'workshop').resolve()
        target = (base / rel).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            self.send_response(403); self.end_headers(); return
        if not target.is_file():
            self.send_response(404); self.end_headers(); return
        ctype = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
                 '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
                 '.png': 'image/png', '.svg': 'image/svg+xml'}.get(target.suffix.lower(), 'application/octet-stream')
        self._send_file(target, ctype)

    def _serve_bench_redirect(self) -> None:
        """GET /bench[?to=/path]。跳到旧工作台（vite dev）——探测 5173/3000 谁活着跳谁
        （07-11 实证：壳写死 :3000 而 apollo 起的 vite 在 :5173 → ▶ 运行跳进空页）。
        都没活 → 200 提示页（怎么启动），绝不跳死链。to 必须以 / 开头（防开放跳转）。"""
        qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
        to = (qs.get('to') or ['/'])[0]
        if not to.startswith('/') or to.startswith('//'):
            to = '/'
        port = VITE_PORT if is_port_in_use(VITE_PORT) else None  # 只认规范端口——3000 上可能是无关服务（07-11 实证）
        if port:
            self.send_response(302)
            self.send_header('Location', f'http://localhost:{port}{to}')
            self.end_headers()
            return
        # 打包态（electron·owner 2026-08-06 真机实测事故）：产物**不带 node/vite**，等 vite 永远等不到，
        # 点货架「运行」就卡在下面那张转圈页上。但打包态前端**就在本进程身上**——已构建产物由
        # `_serve_static` 同源伺服于 `/`。故此处先看「有没有已构建前端」，有就**同源跳转**、别等 vite。
        # 顺序讲究：vite 活着优先（开发态照旧，零回归）→ 再看静态产物（打包态）→ 都没有才给转圈页
        # （开发态 vite 冷启动那几秒的原本用途）。
        if (STATIC_DIST_DIR / 'index.html').is_file():
            self.send_response(302)
            self.send_header('Location', to)  # 同源相对跳转：谁的端口都不用猜
            self.end_headers()
            return
        # 兜底页不再是死链（owner 07-15）：zerocraft.py workshop 拉 vite 是非阻塞的·冷启动几秒——
        # 这几秒里点 ▶ 就会撞这页。改成轮询 /api/bench-ready·vite 一就绪自动跳转（就绪前转圈·不要求重启）。
        safe_to = json.dumps(to)
        body = ('<!doctype html><meta charset="utf-8"><title>页面服务启动中…</title>'
                '<body style="font-family:system-ui;background:#0f1722;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh">'
                '<div style="max-width:560px;line-height:1.8;text-align:center">'
                '<div style="width:34px;height:34px;margin:0 auto 18px;border:4px solid rgba(255,255,255,.15);border-top-color:#7ecb45;border-radius:50%;animation:spin .8s linear infinite"></div>'
                '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>'
                '<h2 style="margin:0 0 8px">页面服务（vite）启动中…</h2>'
                '<p id="hint" style="color:#94a3b8">就绪后<b>自动跳转</b>到游戏，无需操作（冷启动约几秒）。</p>'
                '<p style="color:#64748b;font-size:13px">若长时间不动：回终端确认 <code style="background:#1e293b;padding:2px 8px;border-radius:6px">python zerocraft.py workshop</code> 在跑。</p>'
                '</div>'
                '<script>'
                'var to=' + safe_to + ',n=0;'
                'function poll(){fetch("/api/bench-ready").then(function(r){return r.json()}).then(function(d){'
                'if(d&&d.ready){location.replace(to)}else{n++;if(n>40){document.getElementById("hint").textContent="页面服务还没起来——回终端确认 python zerocraft.py workshop 在跑（或 npm run dev）。"}setTimeout(poll,1500)}'
                '}).catch(function(){setTimeout(poll,1500)})}'
                'poll();'
                '</script>').encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_public_games(self, path: str) -> None:
        """GET /games/<slug>/... → 只读伺服游戏资产（REQ-WORKSHOP A：壳的素材缩略图/台账
        servedPath 同源可显）。路径穿越防护同 _serve_workshop。

        **卡带回退（REQ-CARTART）**：`/games/<slug>/art/**` 对创作台卡带解析到 `library/<slug>/art/**`
        （见 paths.art_root）——URL 契约不变、存储归位到卡带自己那一屋，引擎侧零改动。
        非 art 子路径（manifest/cover 等）与内置游戏一律走 public/，行为一字不变。
        两根各自独立做穿越校验：先在 library 根内解析+校验，落空再回 public 根同样校验。"""
        rel = path[len('/games/'):]
        slug = rel.split('/', 1)[0]
        # 卡带 art 优先根（仅当 slug 合法且确是卡带·且请求的正是 art/ 子树）
        if _valid_slug(slug) and rel.startswith(f'{slug}/art/'):
            lib_base = (LIBRARY_DIR / slug / 'art').resolve()
            lib_target = (lib_base / rel[len(f'{slug}/art/'):]).resolve()
            try:
                lib_target.relative_to(lib_base)  # 穿越防护（与 public 根同规格）
            except ValueError:
                self.send_response(403); self.end_headers(); return
            if lib_target.is_file():
                self._send_file(lib_target, self._asset_ctype(lib_target))
                return
        base = (ROOT / 'public' / 'games').resolve()
        target = (base / rel).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            self.send_response(403); self.end_headers(); return
        if not target.is_file():
            self.send_response(404); self.end_headers(); return
        self._send_file(target, self._asset_ctype(target))

    @staticmethod
    def _asset_ctype(target) -> str:
        """按扩展名给游戏资产的 content-type（两个根共用·与 vite serveLiveGameAssets 表同源）。"""
        return {'.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.glb': 'model/gltf-binary'}.get(target.suffix.lower(), 'application/octet-stream')

    def _serve_assets(self, path: str) -> None:
        """GET /assets/... → 只读伺服 assets/**（素材库屏共享免费资产库 FreeArtLib 的 index.json +
        缩略图同源可取）。路径穿越防护同 _serve_public_games（relative_to 校验解析后仍在 assets/ 内）。"""
        base = (ROOT / 'assets').resolve()
        target = (base / path[len('/assets/'):]).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            self.send_response(403); self.end_headers(); return
        if not target.is_file():
            # 蓝屏修复（owner 2026-08-25 实证）：vite **日常 build** 把应用 bundle 放 dist/assets/*，
            # 与本素材库路由同前缀——python 同源伺服日常 dist 时（zerocraft.py 默认态 vite 不在 +
            # dist 在场即走此路），bundle 被这里 404 → 首屏永不挂载 = 深蓝空屏。
            # PLATFORM_BUILD 的 assetsDir='app' 只救打包态、救不了门禁每次 build 出的日常 dist。
            # 修 = 素材库查不到就落到已构建前端的 assets（穿越防护同上·仍查不到才 404）。
            dist_base = STATIC_DIST_DIR.resolve()
            alt = (dist_base / 'assets' / path[len('/assets/'):]).resolve()
            try:
                alt.relative_to(dist_base)
            except ValueError:
                self.send_response(403); self.end_headers(); return
            if alt.is_file():
                self._send_file(alt, self._STATIC_CT.get(alt.suffix.lower(), 'application/octet-stream'))
                return
            self.send_response(404); self.end_headers(); return
        ctype = {'.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
                 '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
                 '.glb': 'model/gltf-binary',
                 # 视频/音频（owner 07-12：素材库要包含视频·爱诗 PixVerse 线）
                 '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
                 '.ogg': 'audio/ogg'}.get(target.suffix.lower(), 'application/octet-stream')
        self._send_file(target, ctype)

    def _serve_public_art(self, path: str) -> None:
        """GET /art/... → 只读伺服 public/art/**（内置代码游戏按 URL 引用的真美术·
        美术台账 servedPath 同源可显）。路径穿越防护同 _serve_public_games。"""
        base = (ROOT / 'public' / 'art').resolve()
        target = (base / path[len('/art/'):]).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            self.send_response(403); self.end_headers(); return
        if not target.is_file():
            self.send_response(404); self.end_headers(); return
        ctype = {'.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
                 '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
                 '.glb': 'model/gltf-binary'}.get(target.suffix.lower(), 'application/octet-stream')
        self._send_file(target, ctype)

    def _serve_package_download(self, jid: str) -> None:
        """GET /api/package/download?id=<jid> → 已打包产物（按 jid 取 job['artifact']）。
        job 未完成/失败/无产物 → JSON 报错；成功 → 按扩展名给 content-type + attachment 下发。"""
        with _PKG_JOBS_LOCK:
            j = _PKG_JOBS.get(jid)
            art = j.get('artifact') if j else None
            name = j.get('artifactName') if j else None
            err = j.get('error') if j else None
        if not j:
            self._send_json(404, {'success': False, 'error': f'打包任务不存在: {jid}'}); return
        if err:
            self._send_json(400, {'success': False, 'error': err}); return
        if not art or not Path(art).is_file():
            self._send_json(404, {'success': False, 'error': '产物尚未就绪或已被清理——请重新打包'}); return
        p = Path(art)
        ctypes = {'html': 'text/html; charset=utf-8', 'zip': 'application/zip',
                  'dmg': 'application/x-apple-diskimage', 'tar.gz': 'application/gzip'}
        ext = 'tar.gz' if p.name.endswith('.tar.gz') else p.suffix.lstrip('.')
        data = p.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', ctypes.get(ext, 'application/octet-stream'))
        self.send_header('Content-Disposition', f'attachment; filename="{name or p.name}"')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def _serve_artbrowser_history_blob(self, path: str, rev: str) -> None:
        """GET /api/artbrowser/history-blob?path=&rev= → `git show rev:path` 字节流（REQ-ARTPIPE2 A3
        「历史」tab 任意版本缩略预览·回退前后并排对比图源）。路径穿越防护 + rev 白名单见
        `artbrowser.resolve_history_blob`（同 `_serve_design_preview` 先例：校验/解析在模块层，
        字节直出在 server 层）。"""
        ok, data, ctype = resolve_history_blob(path, rev)
        if not ok:
            self._send_json(400, {'success': False, 'error': data}); return
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def _serve_design_preview(self, slug: str, filename: str) -> None:
        """GET /api/design/preview?slug=<slug>&file=<filename> → 只读伺服已收设计稿正文（收稿箱
        「👁 预览」新窗口打开用）。`filename` 既可以是单文件收稿的 basename，也可以是整包收稿
        （REQ-DESIGNLINE 二期④）pack 内相对路径（如 `ui-refs/<稿名>/index.html` 或其引用的
        `ui-refs/<稿名>/img/x.png`）——按扩展名选 Content-Type，图片/CSS/JSON 都要能经这条路径打开，
        否则整包预览的入口 html 引用相对图片会裂图。路径防护见 design_ingest.design_preview_path
        （禁绝对路径/`..` 段 + 归一化后仍在该游戏设计目录内的纵深断言，同 _serve_public_games 先例）。"""
        ok, target = design_preview_path(slug, filename)
        if not ok:
            self._send_json(400, {'success': False, 'error': target}); return
        if not target.is_file():
            self.send_response(404); self.end_headers(); return
        ctype = self._STATIC_CT.get(target.suffix.lower(), 'text/html; charset=utf-8')
        self._send_file(target, ctype)

    _STATIC_CT = {
        '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
        '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
        '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.map': 'application/json; charset=utf-8',
    }

    def _serve_static(self, path: str) -> None:
        """GET 非 /api/* 且未命中任何专用路由 → 从已构建前端产物目录（STATIC_DIST_DIR，通常
        `vite build` 的 dist/）伺服（平台打包 D2：后端 + 前端同源一个端口）。纯 API 开发态该目录
        不存在 → 404（不影响任何现有行为·未构建时访问站点根路径就是"还没 build"，明确信号而非假 200）。
        路径穿越防护同 _serve_workshop；SPA 兜底——非文件请求（无扩展名的深链）回退 index.html，
        真正缺失的静态资源（有扩展名但 404）如实报 404，不吞成假 200 掩盖真坏链。"""
        base = STATIC_DIST_DIR.resolve()
        if not base.is_dir():
            self.send_response(404); self.end_headers(); return
        rel = 'index.html' if path in ('/', '') else path.lstrip('/')
        try:
            rel = urllib.parse.unquote(rel)
        except Exception:
            pass
        target = (base / rel).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            self.send_response(403); self.end_headers(); return
        if not target.is_file():
            if '.' in Path(rel).name:  # 有扩展名却缺文件 = 真缺资源，不伪装成 200
                self.send_response(404); self.end_headers(); return
            target = base / 'index.html'  # SPA 深链兜底（launcher 走 ?query 路由·当前用不上，留一般性兜底）
            if not target.is_file():
                self.send_response(404); self.end_headers(); return
        ctype = self._STATIC_CT.get(target.suffix.lower(), 'application/octet-stream')
        self._send_file(target, ctype)

    def _serve_export(self, slug: str) -> None:
        """GET /api/library/<slug>/export → 下载包 zip（owner 2026-07-11「发布=一个下载包」）。
        内容：卡带本体（manifest/meta/design·**REQ-CARTART 后美术 art/ 也在卡带本体里**，随 lib 树自动进包，
        归档路径由 `<slug>/assets/art/…` 变为 `<slug>/art/…`）+ 游戏资产侧 public/games/<slug>
        （内置游戏走这条；卡带这边通常只剩 pipeline.json/cover）。**排除 .git/snapshots/gen-mock 预览物**。
        内存 zip·不落盘。"""
        if not _valid_slug(slug):
            self._send_json(400, {'success': False, 'error': f'非法 slug: {slug}'}); return
        lib = LIBRARY_DIR / slug
        pub = ROOT / 'public' / 'games' / slug
        if not (lib / 'manifest.json').is_file() and not (pub / 'manifest.json').is_file():
            self._send_json(404, {'success': False, 'error': f'游戏不存在: {slug}'}); return
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
            def _add_tree(root_dir, arc_prefix):
                if not root_dir.is_dir():
                    return
                for p in sorted(root_dir.rglob('*')):
                    if not p.is_file():
                        continue
                    rel = p.relative_to(root_dir)
                    parts = rel.parts
                    if '.git' in parts or 'snapshots' in parts or 'mock' in parts:  # 版本库/快照/mock 预览物不进包
                        continue
                    z.write(p, f'{slug}/{arc_prefix}{rel.as_posix()}')
            _add_tree(lib, '')
            _add_tree(pub, 'assets/' if lib.is_dir() else '')
        data = buf.getvalue()
        self.send_response(200)
        self.send_header('Content-Type', 'application/zip')
        self.send_header('Content-Disposition', f'attachment; filename="{slug}.zip"')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split('?')[0]

        # 原版工作台静态伺服（owner 2026-07-11：对外展示台用原版设计代码 + 嵌我们的接口）。
        if path == '/workshop' or path.startswith('/workshop/'):
            self._serve_workshop(path)
            return

        if path == '/bench':
            self._serve_bench_redirect()
            return

        # 游戏资产只读伺服（壳的缩略图/manifest 同源可取·REQ-WORKSHOP A）。
        if path.startswith('/games/'):
            self._serve_public_games(path)
            return

        # 共享免费资产库只读伺服（素材库屏·FreeArtLib index.json + 缩略图同源可取）。
        if path.startswith('/art/'):
            self._serve_public_art(path)
            return

        if path.startswith('/assets/'):
            self._serve_assets(path)
            return

        # 已构建前端静态伺服（平台打包 D2）：非 /api/* 且未命中以上任何专用路由 → 落这里
        # （站点根 index.html + JS/CSS/字体等构建产物）。必须先于下面的 /api/* 分派链，
        # 否则会被最终 else 分支吞成 200 {"error":"Unknown endpoint"} 的假 JSON 响应。
        if not path.startswith('/api/'):
            self._serve_static(path)
            return

        # 下载包导出（发布屏=下载包·binary 出，先于 library JSON 分派）。
        m_export = re.fullmatch(r'/api/library/([a-z0-9][a-z0-9-]*)/export', path)
        if m_export:
            self._serve_export(m_export.group(1))
            return

        # 打包产物下载（发布屏「下载」·按 jid 取已构建产物·binary 出，先于 JSON 分派）。
        if path == '/api/package/download':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            self._serve_package_download((qs.get('id') or [''])[0])
            return

        # 设计稿预览（REQ-DESIGNLINE 过渡轨②·收稿箱「👁 预览」新窗口·文本正文出，先于 JSON 分派）。
        if path == '/api/design/preview':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            self._serve_design_preview((qs.get('slug') or [''])[0], (qs.get('file') or [''])[0])
            return

        # 资产浏览器历史版本字节流（REQ-ARTPIPE2 A3·git show 直出，先于 JSON 分派）。
        if path == '/api/artbrowser/history-blob':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            self._serve_artbrowser_history_blob((qs.get('path') or [''])[0], (qs.get('rev') or [''])[0])
            return

        m_stats = re.fullmatch(r'/api/library/([a-z0-9][a-z0-9-]*)/stats', path)
        if m_stats:
            self._send_json(200, handle_library_stats(m_stats.group(1)))
            return

        if path == '/api/library/doctor':  # 全库装载体检（先于泛 library 分派——doctor 不是 slug）
            self._send_json(200, handle_library_doctor())
            return

        # 库端点（可变状态码：400 越界 / 404 缺失）——先于遗留 200 端点分派。
        if path == '/api/library' or path.startswith('/api/library/'):
            try:
                status, data = library_get(path)
            except ValueError as e:
                status, data = 400, {'error': str(e)}
            except Exception as e:
                status, data = 500, {'error': str(e)}
            self._send_json(status, data)
            return

        # 设计草稿端点（列表 / 按 id 取全量·可变状态码 400/404）。
        if path == '/api/design-drafts' or path.startswith('/api/design-drafts/'):
            if path == '/api/design-drafts':
                self._send_json(*_lib_dispatch(design_draft_list))
            else:
                did = _draft_id_from_path(path)
                self._send_json(*_lib_dispatch(lambda: design_draft_get(did)))
            return

        if path == '/api/status':
            data = get_project_status()
        elif path == '/api/bench-ready':  # 页面服务(vite)是否就绪——/bench 兜底页轮询它·就绪即自动跳（owner 07-15：▶ 别撞死链）
            data = {'ready': is_port_in_use(VITE_PORT), 'port': VITE_PORT}
        elif path == '/api/test':
            data = run_command(['npx', 'vitest', 'run'])
        elif path == '/api/typecheck':
            data = run_command(['npx', 'tsc', '--noEmit'])
        elif path == '/api/build':
            data = run_command(['npx', 'vite', 'build'])
        elif path == '/api/bench':
            data = run_command(['npx', 'vite-node', 'src/bench/run-bench.ts'])
        elif path == '/api/git-log':
            data = run_command(['git', 'log', '--oneline', '-20'])
        elif path == '/api/git-status':
            data = run_command(['git', 'status', '--short'])
        elif path == '/api/git-pull':
            data = run_command(['git', 'pull', 'origin', 'claude/mainbranch', '--rebase'])
        elif path == '/api/generate/presets':
            data = {name: {'name': bp['name'], 'description': bp['description']} for name, bp in PRESET_BLUEPRINTS.items()}
        elif path.startswith('/api/generate/preset/'):
            preset_name = path.split('/')[-1]
            if preset_name in PRESET_BLUEPRINTS:
                data = {'success': True, 'blueprint': PRESET_BLUEPRINTS[preset_name]}
            else:
                data = {'success': False, 'error': f'Unknown preset: {preset_name}'}
        elif path == '/api/generate/providers':
            data = get_available_providers()
        elif path == '/api/assets/generate/providers':
            data = handle_asset_generate_providers()
        elif path == '/api/assets/pending':
            data = handle_asset_pending()
        elif path == '/api/art/style-packs':
            data = handle_art_packs()
        elif path == '/api/art/ledger':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            data = handle_art_ledger((qs.get('slug') or [''])[0])
        elif path == '/api/jobs':  # 统一任务托盘（薄聚合三家注册表·只读归一·零新状态）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                data = handle_job_board(int((qs.get('n') or ['30'])[0]))
            except Exception as e:
                data = {'success': False, 'error': f'任务托盘异常: {e}'}
        elif path == '/api/art/job':  # 后台批量任务状态（进度请轮 /api/art/ledger——逐行落账即实时进度）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                data = handle_art_job_get((qs.get('id') or [''])[0])
            except Exception as e:
                data = {'success': False, 'error': f'art job 异常: {e}'}
        elif path == '/api/art/jobs':  # 最近批量任务（刷新/切屏后恢复「生成中」看板）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                data = handle_art_jobs_list((qs.get('slug') or [''])[0])
            except Exception as e:
                data = {'success': False, 'error': f'art jobs 异常: {e}'}
        elif path == '/api/art/sync/status':  # 内置游戏美术待同步改动数（一键提交推送按钮角标）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                data = handle_art_sync_status((qs.get('slug') or [''])[0])
            except Exception as e:
                data = {'success': False, 'error': f'sync status 异常: {e}'}
        elif path == '/api/artbrowser/tree':  # 资产浏览器三栏数据（REQ-ARTPIPE2 A2·薄封装既有台账/索引/守卫 JSON）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                data = handle_artbrowser_tree((qs.get('scope') or [''])[0])
            except Exception as e:
                data = {'success': False, 'error': f'artbrowser tree 异常: {e}'}
        elif path == '/api/artbrowser/history':  # 详情栏「历史」tab（REQ-ARTPIPE2 A3·git log --follow）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                data = handle_artbrowser_history((qs.get('path') or [''])[0])
            except Exception as e:
                data = {'success': False, 'error': f'artbrowser history 异常: {e}'}
        elif path == '/api/artbrowser/consumers':  # 详情栏「替换/消费方」tab（REQ-ARTPIPE2 A4·manifest 反查）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                data = handle_artbrowser_consumers((qs.get('slug') or [''])[0], (qs.get('no') or [''])[0])
            except Exception as e:
                data = {'success': False, 'error': f'artbrowser consumers 异常: {e}'}
        elif path == '/api/design/ledger':  # 收稿箱列表（REQ-DESIGNLINE 过渡轨②）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            data = handle_design_ledger_get((qs.get('slug') or [''])[0])
        elif path == '/api/pipeline':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            data = handle_pipeline_board((qs.get('slug') or [''])[0])
        elif path == '/api/pipeline/artifacts':  # 「跑完的东西在哪·存住没」（owner 2026-08-10 实撞白跑）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                data = handle_artifacts_status((qs.get('slug') or [''])[0])
            except Exception as e:
                data = {'success': False, 'error': f'artifacts 异常: {e}'}
        elif path == '/api/pipeline/orchestrator/status':  # 向导锁横幅 + 步进器「开工」轮询共用（REQ-PIPESOFT P1b）
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                data = handle_pipeline_orch_status((qs.get('slug') or [''])[0])
            except Exception as e:
                data = {'success': False, 'error': f'orchestrator status 异常: {e}'}
        elif path == '/api/games':
            data = handle_games_list()
        elif path == '/api/version':
            data = handle_version()
        elif path == '/api/catalog':
            data = handle_catalog()
        elif path == '/api/llm-logs':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                nn = int(qs.get('n', ['50'])[0])
            except ValueError:
                nn = 50
            data = handle_llm_logs(nn)
        elif path == '/api/llm-live':
            data = handle_llm_live()
        elif path == '/api/generate/jobs':
            data = handle_generate_jobs_list()
        elif path == '/api/generate/job':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            data = handle_generate_job_get((qs.get('id') or [''])[0])
        elif path == '/api/package/job':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            data = handle_package_job_get((qs.get('id') or [''])[0])
        elif path == '/api/package/dokiworld-apps':  # 发布屏 DokiWorld 列可用性（dokiworld/<slug>/ 存在=已接入）
            data = handle_dokiworld_apps()
        elif path == '/api/agent/chats':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            data = handle_agent_chats_get((qs.get('slug') or [''])[0])
        elif path == '/api/workshop/draft':
            data = handle_ws_draft_get()
        elif path == '/api/features':
            data = {'success': True, **_features()}
        elif path == '/api/matlib/groups':
            data = handle_matlib_groups_get()
        elif path == '/api/art/resolve':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            data = handle_art_resolve((qs.get('slug') or [''])[0])
        elif path == '/api/capgaps':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1]) if '?' in self.path else {}
            try:
                gn = int(qs.get('n', ['50'])[0])
            except ValueError:
                gn = 50
            data = handle_capgaps_list(gn)
        elif path == '/api/settings':
            data = handle_settings_get()
        else:
            data = {'error': 'Unknown endpoint'}

        self._send_json(200, data)

    def _read_json_body(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if not content_len:
            return {}
        return json.loads(self.rfile.read(content_len).decode())

    def do_POST(self):
        path = self.path.split('?')[0]
        try:
            body = self._read_json_body()
        except Exception:
            self._send_json(400, {'success': False, 'error': 'body 不是合法 JSON'})
            return

        # 库写端点（可变状态码）——先分派。
        if path == '/api/library/create':
            self._send_json(*_lib_dispatch(lambda: library_create(body)))
            return
        if path == '/api/library/install-sample':
            self._send_json(*_lib_dispatch(lambda: library_install_sample(body)))
            return
        if path.startswith('/api/library/') and path.endswith('/rollback'):
            slug, _ = _lib_parts(path)
            self._send_json(*_lib_dispatch(lambda: library_rollback(slug, body)))
            return
        if path.startswith('/api/library/') and path.endswith('/bench'):
            slug, _ = _lib_parts(path)
            self._send_json(*_lib_dispatch(lambda: library_bench(slug)))
            return
        m_flags = re.fullmatch(r'/api/library/([a-z0-9][a-z0-9-]*)/flags', path)
        if m_flags:  # TS 例外勾（owner 07-11·仅 features.tsCarts 开时可用）
            self._send_json(*_lib_dispatch(lambda: library_set_flags(m_flags.group(1), body)))
            return
        m_cover = re.fullmatch(r'/api/games/([a-z0-9][a-z0-9-]*)/cover', path)
        if m_cover:  # 游戏封面/图标文生图（owner 07-12·替换卡片默认矢量图标）
            self._send_json(200, handle_game_cover_generate(m_cover.group(1), body))
            return
        if path == '/api/settings/test':
            self._send_json(200, handle_settings_test(body))
            return

        if path == '/api/generate/job':  # 后台生成任务（先于泛 /api/generate 分派）
            self._send_json(200, handle_generate_job_start(body))
            return

        if path == '/api/package/job':  # 后台打包任务（发布屏·每游戏×平台）
            self._send_json(200, handle_package_job_start(body))
            return

        if path == '/api/generate':
            provider = body.get('provider', 'anthropic')
            mode = body.get('mode', 'create')
            label = (body.get('instruction') if mode == 'revise' else body.get('prompt')) or ''
            print(c("  [GENERATE]", 'm'), f"[{provider}·{mode}] {str(label)[:60]}...")
            try:
                data = handle_generate(body)
            except Exception as e:  # 防御：单次生成失败不拖死 API 进程
                data = {'success': False, 'error': f'生成异常: {e}', 'blueprint': None}
            if data.get('success'):
                print(c("  [GENERATE]", 'g'),
                      f"OK: {(data.get('blueprint') or {}).get('name', '?')} (attempts={data.get('attempts')})")
            else:
                print(c("  [GENERATE]", 'r'), f"Failed: {str(data.get('error', '?'))[:80]}")
        elif path == '/api/assets/import':
            try:
                data = handle_asset_import(body)
            except Exception as e:  # 防御：单次导入失败不拖死 API 进程
                data = {'success': False, 'error': f'导入异常: {e}'}
        elif path == '/api/assets/autotag':
            try:
                data = handle_asset_autotag(body)
            except Exception as e:
                data = {'success': False, 'error': f'标注异常: {e}'}
        elif path == '/api/assets/generate':
            try:
                data = handle_asset_generate(body)
            except Exception as e:  # 防御：单次生成失败不拖死 API 进程
                data = {'success': False, 'error': f'生成异常: {e}'}
        elif path == '/api/assets/vendor':
            try:
                data = handle_asset_vendor(body)
            except Exception as e:  # 防御：单次 vendor 失败不拖死 API 进程
                data = {'success': False, 'error': f'vendor 异常: {e}'}
        elif path == '/api/assets/matte':
            try:
                data = handle_asset_matte(body)
            except Exception as e:  # 防御：单次抠图失败不拖死 API 进程
                data = {'success': False, 'error': f'抠图异常: {e}'}
        elif path == '/api/assets/review':
            try:
                data = handle_asset_review(body)
            except Exception as e:  # 防御：单次审核失败不拖死 API 进程
                data = {'success': False, 'error': f'审核异常: {e}'}
        elif path == '/api/art/derive':
            try:
                data = handle_art_derive(body)
            except Exception as e:
                data = {'success': False, 'error': f'derive 异常: {e}'}
        elif path == '/api/art/batch':
            try:
                data = handle_art_batch(body)
            except Exception as e:
                data = {'success': False, 'error': f'batch 异常: {e}'}
        elif path == '/api/art/replace':
            try:
                data = handle_art_replace(body)
            except Exception as e:
                data = {'success': False, 'error': f'replace 异常: {e}'}
        elif path == '/api/art/style':
            try:
                data = handle_art_style(body)
            except Exception as e:
                data = {'success': False, 'error': f'style 异常: {e}'}
        elif path == '/api/art/styles':
            try:
                data = handle_art_style_save(body)
            except Exception as e:
                data = {'success': False, 'error': f'styles-save 异常: {e}'}
        elif path == '/api/art/styles/delete':
            try:
                data = handle_art_style_delete(body)
            except Exception as e:
                data = {'success': False, 'error': f'styles-delete 异常: {e}'}
        elif path == '/api/art/approve':
            try:
                data = handle_art_approve(body)
            except Exception as e:
                data = {'success': False, 'error': f'approve 异常: {e}'}
        elif path == '/api/art/regenerate':
            try:
                data = handle_art_regenerate(body)
            except Exception as e:
                data = {'success': False, 'error': f'regenerate 异常: {e}'}
        elif path == '/api/art/swap':
            try:
                data = handle_art_swap(body)
            except Exception as e:
                data = {'success': False, 'error': f'swap 异常: {e}'}
        elif path == '/api/art/upload':
            try:
                data = handle_art_upload(body)
            except Exception as e:
                data = {'success': False, 'error': f'upload 异常: {e}'}
        elif path == '/api/art/restore':
            try:
                data = handle_art_restore(body)
            except Exception as e:
                data = {'success': False, 'error': f'restore 异常: {e}'}
        elif path == '/api/artbrowser/restore':  # 详情栏「历史」tab「回退到此版」（REQ-ARTPIPE2 A3）
            try:
                data = handle_artbrowser_restore(body)
            except Exception as e:
                data = {'success': False, 'error': f'artbrowser restore 异常: {e}'}
        elif path == '/api/art/reskin':
            try:
                data = handle_art_reskin(body)
            except Exception as e:
                data = {'success': False, 'error': f'reskin 异常: {e}'}
        elif path == '/api/art/cleanup-mock':  # 清 mock 预览图（孤儿·守卫必报黑户·唯一回收口）
            try:
                data = handle_art_cleanup_mock(body)
            except Exception as e:
                data = {'success': False, 'error': f'cleanup-mock 异常: {e}'}
        elif path == '/api/art/sync':  # 内置游戏美术一键提交+推送（fetch→rebase→push 自动重试·冲突自动 abort 保本地提交）
            try:
                data = handle_art_sync(body)
            except Exception as e:
                data = {'success': False, 'error': f'sync 异常: {e}'}
        elif path == '/api/pipeline/artifacts/sync':  # 该游戏落在引擎仓的产物一键提交+推送（含 docs/design）
            try:
                data = handle_artifacts_sync(body)
            except Exception as e:
                data = {'success': False, 'error': f'artifacts sync 异常: {e}'}
        elif path == '/api/design/ingest':  # 收稿箱落盘（REQ-DESIGNLINE 过渡轨②）
            try:
                data = handle_design_ingest(body)
            except Exception as e:
                data = {'success': False, 'error': f'design ingest 异常: {e}'}
        elif path == '/api/design/finalize':  # 定稿人门（过渡轨③·note 永远真人手填）
            try:
                data = handle_design_finalize(body)
            except Exception as e:
                data = {'success': False, 'error': f'design finalize 异常: {e}'}
        elif path == '/api/design/ui-brief':  # 「📐 生成 UI 设计需求单」钮（REQ-DESIGNLINE 二期①·S3 绿后可点）
            try:
                data = handle_design_ui_brief(body)
            except Exception as e:
                data = {'success': False, 'error': f'ui-brief 异常: {e}'}
        elif path == '/api/projects':  # 「存为项目」S1/S2 落点（REQ-S18PANEL ①·docs/design/<slug>/ + 对话认领）
            try:
                data = handle_project_save(body)
            except Exception as e:
                data = {'success': False, 'error': f'project save 异常: {e}'}
        elif path == '/api/pipeline/gate':
            try:
                data = handle_pipeline_gate(body)
            except Exception as e:
                data = {'success': False, 'error': f'pipeline gate 异常: {e}'}
        elif path == '/api/pipeline/signoff':
            try:
                data = handle_pipeline_signoff(body)
            except Exception as e:
                data = {'success': False, 'error': f'pipeline signoff 异常: {e}'}
        elif path == '/api/pipeline/concept':
            try:
                data = handle_pipeline_concept(body)
            except Exception as e:
                data = {'success': False, 'error': f'pipeline concept 异常: {e}'}
        elif path == '/api/pipeline/wizard-concept':  # 向导「一句话入口」（REQ-PIPESOFT P1b①）
            try:
                data = handle_pipeline_wizard_concept(body)
            except Exception as e:
                data = {'success': False, 'error': f'wizard-concept 异常: {e}'}
        elif path == '/api/pipeline/orchestrator/dispatch':  # 步进器「▶ 开工」（P1b②）
            try:
                data = handle_pipeline_orch_dispatch(body)
            except Exception as e:
                data = {'success': False, 'error': f'orchestrator dispatch 异常: {e}'}
        elif path == '/api/pipeline/orchestrator/abort':  # 锁横幅「中止」（P1b③）
            try:
                data = handle_pipeline_orch_abort(body)
            except Exception as e:
                data = {'success': False, 'error': f'orchestrator abort 异常: {e}'}
        elif path == '/api/agent/session/reset':
            data = handle_agent_session_reset(body)
        elif path == '/api/agent/chat':
            try:
                data = handle_agent_chat(body)
            except Exception as e:
                data = {'success': False, 'error': f'agent chat 异常: {e}'}
        else:
            data = {'error': 'Unknown POST endpoint'}

        self._send_json(200, data)

    def do_PUT(self):
        path = self.path.split('?')[0]
        try:
            body = self._read_json_body()
        except Exception:
            self._send_json(400, {'success': False, 'error': 'body 不是合法 JSON'})
            return
        if path == '/api/settings':
            self._send_json(200, handle_settings_put(body))
            return
        if path == '/api/agent/chats':
            self._send_json(200, handle_agent_chats_put(body))
            return
        if path == '/api/workshop/draft':
            self._send_json(200, handle_ws_draft_put(body))
            return
        if path == '/api/matlib/groups':
            self._send_json(200, handle_matlib_groups_put(body))
            return
        # 设计草稿 upsert（未定名/定名自动分流·可变状态码）——先于 design/manifest 分派。
        if path.startswith('/api/design-drafts/'):
            did = _draft_id_from_path(path)
            self._send_json(*_lib_dispatch(lambda: design_draft_put(did, body)))
            return
        # design 单篇写（/api/library/<slug>/design/<rel...>·rel 可含 systems/ 子路径）——先于 manifest 分派。
        if path.startswith('/api/library/') and '/design/' in path:
            d_slug, rel = _design_parts(path)
            rel = urllib.parse.unquote(rel) if rel else rel
            if d_slug:
                self._send_json(*_lib_dispatch(lambda: library_design_put(d_slug, rel, body)))
                return
        slug, action = _lib_parts(path)
        if path.startswith('/api/library/') and action == 'manifest' and slug:
            self._send_json(*_lib_dispatch(lambda: library_put_manifest(slug, body)))
            return
        if path.startswith('/api/library/') and action == 'logic' and slug:  # TS 例外 logic.ts（装载门后落盘）
            self._send_json(*_lib_dispatch(lambda: library_put_logic(slug, body)))
            return
        self._send_json(404, {'error': 'Unknown PUT endpoint'})

    def do_DELETE(self):
        path = self.path.split('?')[0]
        # 设计草稿弃置（显式删·可变状态码 400/404）。
        if path.startswith('/api/design-drafts/'):
            did = _draft_id_from_path(path)
            self._send_json(*_lib_dispatch(lambda: design_draft_delete(did)))
            return
        m_del = re.fullmatch(r'/api/library/([a-z0-9][a-z0-9-]*)', path)
        if m_del:  # 删卡带（owner 07-11·只删库卡带·内置 404）
            self._send_json(*_lib_dispatch(lambda: library_delete(m_del.group(1))))
            return
        self._send_json(404, {'error': 'Unknown DELETE endpoint'})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        pass

def start_api_server():
    # ThreadingHTTPServer（07-11 破案）：对话是分钟级长请求，单线程服务器会让 /api/llm-live 轮询
    # 全部排队——对话期间实况/trace 永远出不来（生成走后台任务所以没事）。共享态已有锁
    # （_LLM_LIVE/_GEN_JOBS）；单人本机工作台，其余文件写入无并发压力。
    server = ThreadingHTTPServer(('127.0.0.1', API_PORT), APIHandler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(c("  [API]", 'g'), f"Dev tools API on http://localhost:{API_PORT}")
    # 过期构建产物**必须在每个入口都吼**（owner 2026-08-26 实证事故）：本进程在 `/` 上同源伺服
    # STATIC_DIST_DIR，而 dist 是 gitignore 的、`git pull` 不更新它。只在 cmd_platform 里提醒不够——
    # launcher/player/workshop 起的也是这个服务器，直接开 :4000 拿到的同样是那份旧 bundle。
    # 旧 bundle 的症状是「点任何游戏都打开同一个旧演示场」，URL/API/卡带内容全对，人眼查不出来。
    _st = dist_status(ROOT, STATIC_DIST_DIR)
    if _st['state'] == 'stale':
        print(c("  [!! 过期产物 !!]", 'r'), _st['detail'])
        print(c("  [!! 过期产物 !!]", 'r'), "在没重建之前，浏览器里看到的**不是当前代码**（vite 开着时 :5173 不受影响）。")
    elif _st['state'] == 'missing':
        print(c("  [API]", 'y'), _st['detail'])
    # 预热能力目录（07-15 启动提速·诊断根因#2）：/api/catalog 首调冷起 vite-node（本机 3s·owner 机 10-20s），
    # 串在工坊开屏路径上——启动即后台预热，开屏拿热缓存。失败无害（handle_catalog 失败不落缓存·下次调用重试）。
    def _prewarm_catalog():
        try:
            from .games_list import handle_catalog
            handle_catalog()
        except Exception:
            pass
    threading.Thread(target=_prewarm_catalog, daemon=True).start()
    return server
