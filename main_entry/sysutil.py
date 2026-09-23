"""跨平台子进程/颜色输出/进程管理/环境检查/项目信息收集/端口检测/版本 + 基础路径常量（ROOT/ZEROCRAFT_DIR/VITE_PORT）
+ 新旧品牌名过渡期兼容 helper（env()/dir_or_legacy()，REQ-PKG-位置无关与正名·去 Apollo 化 2026-08）。"""
import subprocess
import sys
import os
import signal
import json
import shutil
import socket
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

VITE_PORT = 5173
ZEROCRAFT_DIR = ROOT / '.zerocraft'
_LEGACY_APOLLO_DIR = ROOT / '.apollo'  # 去 Apollo 化过渡期读旧目录 fallback（REQ-PKG-位置无关与正名）
APOLLO_DIR = ZEROCRAFT_DIR  # 向后兼容别名：旧代码 `from .sysutil import APOLLO_DIR` 仍可用，指向新目录

def env(new_name: str, old_name: str | None = None, default=None):
    """新旧环境变量名过渡期读取：新名优先，旧名 fallback（REQ-PKG-位置无关与正名·去 Apollo 化，
    2026-08）。old_name 缺省按 new_name 的 ZEROCRAFT_ 前缀自动推导对应 APOLLO_ 旧名。"""
    if old_name is None and new_name.startswith('ZEROCRAFT_'):
        old_name = 'APOLLO_' + new_name[len('ZEROCRAFT_'):]
    v = os.environ.get(new_name)
    if v is not None:
        return v
    if old_name is not None:
        v = os.environ.get(old_name)
        if v is not None:
            return v
    return default

def dir_or_legacy(*parts) -> Path:
    """给一段相对路径 parts：`.zerocraft/<parts>` 若已存在就用它；否则若旧 `.apollo/<parts>` 存在
    就读旧目录/文件（数据还没迁）；两者都没有就回落新路径（调用方随后自己 mkdir(parents=True) 再写）。
    只管**读**——写永远显式落 ZEROCRAFT_DIR，新数据不会再进旧目录（REQ-PKG-位置无关与正名·
    去 Apollo 化过渡期 fallback：`.apollo/`→`.zerocraft/`）。"""
    new = ZEROCRAFT_DIR.joinpath(*parts)
    if new.exists():
        return new
    legacy = _LEGACY_APOLLO_DIR.joinpath(*parts)
    return legacy if legacy.exists() else new

# ── 跨平台子进程 ──
# Windows 上 npm/npx/vite 是 .cmd 批处理外壳；subprocess 直传裸名 ['npm', ...] 会让
# CreateProcess 找不到可执行映像 → WinError 2。这里在 Windows 经 shell(cmd.exe 按 PATHEXT
# 解析 .cmd)，POSIX 原样执行（行为不变）。所有 npm/npx/git 调用都走它，单点跨平台。
IS_WINDOWS = os.name == 'nt'

def _spawn(cmd: list[str]) -> dict:
    if IS_WINDOWS:
        return {'args': subprocess.list2cmdline(cmd), 'shell': True}
    return {'args': cmd, 'shell': False}

def _node_spawn(args: list[str]) -> dict:
    """Resolve Node once and execute the real binary without a command shell.

    The desktop API can outlive, or be started independently from, the Vite
    process.  On Windows that means its inherited PATH is not guaranteed to
    contain a later-installed Node.js.  Calling the real executable also keeps
    cmd.exe's locale-encoded "command not found" text out of UTF-8 JSON APIs.
    """
    override = env('ZEROCRAFT_NODE')
    candidates = [override, shutil.which('node')]
    if IS_WINDOWS:
        for base in (os.environ.get('ProgramFiles'), os.environ.get('LOCALAPPDATA')):
            if base:
                candidates.append(str(Path(base) / 'nodejs' / 'node.exe'))
        candidates.append(r'C:\Program Files\nodejs\node.exe')
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return {'args': [str(Path(candidate)), *args], 'shell': False}
    raise FileNotFoundError(
        '未找到 Node.js。请安装 Node.js，或通过 ZEROCRAFT_NODE 指定 node 可执行文件。'
    )

def _git(args: list[str]) -> str:
    """跑 git 并**强制 UTF-8 解码**。Windows 上 subprocess.getoutput / text=True 默认按系统
    ANSI 码页（中文系统=GBK）解码——但 git 输出的中文提交信息是 UTF-8，遇 0x80 之类字节即
    UnicodeDecodeError，曾击穿 /status 的 API 线程。这里显式 utf-8 + errors='replace' 单点根治。
    git 是真 .exe（非 .cmd），无需走 shell。"""
    try:
        r = subprocess.run(['git', *args], cwd=ROOT, capture_output=True,
                           encoding='utf-8', errors='replace', timeout=10)
        return r.stdout.strip()
    except Exception:
        return ''

# ── 颜色输出 ──

def c(text, color):
    colors = {'r': '31', 'g': '32', 'y': '33', 'b': '34', 'm': '35', 'c': '36', 'w': '37', 'dim': '90'}
    return f"\033[{colors.get(color, '0')}m{text}\033[0m"

def banner():
    print()
    print(c("  ╔══════════════════════════════════════╗", 'c'))
    print(c("  ║", 'c') + c("     ZEROCRAFT PREVIEW LAUNCHER v0.2     ", 'w') + c("║", 'c'))
    print(c("  ║", 'c') + c("     ECS Game Engine · 26 Atoms      ", 'dim') + c("║", 'c'))
    print(c("  ╚══════════════════════════════════════╝", 'c'))
    print()

# ── 进程管理 ──

_processes: list[subprocess.Popen] = []

def _cleanup(sig=None, frame=None):
    print(c("\n  [SHUTDOWN]", 'y'), "Stopping all services...")
    for p in _processes:
        try:
            p.terminate()
            p.wait(timeout=3)
        except Exception:
            p.kill()
    sys.exit(0)

signal.signal(signal.SIGINT, _cleanup)
signal.signal(signal.SIGTERM, _cleanup)

# ── 环境检查 ──

def _missing_deps() -> list[str]:
    """node_modules 里缺哪些 package.json 声明的 dependencies（含 scoped 如 @types/three）。
    check_env 原来只看 node_modules 在不在——但 git pull 新增依赖（如 three/cannon-es）后，旧的
    node_modules 仍在→不重装→Vite 一堵 'could not be resolved' 墙。这里逐个核对，且**读
    package.json 而非硬编码依赖名**，未来加依赖自动覆盖。返回 ['<all>'] 表示 node_modules 整个缺。"""
    nm = ROOT / 'node_modules'
    if not nm.exists():
        return ['<all>']
    try:
        pkg = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    except Exception:
        return []
    deps = list(pkg.get('dependencies', {}).keys())
    return [d for d in deps if not (nm / Path(d)).exists()]

def check_env():
    if not shutil.which('npm') or not shutil.which('node'):
        print(c("  [ERROR]", 'r'), "npm/node not found.")
        sys.exit(1)
    missing = _missing_deps()
    if missing == ['<all>']:
        # 全新 clone：node_modules 整个没有 → 装一次（装完就有，天然不会每次重复）。
        print(c("  [SETUP]", 'y'), "Installing dependencies…（首次 clone）")
        subprocess.call(**_spawn(['npm', 'install']), cwd=ROOT)
    elif missing:
        # node_modules 在、只缺个别依赖（多半 git pull 新增依赖后没重装）。**只告警、绝不自动装**：
        # 每次启动都自动 npm install 有两宗罪——① 装不动的机器（受限网络/离线）上会退化成"每次启动空跑
        # 一遍 npm install"、每次多等好几秒；② 就算装得动，npm install 会动 node_modules/lockfile →
        # Vite 判定依赖变了 → 每次启动都把 three/react 重新预打包一遍（再 +1~2s）。这正是"每次启动时间
        # +1"的根。留一行清楚指引、让用户手动补一次即可，之后启动全走 Vite 暖缓存、飞快。
        print(c("  [WARN]", 'y'), f"缺少依赖 {', '.join(missing)} —— 请手动运行 npm install 补齐（package.json 更新后一次即可）")

# ── 项目信息收集 ──

def get_project_status() -> dict:
    branch = _git(['branch', '--show-current'])
    last_commit = _git(['log', '--oneline', '-1'])
    # 跨平台数测试文件（原 find|wc 是 unix-ism，在 Windows 上失效 → 计数恒 0）。
    src_dir = ROOT / 'src'
    test_count = (
        len(list(src_dir.rglob('*.test.ts')) + list(src_dir.rglob('*.test.tsx')))
        if src_dir.exists()
        else 0
    )

    atom_dir = ROOT / 'src' / 'skills' / 'atoms'
    atoms = len([d for d in atom_dir.iterdir() if d.is_dir() and (d / 'index.ts').exists()]) if atom_dir.exists() else 0

    themes_dir = ROOT / 'src' / 'ui' / 'themes'
    themes = [d.name for d in themes_dir.iterdir() if d.is_dir() and (d / 'spec.md').exists()] if themes_dir.exists() else []

    skills_dir = ROOT / 'wiki' / 'skills'
    skill_count = len(list(skills_dir.glob('*.md'))) if skills_dir.exists() else 0

    games_dir = ROOT / 'docs' / 'game-design'
    games = [f.stem for f in games_dir.glob('*.md')] if games_dir.exists() else []

    return {
        'branch': branch,
        'lastCommit': last_commit,
        'atoms': atoms,
        'testFiles': test_count,
        'themes': themes,
        'skillModules': skill_count,
        'games': games,
    }

def run_command(cmd: list[str], timeout: int = 120) -> dict:
    try:
        result = subprocess.run(**_spawn(cmd), cwd=ROOT, capture_output=True,
                                encoding='utf-8', errors='replace', timeout=timeout)
        return {
            'success': result.returncode == 0,
            'stdout': result.stdout[-4000:] if len(result.stdout) > 4000 else result.stdout,
            'stderr': result.stderr[-2000:] if len(result.stderr) > 2000 else result.stderr,
            'code': result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {'success': False, 'stdout': '', 'stderr': 'Command timed out', 'code': -1}
    except Exception as e:
        return {'success': False, 'stdout': '', 'stderr': str(e), 'code': -1}


# ── 端口检测 ──

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0

def handle_version() -> dict:
    """GET /api/version。发布版本单一真相：优先最近 git tag（发布态）→ 无 tag 回退 package.json version。
    工作台账号卡/页脚显示的版本走此端点，随发布自动更新（不写死）。"""
    version, tag = None, None
    try:
        r = subprocess.run(['git', 'describe', '--tags', '--abbrev=0'],
                           cwd=ROOT, capture_output=True, text=True, timeout=3)
        if r.returncode == 0 and r.stdout.strip():
            tag = r.stdout.strip()
            version = tag.lstrip('vV')
    except Exception:
        pass
    if not version:
        try:
            version = json.loads((ROOT / 'package.json').read_text())['version']
        except Exception:
            version = '0.1.0'
    return {'version': version, 'tag': tag}
