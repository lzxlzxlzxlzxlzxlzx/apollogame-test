#!/usr/bin/env python3
"""「过期构建产物必须喊出来」回归钉（owner 2026-08-26 实证事故）。

事故：平台同源伺服的 dist 是 gitignore 的，git pull 不更新它。一份比启动器还早的旧 bundle
被一直端出来 ⇒ **点任何游戏（含以前做好的）都打开同一个引擎演示场**，而 URL/API/卡带内容全对，
从 mock 一路查到模板才定位到。加上 2026-08-25 的 /assets 落穿修复，旧 bundle 从"404 蓝屏"
变成"安静地跑起来"——症状从"打不开"变成"打开了但是错的"，更难查。

四腿（全在临时目录上跑·不碰真 dist）：
  ① 源码比产物新 → stale（撤掉比较即红）
  ② 产物比源码新 → fresh（不误报·否则天天喊到没人看）
  ③ 没有产物 → missing（区别于 stale：文案不一样）
  ④ 只改测试/文档不算新（测试不进 bundle·否则跑完测试就报过期）
用法：python3 scripts/dist-staleness-guard.py（退出码 0=绿）
"""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from main_entry.dist_check import dist_status  # noqa: E402

PASS = FAIL = 0


def check(ok: bool, name: str, detail: str = '') -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f'  ✓ {name}')
    else:
        FAIL += 1
        print(f'  ✗ {name}' + (f' — {detail}' if detail else ''))


def mk(tmp: Path, src_mtime: float, dist_mtime: float | None, *, src_name='app.ts') -> Path:
    root = tmp
    (root / 'src').mkdir(parents=True, exist_ok=True)
    f = root / 'src' / src_name
    f.write_text('export const x = 1;\n', encoding='utf-8')
    os.utime(f, (src_mtime, src_mtime))
    if dist_mtime is not None:
        (root / 'dist').mkdir(parents=True, exist_ok=True)
        idx = root / 'dist' / 'index.html'
        idx.write_text('<html></html>', encoding='utf-8')
        os.utime(idx, (dist_mtime, dist_mtime))
    return root


with tempfile.TemporaryDirectory() as td:
    base = Path(td)

    r1 = mk(base / 'a', src_mtime=2_000_000_000, dist_mtime=1_000_000_000)
    st1 = dist_status(r1, r1 / 'dist')
    check(st1['state'] == 'stale', '① 源码比产物新 → stale', st1['state'])
    check('zerocraft.py build' in st1['detail'], '① 文案直接给出重建命令（别让人再猜一轮）')
    check('app.ts' in st1['detail'], '① 文案点名是哪个文件更新的（可核对）')

    r2 = mk(base / 'b', src_mtime=1_000_000_000, dist_mtime=2_000_000_000)
    check(dist_status(r2, r2 / 'dist')['state'] == 'fresh', '② 产物比源码新 → fresh（不误报）')

    r3 = mk(base / 'c', src_mtime=1_000_000_000, dist_mtime=None)
    st3 = dist_status(r3, r3 / 'dist')
    check(st3['state'] == 'missing', '③ 没有产物 → missing', st3['state'])
    check('还没构建过' in st3['detail'], '③ missing 与 stale 文案分得开')

    # ④ 只有测试文件更新：不算源码更新（测试不进 bundle）
    r4 = mk(base / 'd', src_mtime=1_000_000_000, dist_mtime=1_500_000_000)
    t = r4 / 'src' / 'app.test.ts'
    t.write_text('test', encoding='utf-8')
    os.utime(t, (2_000_000_000, 2_000_000_000))
    check(dist_status(r4, r4 / 'dist')['state'] == 'fresh', '④ 只改测试不报过期（否则跑完测试就报，报到没人看）')

# ⑤ 告警接线：**每个入口都要吼**，不能只在 cmd_platform 里提醒——
#    launcher/player/workshop 起的是同一个 API 服务器，直接开 :4000 拿到的同样是那份旧 bundle。
_srv = (ROOT / 'main_entry' / 'server.py').read_text(encoding='utf-8')
check('dist_status(' in _srv and '过期产物' in _srv, '⑤ 告警接在 start_api_server（所有入口共用）')
check(_srv.index('dist_status(') > _srv.index('def start_api_server'), '⑤ 告警在服务器起来时就打，不是等人去点')
_cli = (ROOT / 'main_entry' / 'cli.py').read_text(encoding='utf-8')
check('过期产物' not in _cli, '⑤ cmd_platform 里不再重复一份（同一句吼两遍等于没吼）')

print(f'\nDIST-STALENESS-GUARD: {"PASS" if FAIL == 0 else "FAIL"} ({PASS} passed, {FAIL} failed)')
sys.exit(0 if FAIL == 0 else 1)
