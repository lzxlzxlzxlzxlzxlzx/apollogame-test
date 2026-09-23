"""生产流程板（八阶段机器门/人门）。"""
import subprocess
import json
import re
import threading

from .paths import _valid_slug
from .sysutil import ROOT, _node_spawn, c

# ── 生产流程板（owner 2026-07-10「N 步拆分·每步 review·不能只靠手册」）────────────
# 大脑在 scripts/game-pipeline.mjs（八阶段·机器门证据带内容指纹·人门 signoff 落账）；
# 本端点薄胶水 shell 调。gate 会真跑 vitest/tsc/build（S8 最重）→ 单独长超时。

_PIPE_STAGE_RE = re.compile(r'S[1-8]')

def _pipeline_cli(args: list, timeout: int = 120) -> dict:
    """shell scripts/game-pipeline.mjs → 解析末行 JSON。"""
    try:
        proc = subprocess.run(**_node_spawn(['scripts/game-pipeline.mjs', *args]), cwd=ROOT, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': '生产流程板执行超时'}
    except OSError as e:
        return {'ok': False, 'error': f'生产流程板无法启动: {e}'}
    out = proc.stdout.decode('utf-8', 'replace').strip()
    line = out.splitlines()[-1] if out else ''
    try:
        return json.loads(line)
    except Exception:
        err = proc.stderr.decode('utf-8', 'replace').strip() or out
        return {'ok': False, 'error': f'解析失败: {err[:400]}'}

def handle_pipeline_board(slug: str) -> dict:
    """GET /api/pipeline?slug=<slug>。八阶段看板（纯推导·不跑重活）。"""
    if not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug or "(空)"}'}
    res = _pipeline_cli(['board', slug, '--json'])
    return {'success': bool(res.get('ok')), **res}

def handle_pipeline_gate(body: dict) -> dict:
    """POST /api/pipeline/gate {slug, stage}。真跑该阶段机器门→记证据（S8=tsc+vitest+build·最长 15 分钟）。"""
    slug = str(body.get('slug', '')).strip(); stage = str(body.get('stage', '')).strip()
    if not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug or "(空)"}'}
    if not _PIPE_STAGE_RE.fullmatch(stage):
        return {'success': False, 'error': f'非法阶段: {stage or "(空)"}'}
    res = _pipeline_cli(['gate', slug, stage], timeout=900)
    if res.get('ok'):
        print(c("  [PIPE]", 'g'), f"gate {slug} {stage} → {res.get('summary', '')[:80]}")
    return {'success': bool(res.get('ok')), **res}

def handle_pipeline_concept(body: dict) -> dict:
    """POST /api/pipeline/concept {slug, name?, pitch?, refs?, style?, planWaiver?}。写/改立项卡
    （≥1 个字段·REQ-WORKSHOP C1：S1 从此有 UI 通道·CLI 同语义）。"""
    slug = str(body.get('slug', '')).strip()
    if not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug or "(空)"}'}
    fields = [('name', '--name', 80), ('pitch', '--pitch', 300), ('refs', '--refs', 300),
              ('style', '--style', 300), ('planWaiver', '--plan-waiver', 300)]
    args = ['concept', slug]
    for key, flag, cap in fields:
        if key not in body:
            continue
        val = str(body.get(key) or '').strip()
        if len(val) > cap:
            return {'success': False, 'error': f'{key} 过长（≤{cap} 字）'}
        args += [flag, val]
    if len(args) == 2:
        return {'success': False, 'error': '至少提供一个立项卡字段（name/pitch/refs/style/planWaiver）'}
    res = _pipeline_cli(args)
    return {'success': bool(res.get('ok')), **res}

def handle_pipeline_signoff(body: dict) -> dict:
    """POST /api/pipeline/signoff {slug, stage, note, by?}。人门落账（note 必填=review 内容）。"""
    slug = str(body.get('slug', '')).strip(); stage = str(body.get('stage', '')).strip()
    note = str(body.get('note', '')).strip(); by = str(body.get('by', '')).strip() or 'owner'
    if not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug or "(空)"}'}
    if not _PIPE_STAGE_RE.fullmatch(stage):
        return {'success': False, 'error': f'非法阶段: {stage or "(空)"}'}
    if not note:
        return {'success': False, 'error': '人门必须带 note（review 内容落账·不许空签）'}
    if len(note) > 500 or len(by) > 40:
        return {'success': False, 'error': 'note ≤500 字 · by ≤40 字'}
    res = _pipeline_cli(['signoff', slug, stage, '--note', note, '--by', by])
    return {'success': bool(res.get('ok')), **res}

# ── 向导模式（REQ-PIPESOFT P1b·PST 域）──────────────────────────────────────
# 本节全部薄封装既有 CLI：scripts/game-pipeline.mjs（concept·已用于上面）+
# scripts/pipeline-orchestrator.mjs（P1a 已落地·dispatch/status/abort·退出码 0-4 语义见其头注）。
# 编排器自己的锁文件 + 运行台账（.zerocraft/orchestrator.lock · orchestrator-runs.json）是唯一真相——
# 本文件不建第二个任务注册表，只做「shell 出去 + 短等快路径 + 转发」。

def _orch_cli_sync(args: list, timeout: int = 20) -> dict:
    """短活命令（status/abort）：shell → 末行 JSON + 退出码。永不抛。"""
    try:
        proc = subprocess.run(**_node_spawn(['scripts/pipeline-orchestrator.mjs', *args, '--json']),
                               cwd=ROOT, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': '编排器命令执行超时', '_exit': None}
    except OSError as e:
        return {'ok': False, 'error': f'编排器无法启动: {e}', '_exit': None}
    out = proc.stdout.decode('utf-8', 'replace').strip()
    line = out.splitlines()[-1] if out else ''
    try:
        data = json.loads(line)
    except Exception:
        err = proc.stderr.decode('utf-8', 'replace').strip() or out
        data = {'ok': False, 'error': f'解析失败: {err[:400]}'}
    data['_exit'] = proc.returncode
    return data

def _orch_reap(proc, slug: str, stage: str) -> None:
    """收尸线程（不杀·只等它自然退出），**并在它退出后自动存档**。

    owner 2026-08-10 实撞：「开工跑完以后结果就没了、也没上传，那就等于白跑了」。根因不是产物没生成，
    而是编排会话写出的 `docs/design/<slug>/` 与游戏目录**全躺在工作区没提交**——换台机器/重新 clone 即丢。
    这里是「一次开工真正结束」的唯一时刻（编排器此时已落台账、放锁），故自动存档挂在这儿：
    先本地提交 → 跑门禁 → 绿了才推（顺序见 artifacts.auto_sync）。永不抛。"""
    try:
        proc.communicate()
    except Exception:
        pass
    try:
        from . import artifacts
        artifacts.auto_sync(slug, reason=f'开工 {stage}')   # 本线程已是后台线程 → 直接跑，不必再套一层
    except Exception as e:
        print(c("  [AUTO]", 'y'), f"{slug} 开工收尾自动存档异常: {e}")


def _orch_dispatch_kickoff(slug: str, stage: str, quick_wait: float = 2.5) -> dict:
    """起 `orchestrator dispatch` 子进程，只等 quick_wait 秒——够吃「起会话前」就会退出的快路径
    （NO_RUNTIME=3 · LOCKED=4 · USAGE 类=2，均在占锁/起会话之前判定，秒退）。没秒退=真起了一个
    LLM 会话（分钟级·图纸未定绝对上限）——不等，交子进程在后台自己跑完；编排器自己落台账+放锁，
    前端改轮询 status。子进程仍是本进程的子进程（非 daemon 分离）：起个收尸线程等它退出，防僵尸。"""
    try:
        proc = subprocess.Popen(**_node_spawn(['scripts/pipeline-orchestrator.mjs', 'dispatch', slug, stage, '--json']),
                                 cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        return {'quick': True, 'ok': False, 'code': 'SPAWN_ERROR', 'reason': f'编排器子进程起不来: {e}'}
    try:
        out, err = proc.communicate(timeout=quick_wait)
    except subprocess.TimeoutExpired:
        threading.Thread(target=_orch_reap, args=(proc, slug, stage), daemon=True).start()
        return {'quick': False}
    text = (out or b'').decode('utf-8', 'replace').strip()
    line = text.splitlines()[-1] if text else ''
    try:
        data = json.loads(line)
    except Exception:
        data = {'ok': False, 'code': 'PARSE_ERROR',
                 'reason': ((err or b'').decode('utf-8', 'replace').strip()[:400] or text[:400])}
    return {'quick': True, **data}

def handle_pipeline_wizard_concept(body: dict) -> dict:
    """POST /api/pipeline/wizard-concept {slug, pitch}。向导「一句话入口」（图纸 §P1b①）：
    原样落一句话为 S1 pitch（concept CLI·两分支共同前置）；有编排运行时→再派一个 S1 微会话把它
    扩成完整草稿（名字/参考·会话自己按 S1 手册回写 concept CLI）——本端点不代填名字。"""
    slug = str(body.get('slug', '')).strip()
    pitch = str(body.get('pitch', '')).strip()
    if not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug or "(空)"}'}
    if not pitch:
        return {'success': False, 'error': '一句话玩法不能为空'}
    if len(pitch) > 300:
        return {'success': False, 'error': '一句话玩法过长（≤300 字）'}
    seed = _pipeline_cli(['concept', slug, '--pitch', pitch])
    if not seed.get('ok'):
        return {'success': False, 'error': seed.get('error') or '一句话落 pitch 失败'}
    r = _orch_dispatch_kickoff(slug, 'S1')
    if r.get('quick'):
        code = r.get('code')
        if code == 'NO_RUNTIME':
            return {'success': True, 'ranSession': False, 'slug': slug, 'concept': seed.get('concept'),
                    'reason': '✓ 一句话已落 pitch——本机无编排运行时，名字/参考请手填（板照常手动用）。'}
        # 其它快路径（USAGE/UNKNOWN_GAME 等）：pitch 已落，仅会话没派成——原样把编排器理由带回去。
        return {'success': True, 'ranSession': False, 'slug': slug, 'concept': seed.get('concept'),
                'reason': f"✓ 一句话已落 pitch；S1 微会话未派：{r.get('reason') or code}"}
    return {'success': True, 'ranSession': True, 'slug': slug, 'concept': seed.get('concept'),
            'reason': '✓ 一句话已落 pitch·已派 S1 微会话扩草稿——轮询编排器状态看进度'}

def handle_pipeline_orch_dispatch(body: dict) -> dict:
    """POST /api/pipeline/orchestrator/dispatch {slug, stage}。步进器「▶ 开工」——薄封装
    `orchestrator dispatch`（快路径同步转发退出码 2/3/4；慢路径=真起了会话，前端转去轮询 status）。"""
    slug = str(body.get('slug', '')).strip()
    stage = str(body.get('stage', '')).strip()
    if not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug or "(空)"}'}
    if not _PIPE_STAGE_RE.fullmatch(stage):
        return {'success': False, 'error': f'非法阶段: {stage or "(空)"}'}
    r = _orch_dispatch_kickoff(slug, stage)
    if r.get('quick'):
        return {'success': bool(r.get('ok')), 'quick': True, 'code': r.get('code'), 'reason': r.get('reason'),
                'holder': r.get('holder'), 'exit': r.get('_exit')}
    return {'success': True, 'quick': False, 'slug': slug, 'stage': stage,
            'reason': '已派会话（后台跑）——轮询 GET /api/pipeline/orchestrator/status 看 running/stalled/failed'}

def handle_pipeline_orch_status(slug: str = '') -> dict:
    """GET /api/pipeline/orchestrator/status?slug=<可空>。薄封装 `orchestrator status`——
    锁横幅（库级·不传 slug 时看首个 live 行）与步进器「开工」按钮的轮询共用同一端点。"""
    if slug and not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug}'}
    args = ['status', slug] if slug else ['status']
    r = _orch_cli_sync(args, timeout=15)
    if not r.get('ok', True) and 'rows' not in r:
        return {'success': False, 'error': r.get('error') or '状态查询失败'}
    return {'success': True, 'rows': r.get('rows') or []}

def handle_pipeline_orch_abort(body: dict) -> dict:
    """POST /api/pipeline/orchestrator/abort {slug}。锁横幅「中止」钮——薄封装 `orchestrator abort`
    （人操作·终止该游戏在跑会话·该阶段标 failed+aborted+needsHuman，闭集不外扩·见 P1a 终审⑤）。"""
    slug = str(body.get('slug', '')).strip()
    if not _valid_slug(slug):
        return {'success': False, 'error': f'非法 slug: {slug or "(空)"}'}
    r = _orch_cli_sync(['abort', slug], timeout=15)
    return {'success': bool(r.get('ok')), 'code': r.get('code'), 'reason': r.get('reason'),
            'stage': r.get('stage'), 'killedPid': r.get('killedPid'), 'holder': r.get('holder')}
