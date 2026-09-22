#!/usr/bin/env python3
"""平台静态伺服冒烟（owner 2026-08-25 蓝屏实证的回归钉）。

病根：`/assets/*` 路由被素材库处理器独占（只查 ROOT/assets/），而 vite **日常 build** 把应用
bundle 放 dist/assets/*——python 同源伺服日常 dist 时 bundle 404 → 首屏永不挂载 = 深蓝空屏。
修 = `_serve_assets` 素材库查不到落到 STATIC_DIST_DIR/assets（穿越防护不降级）。

四腿：① bundle 落穿 200（撤 server.py 那段 fall-through 即红）② 素材库仍优先命中（不回归）
③ 路径穿越仍挡 ④ 两边都没有 → 真 404。全程临时 dist·真 ROOT/assets 只读。
用法：python3 scripts/platform-static-smoke.py（退出码 0=绿）
"""
import sys
import tempfile
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from main_entry import server as S  # noqa: E402

PASS = FAIL = 0


def check(ok: bool, name: str, detail: str = '') -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f'  ✓ {name}')
    else:
        FAIL += 1
        print(f'  ✗ {name}  {detail}')


def get_status(port: int, path: str) -> int:
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=5) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        dist = Path(td) / 'dist'
        (dist / 'assets').mkdir(parents=True)
        (dist / 'index.html').write_text('<html>x</html>')
        (dist / 'assets' / 'index-zztest.js').write_text('console.log(1)')
        orig_dist = S.STATIC_DIST_DIR
        S.STATIC_DIST_DIR = dist
        srv = ThreadingHTTPServer(('127.0.0.1', 0), S.APIHandler)
        port = srv.server_address[1]
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        try:
            check(get_status(port, '/assets/index-zztest.js') == 200,
                  '① 应用 bundle 落穿到 dist/assets（蓝屏病根·撤 fall-through 即红）')
            # 素材库真文件优先命中（不因 fall-through 回归）——取 ROOT/assets 下任一真文件
            lib_file = next((p for p in (ROOT / 'assets').rglob('*') if p.is_file()), None)
            if lib_file is not None:
                rel = lib_file.relative_to(ROOT / 'assets').as_posix()
                check(get_status(port, f'/assets/{rel}') == 200, f'② 素材库仍优先命中（{rel}）')
            else:
                check(True, '② 素材库为空·跳过（容器无 assets 内容）')
            check(get_status(port, '/assets/..%2f..%2fpackage.json') in (403, 404),
                  '③ 路径穿越仍挡（403/404 皆合格·绝不 200）')
            check(get_status(port, '/assets/zz-none.js') == 404, '④ 两边皆无 → 真 404 不吞')
        finally:
            srv.shutdown()
            S.STATIC_DIST_DIR = orig_dist
    print(f'\n平台静态伺服冒烟：{PASS} 通过，{FAIL} 失败')
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
