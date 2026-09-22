#!/usr/bin/env python3
"""创作闭环回归钉（独立审查 2026-09-12 打回的六条·owner 令「该补足的补足」）。

审查方一句话总结病灶：**能生成、能运行，却没有证据证明生成的是设计要求的那个游戏**。
本冒烟守住其中**能机器判**的那几条（判不了"忠实实现"，那需要验收剧本，属 S5）：

  ① 编号 slug 不许与手写游戏撞脸（`game-104` vs `game104`）—— 真根因，复跑挖出来的
  ② 建库重试复用空壳，不再产 `xxx-2` 孤儿（含第二轮实伤：中文名按 slug 找永远找不到 · 有设计稿的不许当残骸）
  ③ git 版本保存失败不许报成功（假成功 = 回滚的底牌悄悄没了）
  ④ 生成成功路径要带上引擎告警（软环/降级/兼容性不许静默）
  ⑤ 原型生成前的计划体检：编造的 capability id / 未裁决的缺口要报出来
  ⑥ catalog 两阶段：`--names` 真的只出索引（首版加不加参数输出一模一样）

用法：python3 scripts/creation-loop-guard.py（退出码 0=绿）
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

PASS = FAIL = 0


def check(ok, name, detail=''):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f'  ✓ {name}')
    else:
        FAIL += 1
        print(f'  ✗ {name}' + (f' — {detail}' if detail else ''))


# ── ① 编号不撞手写游戏 ────────────────────────────────────────────────
from main_entry import paths  # noqa: E402

# WARN 判据必须在**合成树**上跑，不能在活仓上跑（撤修验红两次抓到）：
#   · 首版拿 `paths._GAME_NO_BASES` 算「已占用」→ 撤掉扫描面时判据跟着缩，自指恒绿；
#   · 改成写死四处之后仍不红 —— 因为活仓里最大号（game211）恰好躺在被扫的 public/games 里，
#     少扫 games/ 与 docs/design 这棵树**看不出来**。
# 所以造一棵「最大号只住在 games/ 与 docs/design」的树，让缺陷无处可藏。
_probe = Path(tempfile.mkdtemp())
_old_root, _old_lib = paths.ROOT, paths.LIBRARY_DIR
try:
    (_probe / 'library').mkdir()
    (_probe / 'public' / 'games').mkdir(parents=True)
    (_probe / 'public' / 'games' / 'game-003').mkdir()      # 被扫面里的小号
    (_probe / 'games').mkdir()
    (_probe / 'games' / 'game104').mkdir()                  # 手写写法·住在没被扫的地方
    (_probe / 'docs' / 'design').mkdir(parents=True)
    (_probe / 'docs' / 'design' / 'game110').mkdir()        # 同上·且是最大号
    paths.ROOT, paths.LIBRARY_DIR = _probe, _probe / 'library'
    nxt = paths._next_game_no()
    n = int(nxt.rsplit('-', 1)[1])
    check(n > 110, f'① 编号越过手写游戏（{nxt} 应 > game110·此前会发 game-004 撞 game104 那一族）',
          f'实得 {nxt}')
    check(nxt not in ('game-004', 'game-104', 'game-110'), f'① 不发已被占用的号（实得 {nxt}）')
finally:
    paths.ROOT, paths.LIBRARY_DIR = _old_root, _old_lib
    shutil.rmtree(_probe, ignore_errors=True)

check(paths._GAME_NO_RE.fullmatch('game104') is not None and paths._GAME_NO_RE.fullmatch('game-104') is not None,
      '① 两种写法都认（game104 与 game-104 是同一个编号）')
check('games' in paths._GAME_NO_BASES and 'docs/design' in paths._GAME_NO_BASES,
      '① 手写游戏住的两处也在扫描面里')

# ── ② 建库重试复用空壳 ────────────────────────────────────────────────
from main_entry import library as L, library_api as LA  # noqa: E402

tmp = Path(tempfile.mkdtemp())
_old_lib = paths.LIBRARY_DIR
try:
    paths.LIBRARY_DIR = LA.LIBRARY_DIR = L.LIBRARY_DIR = tmp
    _, r1 = LA.library_create({'name': 'Retry Probe', 'description': 'x'})
    _, r2 = LA.library_create({'name': 'Retry Probe', 'description': 'x'})
    check(r1.get('slug') == r2.get('slug'), '② 同名重试复用同一个 slug（不再产 xxx-2 孤儿）',
          f"{r1.get('slug')} vs {r2.get('slug')}")
    check(r2.get('reused') is True, '② 复用这件事要如实报出来（reused=true·别假装是新建）')
    check(len(list(tmp.iterdir())) == 1, '② 盘上只留一个目录', str(list(tmp.iterdir())))
    # 非空的同名项目照旧 dedup —— 那是作者真的想要第二个，不许吞掉他的成果
    gd = tmp / r1['slug']
    (gd / 'manifest.json').write_text(json.dumps({'capabilities': [], 'entities': {'hero': {}}}), encoding='utf-8')
    _, r3 = LA.library_create({'name': 'Retry Probe', 'description': 'x'})
    check(r3.get('slug') != r1.get('slug'), '② 非空同名项目照旧新建（不吞掉作者已有的成果）')

    # WARN **中文名这一腿是第二轮打回的实伤，不是补充**（审查方实测复现：测试小游戏 → game-212，
    #      重试 → game-213，reused=False；同样的操作换英文名就正常复用）。根因：中文名走
    #      `_slugify` → `_next_game_no()`，而它**每次调用都发一个新号** ⇒ 两次的 base 不是同一个
    #      字符串 ⇒ 按 slug 找空壳永远找不到。修法是按 `meta.name` 找。
    _, c1 = LA.library_create({'name': '测试小游戏', 'description': 'x'})
    _, c2 = LA.library_create({'name': '测试小游戏', 'description': 'x'})
    check(c1.get('slug') == c2.get('slug'), '② **中文名**同名重试也复用（按名字找空壳·不按 slug）',
          f"{c1.get('slug')} vs {c2.get('slug')}")
    check(c2.get('reused') is True, '② 中文名复用同样如实报 reused=true')
    check(sum(1 for p in tmp.iterdir() if p.is_dir()) == 3,
          '② 中文名重试没有留下第二个孤儿目录', str(sorted(p.name for p in tmp.iterdir())))

    # WARN 「零实体 = 失败空壳」**不成立**（第二轮打回的正确意见）：DesignStudio 的正常流程就是
    #      先建库、先讨论、先落 design/*.md，实体以后才有。只看实体数会把这种真项目当残骸覆盖掉。
    _, d1 = LA.library_create({'name': 'Design First', 'description': 'x'})
    ddir = tmp / d1['slug'] / 'design'
    ddir.mkdir(parents=True, exist_ok=True)
    (ddir / 'gdd.md').write_text('# 设计稿\n', encoding='utf-8')
    _, d2 = LA.library_create({'name': 'Design First', 'description': 'x'})
    check(d2.get('slug') != d1.get('slug'),
          '② 有设计稿的同名项目**不被复用**（刚写完策划案还没摆实体的真项目不是残骸）',
          f"{d1.get('slug')} vs {d2.get('slug')}")
    check((ddir / 'gdd.md').is_file() and (ddir / 'gdd.md').read_text(encoding='utf-8').startswith('#'),
          '② 且他的设计稿原封不动（复用会覆盖 meta·这就是为什么判据必须收紧）')

    # 有能力但零实体的同样不算空壳（摆了能力 = 有人真往里放过东西）
    _, e1 = LA.library_create({'name': 'Caps Only', 'description': 'x'})
    (tmp / e1['slug'] / 'manifest.json').write_text(
        json.dumps({'capabilities': ['a1-transform'], 'entities': {}}), encoding='utf-8')
    _, e2 = LA.library_create({'name': 'Caps Only', 'description': 'x'})
    check(e2.get('slug') != e1.get('slug'), '② 有能力零实体的同名项目也不被复用')

    # ── ③ git 假成功 ──────────────────────────────────────────────
    gd2 = tmp / 'git-probe'
    gd2.mkdir()
    (gd2 / 'manifest.json').write_text('{}', encoding='utf-8')
    if L._git_ok():
        # WARN **每一步各要一个夹具**：上游的检查会把下游的挡住，一个夹具只能守住最先失败的那一步
        #      （撤修验红实证：只用「坏仓」夹具时，撤掉 commit 的退出码检查照样全绿——
        #       因为 add 先失败先返回了）。所以坏仓守 init/add，失败钩子守 commit。
        (gd2 / '.git').write_text('not a repo', encoding='utf-8')     # 坏仓：add 必失败
        check(L._git_commit_all(gd2, 'probe') is False, '③a 坏仓 → False（走快照降级·不假报成功）')
        (gd2 / '.git').unlink()

        check(L._git_commit_all(gd2, 'probe') is True, '③b 正常路径仍返回 True（没有误伤）')
        check(L._git_commit_all(gd2, 'probe again') is True, '③c 「内容没变」当成功（nothing to commit 是正常路径）')

        # 好仓 + 会失败的 pre-commit 钩子：init/add 都成功，**只有 commit 失败** → 专守 commit 那道检查
        hooks = gd2 / '.git' / 'hooks'
        hooks.mkdir(parents=True, exist_ok=True)
        hook = hooks / 'pre-commit'
        hook.write_text('#!/bin/sh\nexit 1\n', encoding='utf-8')
        os.chmod(hook, 0o755)
        (gd2 / 'manifest.json').write_text('{"changed":1}', encoding='utf-8')
        check(L._git_commit_all(gd2, 'probe hooked') is False,
              '③d commit 被钩子拒绝 → False（init/add 都成功·只有 commit 失败·专守这道检查）')
        hook.unlink()
    else:
        check(True, '③ 本机无 git —— 跳过（守卫不误报）')
finally:
    paths.LIBRARY_DIR = LA.LIBRARY_DIR = L.LIBRARY_DIR = _old_lib
    shutil.rmtree(tmp, ignore_errors=True)

# ── ④ 生成成功路径带告警 ──────────────────────────────────────────────
src = (ROOT / 'main_entry' / 'generation.py').read_text(encoding='utf-8')
check('warnings.extend' in src and '引擎校验告警' in src,
      '④ 成功路径把 manifest-check 的告警并进 warnings（首版整段丢掉）')
api_src = (ROOT / 'main_entry' / 'library_api.py').read_text(encoding='utf-8')
check("'warnings': warn_lines" in api_src, '④ 保存接口回的 warnings 是数组（前端可逐条渲染）')
ui_src = (ROOT / 'src' / 'launcher.tsx').read_text(encoding='utf-8')
check('savedNext.warnings' in ui_src, '④ 前端真把 warnings 画出来（声明了字段却不渲染 = 等于没有）')

# WARN 上面那条只守住了 Launcher 那一条路。**DesignStudio 这条路当时是假覆盖**（第二轮打回）：
#      服务端 `_handle_prototype` 早就把 planCheck/warnings 原样带回了，可 DesignStudio 既不存也不画，
#      作者在创作台里从头到尾看不见「编造的能力 id / 未裁的缺口」。字段在、渲染没有 = 等于没有。
ds_src = (ROOT / 'src' / 'studio' / 'DesignStudio.tsx').read_text(encoding='utf-8')
check('d.planCheck' in ds_src and 'setPlanCheck' in ds_src,
      '④ DesignStudio 真把服务端回的 planCheck 收下来（此前整块丢掉）')
check('setGenWarnings' in ds_src and 'genWarnings.map' in ds_src,
      '④ 且把 warnings **逐条画出来**（不是只存不画）')
check('unknownIds' in ds_src and 'pendingGaps' in ds_src,
      '④ 编造的能力 id 与未裁决缺口在界面上点名（这两条是体检的全部价值）')
check('onSaved(slug, genWarnings' in ds_src,
      '④ 保存入库时把告警传给 Launcher（否则横幅那条路对 DesignStudio 永远是空的）')

# ── ⑤ 原型前的计划体检 ────────────────────────────────────────────────
from main_entry.design_flow import check_plan  # noqa: E402

r = check_plan({'capability-plan.md': '消费 `t2-steering`；还要 `t2-totally-made-up`\n- ⏳ 待裁：某缺口'})
check(r['hasPlan'] is True, '⑤ 认得出计划在档')
check('t2-totally-made-up' in r['unknownIds'], '⑤ 编造的 capability id 要报出来')
check('t2-steering' not in r['unknownIds'], '⑤ 真实存在的不许误报')
check(len(r['pendingGaps']) == 1, '⑤ 未裁决的缺口（⏳/待裁）要报出来')
check(check_plan({})['hasPlan'] is False, '⑤ 压根没有 capability-plan 也要报（= 跳过了 S2）')

# WARN **产品路径也得省**（第二轮打回）：首版把索引面只写在 CLI 里，于是「省上下文」只有命令行
#      享受得到——浏览器照旧 buildCapabilityCatalog 全量 → POST 给服务端，一个字节没省。
#      同一判据只许有一份实现（放共享模块），两边都 import 它。
cat_src = (ROOT / 'src' / 'assembly' / 'capability-catalog.ts').read_text(encoding='utf-8')
check('export function buildCapabilityIndex' in cat_src,
      '⑥ 索引面实现在共享模块（不是只活在 CLI 脚本里）')
cli_src = (ROOT / 'scripts' / 'dump-capability-catalog.mjs').read_text(encoding='utf-8')
check('buildCapabilityIndex' in cli_src and 'namesCatalog = buildCapabilityIndex' in cli_src,
      '⑥ CLI 改 import 共享实现（两份实现必然一边修好一边照旧）')
ui_src2 = (ROOT / 'src' / 'launcher.tsx').read_text(encoding='utf-8')
check('buildCapabilityIndex' in ui_src2 and 'catalogIndex' in ui_src2,
      '⑥ 产品路径真的把索引面建出来并传下去')
check('catalog: catalogIndex ?? catalog' in ds_src,
      '⑥ 分解阶段发索引面（出 manifest 那步仍发全量·省不得的地方不省）')

# ── ⑥ catalog 两阶段 ──────────────────────────────────────────────────
def dump(*args):
    p = subprocess.run(['npx', 'vite-node', 'scripts/dump-capability-catalog.mjs', *args],
                       cwd=ROOT, capture_output=True, encoding='utf-8', timeout=300)
    return p.stdout or ''


full, names = dump(), dump('--names')
check(len(names) < len(full) * 0.3, f'⑥ --names 真的只出索引（{len(names)} vs 全量 {len(full)} 字符）')
check('t2-steering' in names, '⑥ 索引里有 id（模型据此挑件）')
check('provides' not in names and 'fields' not in names, '⑥ 索引里没有 schema（省的就是这部分）')
only = dump('--only', 't2-steering')
check(0 < len(only) < len(full) * 0.1, f'⑥ --only 只出点名那几件（{len(only)} 字符）')

print(f'\nCREATION-LOOP: {"PASS" if FAIL == 0 else "FAIL"} ({PASS} passed, {FAIL} failed)')
sys.exit(0 if FAIL == 0 else 1)
