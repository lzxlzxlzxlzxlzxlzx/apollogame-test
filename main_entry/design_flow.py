"""设计先行创作流四模式处理核（讨论/分解/对齐/原型）。"""
import json
import re

from .design_prompts import DESIGN_BREAKDOWN_SYSTEM, DESIGN_CHAT_SYSTEM, DESIGN_REVISE_SYSTEM, PROTOTYPE_TASK
from .generation import _generate_with_autofix
from .library import _read_design, _touch_meta, _version_save_all, _write_design_file
from .llm_log import _llm_log
from .llm_transport import _FALLBACK_CATALOG, _provider_request
from .mock import _extract_json
from .paths import _game_dir, _valid_design_relpath, _valid_slug

def _handle_design_chat(provider: str, api_key: str, model: str, body: dict) -> dict:
    """多轮构想讨论（无状态·前端带全 messages）。回复末尾若含 [READY_TO_BREAKDOWN] → ready=True（并从展示文本剥掉标记）。"""
    messages = body.get('messages')
    if not isinstance(messages, list) or not messages:
        return {'success': False, 'error': 'design-chat 需要 messages[]（非空）'}
    msgs = [{'role': m.get('role'), 'content': str(m.get('content', ''))}
            for m in messages if isinstance(m, dict) and m.get('role') in ('user', 'assistant')]
    if not msgs:
        return {'success': False, 'error': 'messages 里没有有效对话轮次'}
    # effort=medium：构想讨论是对话不是产工件——回话快优先（owner 07-11「回馈快速返还」）；提纲/原型仍 high。
    r = _provider_request(provider, api_key, model, DESIGN_CHAT_SYSTEM, msgs, effort='medium')
    _llm_log(provider=provider, model=model, mode='chat', req=r,
             validation='n/a' if r.get('success') else 'error',
             errors=[] if r.get('success') else [r.get('error')],
             prompt_full=DESIGN_CHAT_SYSTEM, response_full=r.get('text', ''))
    if not r.get('success'):
        return {'success': False, 'error': r.get('error', 'LLM 请求失败')}
    text = r['text']
    ready = '[READY_TO_BREAKDOWN]' in text
    reply = text.replace('[READY_TO_BREAKDOWN]', '').strip()
    return {'success': True, 'reply': reply, 'ready': ready}


def _parse_design_files(text: str):
    """校验 breakdown 输出：严格 JSON {files:{path:content}} + 文件名白名单（.md·systems/ 子目录）。
    返回 (True, {rel:content}) 或 (False, 错误文本·供回喂重问)。"""
    try:
        obj = json.loads(_extract_json(text))
    except Exception as e:
        return False, f'输出不是合法 JSON：{e}'
    files = obj.get('files') if isinstance(obj, dict) else None
    if not isinstance(files, dict) or not files:
        return False, '缺少 files 对象（应为 {"files": {"pitch.md": "...", ...}}）'
    clean = {}
    for rel, content in files.items():
        if not _valid_design_relpath(rel):
            return False, f'非法文件名（仅 .md，且只能是顶层或 systems/ 子目录）：{rel!r}'
        if not isinstance(content, str) or not content.strip():
            return False, f'文件内容必须是非空字符串：{rel}'
        clean[rel] = content
    if 'pitch.md' not in clean or 'capability-plan.md' not in clean:
        return False, '至少要包含 pitch.md 与 capability-plan.md'
    return True, clean


def _handle_design_breakdown(provider: str, api_key: str, model: str, body: dict, catalog: str) -> dict:
    """讨论纪要/策划案 → design 目录（一次落盘 + 单个 commit 'design breakdown'）。
    校验（JSON 形状 + 文件名白名单）失败走 autofix 式回喂重问 ≤3 次。前端传 slug（游戏须已建）。"""
    slug = str(body.get('slug') or '').strip()
    if not _valid_slug(slug):
        return {'success': False, 'error': 'design-breakdown 需要合法 slug（先建游戏）'}
    game_dir = _game_dir(slug)
    if not game_dir.is_dir():
        return {'success': False, 'error': f'游戏不存在: {slug}'}
    messages = body.get('messages')
    if not isinstance(messages, list) or not messages:
        return {'success': False, 'error': 'design-breakdown 需要 messages[]（讨论纪要）'}
    transcript = '\n'.join(f'{m.get("role")}: {str(m.get("content", ""))}'
                           for m in messages if isinstance(m, dict) and m.get('role') in ('user', 'assistant'))
    system = DESIGN_BREAKDOWN_SYSTEM.replace('{CAPABILITY_CATALOG}', catalog or _FALLBACK_CATALOG)
    user_msg = '## Design discussion transcript\n' + transcript + '\n\nBreak this down into the GDD files now (STRICT JSON only).'
    msgs = [{'role': 'user', 'content': user_msg}]
    attempts, errors = 0, []
    while attempts < 3:
        attempts += 1
        mode_label = 'breakdown' if attempts == 1 else f'autofix-{attempts}'
        r = _provider_request(provider, api_key, model, system, msgs)
        if not r.get('success'):
            _llm_log(provider=provider, model=model, mode=mode_label, req=r,
                     validation='error', errors=[r.get('error')], prompt_full=system)
            return {'success': False, 'error': r.get('error', 'LLM 请求失败'), 'attempts': attempts, 'fixed_errors': errors}
        text = r['text']
        ok, res = _parse_design_files(text)
        _llm_log(provider=provider, model=model, mode=mode_label, req=r,
                 validation='pass' if ok else 'fail', errors=[] if ok else [res],
                 prompt_full=system, response_full=text)
        if ok:
            for rel, content in res.items():
                _write_design_file(game_dir, rel, content)
            _touch_meta(game_dir)
            versioned = _version_save_all(game_dir, 'design breakdown')
            return {'success': True, 'slug': slug, 'files': res, 'attempts': attempts,
                    'fixed_errors': errors, 'versioned': versioned}
        errors.append(res)
        msgs += [{'role': 'assistant', 'content': text},
                 {'role': 'user', 'content': f'你上次的输出有问题：{res}\n只输出严格 JSON：{{"files": {{"pitch.md": "...", "systems/xxx.md": "...", "content.md": "...", "capability-plan.md": "..."}}}}，不要 markdown 围栏、不要解释。'}]
    return {'success': False, 'error': f'分解 {attempts} 次后仍未通过校验，换个说法再试试。',
            'attempts': attempts, 'fixed_errors': errors, 'raw_error': errors[-1] if errors else None}


def _handle_design_revise(provider: str, api_key: str, model: str, body: dict) -> dict:
    """单篇 design 文档修订：{file_path, current_content, instruction} → 修订全文（不落盘，前端拿到再 PUT）。"""
    file_path = str(body.get('file_path') or '').strip()
    current = body.get('current_content')
    instruction = str(body.get('instruction') or '').strip()
    if not _valid_design_relpath(file_path):
        return {'success': False, 'error': f'非法 design 文件名: {file_path!r}'}
    if not isinstance(current, str):
        return {'success': False, 'error': 'design-revise 需要 current_content（字符串）'}
    if not instruction:
        return {'success': False, 'error': 'design-revise 需要 instruction（非空）'}
    user_msg = (f'## Current document ({file_path})\n{current}\n\n'
                f'## Revision instruction\n{instruction}\n\n'
                'Output the COMPLETE revised document as markdown (no code fences, no explanation).')
    r = _provider_request(provider, api_key, model, DESIGN_REVISE_SYSTEM, [{'role': 'user', 'content': user_msg}], effort='medium')  # 单篇修订=快回优先
    _llm_log(provider=provider, model=model, mode='design-revise', req=r,
             validation='n/a' if r.get('success') else 'error',
             errors=[] if r.get('success') else [r.get('error')],
             prompt_full=DESIGN_REVISE_SYSTEM, response_full=r.get('text', ''))
    if not r.get('success'):
        return {'success': False, 'error': r.get('error', 'LLM 请求失败')}
    return {'success': True, 'file_path': file_path, 'content': _strip_fence(r['text'])}


_CAP_ID_RE = re.compile(r'\b((?:a\d|b\d|c\d|d\d|e\d|f\d|g\d|k\d|l\d|m\d|t1|t2|t3)-[a-z0-9][a-z0-9-]*)\b')


def _known_capability_ids() -> set:
    """引擎真实存在的 capability id 集合（走与 /api/catalog 同一条服务端 parity·失败回空集=不误判）。"""
    from .games_list import handle_catalog
    r = handle_catalog()
    if not r.get('success') or not r.get('catalog'):
        return set()
    return set(_CAP_ID_RE.findall(r['catalog']))


def check_plan(files: dict) -> dict:
    """**原型生成前的计划体检**（独立审查 2026-09-12 打回的 P0：原型绕过缺口裁决）。

    审查方原话：`manifest-check` 只能证明卡带**能加载**，不能证明游戏**忠实实现了设计**。
    这里补上三条能机器判的（判**不**了"忠实"，就别假装判了——那需要验收剧本，见 S5）：
      ① 计划里点名的 capability id 是否真实存在（编造 id = 计划从一开始就落不了地）
      ② 计划里有没有仍打着「⏳ / 待裁 / 未裁决」的缺口（缺口裁决协议没走完就生成 = 白生成）
      ③ 有没有 capability-plan.md（没有 = 根本没做能力总览）
    **本函数只报不拦**：是否把它变成硬闸属于流程策略，由 owner 判（见返回里的 `strictable`）。
    """
    plan = files.get('capability-plan.md') or ''
    out = {'hasPlan': bool(plan.strip()), 'unknownIds': [], 'pendingGaps': [], 'strictable': True}
    if not plan.strip():
        return out
    known = _known_capability_ids()
    if known:
        cited = [i for i in dict.fromkeys(_CAP_ID_RE.findall(plan))]
        out['unknownIds'] = [i for i in cited if i not in known]
    for ln in plan.splitlines():
        if ('⏳' in ln or '待裁' in ln or '未裁决' in ln) and ln.strip():
            out['pendingGaps'].append(ln.strip()[:120])
    return out


def _handle_prototype(provider: str, api_key: str, model: str, body: dict, system: str) -> dict:
    """design 全文（服务端从磁盘读该 slug 的 design/）→ manifest，走既有 _generate_with_autofix 硬校验回路。

    ⚠ 生成前先跑 `check_plan` 体检，结果**原样带回**（`planCheck`）。不拦是有意的：
    创作台里大量项目根本没走流水线，硬拦会把它们全堵死；但**不许静默**——
    编造的能力 id、没裁的缺口必须在界面上看得见（日志基准守则：凡"什么都没发生"的分支必须记）。
    """
    slug = str(body.get('slug') or '').strip()
    if not _valid_slug(slug):
        return {'success': False, 'error': 'prototype 需要合法 slug'}
    game_dir = _game_dir(slug)
    if not game_dir.is_dir():
        return {'success': False, 'error': f'游戏不存在: {slug}'}
    files = _read_design(game_dir)
    if not files:
        return {'success': False, 'error': '该游戏还没有 design 文档，先分解设计稿再生成原型'}
    plan_check = check_plan(files)
    gdd = '\n\n'.join(f'### {rel}\n{content}' for rel, content in files.items())
    user_msg = PROTOTYPE_TASK + '\n\n## Game Design Document\n' + gdd
    res = _generate_with_autofix(provider, api_key, model, system, user_msg, autofix=True, log_mode='prototype')
    if isinstance(res, dict):
        res['planCheck'] = plan_check
        notes = []
        if not plan_check['hasPlan']:
            notes.append('设计里没有 capability-plan.md —— 没做能力总览就生成，等于跳过 S2')
        if plan_check['unknownIds']:
            notes.append('计划点名了引擎里**不存在**的能力：' + '、'.join(plan_check['unknownIds'][:6]))
        if plan_check['pendingGaps']:
            notes.append(f'计划里还有 {len(plan_check["pendingGaps"])} 条缺口未裁决（⏳/待裁）——先走缺口裁决协议')
        if notes:
            res['warnings'] = list(res.get('warnings') or []) + [f'计划体检：{n}' for n in notes]
    return res


def _strip_fence(text: str) -> str:
    """剥掉整体被 ``` 围栏包住的 markdown（design-revise 防御：LLM 有时手滑加围栏）。"""
    t = (text or '').strip()
    if t.startswith('```'):
        t = t.split('\n', 1)[1] if '\n' in t else ''
        if t.rstrip().endswith('```'):
            t = t.rstrip()[:-3]
    return t.strip()
