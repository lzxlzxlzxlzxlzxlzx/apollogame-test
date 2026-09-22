"""已构建前端产物「是不是过期了」的判据（owner 2026-08-26 实证事故）。

事故形状：`zerocraft.py` 同源伺服 `dist/`，而 **dist 是 gitignore 的** —— `git pull` 拉到新代码
永远不会更新它。于是一份**很旧的** bundle 被一直端出来：它比游戏启动器还早，压根不认 `?game=`，
所以**点任何游戏（含以前做好的）都打开同一个引擎演示场**（白色可控方块 + 红/绿方块 + 蓝圆）。
URL 是对的、API 是对的、卡带内容也是对的——只有 bundle 是旧的，因此一路查不到。

雪上加霜的是 2026-08-25 那条蓝屏修复：`/assets/*` 查不到会落穿到 `dist/assets`，
于是**旧 bundle 从"404 蓝屏"变成了"安安静静地跑起来"** —— 症状从"打不开"变成"打开了但是错的"，
后者难查得多。所以判据必须机器化，不能靠人眼看出来。

判据（不依赖构建工具、不读 bundle 内容·纯 mtime）：
    dist/index.html 的 mtime  <  src/ 与 games/ 下任一源文件的 mtime  ⇒ 过期
"""
from pathlib import Path

# 只看会进 bundle 的面（文档/测试改动不算 —— 否则天天报"过期"，报到没人看）。
_SRC_DIRS = ('src', 'games')
_SRC_EXT = ('.ts', '.tsx', '.css')
_ROOT_FILES = ('index.html',)


def newest_source(root: Path) -> tuple[float, str]:
    """源码面最新一次改动的 (mtime, 相对路径)。空树回 (0.0, '')。"""
    best, who = 0.0, ''
    for d in _SRC_DIRS:
        base = root / d
        if not base.is_dir():
            continue
        for p in base.rglob('*'):
            if not p.is_file() or p.suffix not in _SRC_EXT:
                continue
            if p.name.endswith('.test.ts') or p.name.endswith('.test.tsx'):
                continue  # 测试不进 bundle
            try:
                m = p.stat().st_mtime
            except OSError:
                continue
            if m > best:
                best, who = m, str(p.relative_to(root))
    for f in _ROOT_FILES:
        p = root / f
        if p.is_file():
            try:
                m = p.stat().st_mtime
            except OSError:
                continue
            if m > best:
                best, who = m, f
    return best, who


def dist_status(root: Path, dist_dir: Path) -> dict:
    """{state, detail}。state ∈ {'missing','stale','fresh','unknown'}。**只读**，不构建。"""
    index = dist_dir / 'index.html'
    if not index.is_file():
        return {'state': 'missing', 'detail': f'{dist_dir} 里没有 index.html —— 还没构建过前端'}
    try:
        dist_m = index.stat().st_mtime
    except OSError as e:
        return {'state': 'unknown', 'detail': f'读不到 {index}: {e}'}
    src_m, who = newest_source(root)
    if src_m <= 0:
        return {'state': 'unknown', 'detail': '找不到任何源文件（不是源码树？）'}
    if src_m > dist_m:
        lag = int((src_m - dist_m) / 60)
        return {'state': 'stale', 'detail': (
            f'构建产物比源码旧 {lag} 分钟（最新源码 {who}）—— 现在端出去的是**上一次构建的旧界面**，'
            f'点任何游戏都可能打开同一个旧演示场。跑 `python3 zerocraft.py build` 重建。')}
    return {'state': 'fresh', 'detail': '构建产物比源码新（正常）'}
