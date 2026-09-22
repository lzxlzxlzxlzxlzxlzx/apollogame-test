"""生成管线：单轮生成 + 服务端 autofix 重试 + 校验错误 LLM 化。"""
import json
import re

from .blueprints import _validate_blueprint
from .llm_log import _llm_log, _trunc
from .llm_transport import _provider_request
from .mock import _extract_json
from .paths import _run_manifest_check
from .sysutil import c

# ── 生成管线：单轮生成 + 服务端 autofix 重试（落地 ai-dev-pipeline §7-5）─────
def _usage_tokens(usage) -> int:
    """provider usage dict → 总 token（input+output）。claude 用 input_tokens/output_tokens，
    ollama 用 prompt_eval_count/eval_count；都没有则 0。虚拟金币经济按它扣费（10000 tok=100 币）。"""
    if not isinstance(usage, dict):
        return 0
    return (int(usage.get('input_tokens') or usage.get('prompt_eval_count') or 0)
            + int(usage.get('output_tokens') or usage.get('eval_count') or 0))

def _generate_with_autofix(provider: str, api_key: str, model: str, system: str,
                           user_msg: str, autofix: bool, max_attempts: int = 3,
                           *, log_mode: str = 'generate', rebuild_system=None) -> dict:
    """messages 起于一条 user_msg。每轮：调 LLM → JSON parse →（autofix 时）manifest-check 校验。
    失败时**把错误改写成一句可执行修改指令**回喂重问，≤max_attempts。传输/网络错误直接返回（不重试网络层）。

    token/缓存卫生（REQ-STUDIO 低模 ④）：回喂只带「base_user + 上一轮 assistant + 本轮错误指令」，
    **裁掉更早轮次的失败输出**（防对话超线性膨胀）；system 逐轮字节稳定（除非 rebuild_system 主动扩词表）。
    词汇按需扩（低模 ②）：错误点名"未知能力"且它其实是被裁掉的真实能力 → rebuild_system 补它整族。
    每轮落一行 LLM 交互日志（心跳单第 0 项）。autofix=False：只跑一轮 + 软告警，保持旧 GameCreator 行为。"""
    base_user = {'role': 'user', 'content': user_msg}
    attempts = 0
    fixed_errors: list[str] = []       # 原始校验错误（回前端「查看原始校验错误」区块）
    fix_instructions: list[str] = []   # LLM 化的可执行修改指令（回喂 LLM）
    cur_system = system
    last_assistant = None
    last_instruction = None
    total_tokens = 0                   # 累计本次生成全轮 token（虚拟金币经济按它扣费）
    limit = max_attempts if autofix else 1
    while attempts < limit:
        attempts += 1
        # 轮次裁剪：首轮只 base_user；重试轮 = base_user + 上一轮输出 + 本轮错误指令（不累积历史失败）。
        if last_assistant is None:
            messages = [base_user]
        else:
            messages = [base_user,
                        {'role': 'assistant', 'content': last_assistant},
                        {'role': 'user', 'content': last_instruction}]
        mode_label = log_mode if attempts == 1 else f'autofix-{attempts}'
        r = _provider_request(provider, api_key, model, cur_system, messages)
        total_tokens += _usage_tokens(r.get('usage'))
        if not r.get('success'):
            _llm_log(provider=provider, model=model, mode=mode_label, req=r,
                     validation='error', errors=[r.get('error')], prompt_full=cur_system)
            return {'success': False, 'error': r.get('error', 'LLM 请求失败'),
                    'blueprint': None, 'attempts': attempts, 'fixed_errors': fixed_errors,
                    'fix_instructions': fix_instructions, 'tokens': total_tokens}
        text = r['text']
        try:
            manifest = json.loads(_extract_json(text))
        except Exception as e:
            raw = f'输出不是合法 JSON：{e}'
            instr = ('你上次的输出不是合法 JSON。只输出完整 manifest 的纯 JSON 对象'
                     '（从 { 开始到 } 结束），不要 markdown 围栏、不要任何解释文字。')
            _llm_log(provider=provider, model=model, mode=mode_label, req=r,
                     validation='fail', errors=[raw], prompt_full=cur_system, response_full=text)
            if not autofix:
                return {'success': False, 'error': f'Invalid JSON from LLM: {e}',
                        'blueprint': None, 'attempts': attempts, 'fixed_errors': fixed_errors,
                        'fix_instructions': fix_instructions, 'tokens': total_tokens}
            fixed_errors.append(raw)
            fix_instructions.append(instr)
            last_assistant, last_instruction = text, instr
            continue
        if not autofix:
            _llm_log(provider=provider, model=model, mode=mode_label, req=r,
                     validation='skip', errors=[], prompt_full=cur_system, response_full=text)
            warnings = _validate_blueprint(manifest)
            return {'success': True, 'error': None, 'blueprint': manifest, 'manifest': manifest,
                    'warnings': warnings, 'attempts': attempts, 'fixed_errors': fixed_errors,
                    'fix_instructions': fix_instructions, 'tokens': total_tokens}
        ok, msg = _run_manifest_check(manifest)
        _llm_log(provider=provider, model=model, mode=mode_label, req=r,
                 validation='pass' if ok else 'fail', errors=[] if ok else [msg],
                 prompt_full=cur_system, response_full=text)
        if ok:
            # ⚠ `msg` 在 ok 分支**也可能有内容**（`_run_manifest_check` 成功时回的是 stderr = 引擎告警：
            # 软环 / 降级 / 兼容性）。首版只取 `_validate_blueprint` 就把它整段丢了，于是作者只看到
            # 「创建成功」——独立审查 2026-09-12 打回。告警不是错误，但**不许静默**：合进同一条 warnings。
            warnings = list(_validate_blueprint(manifest))
            if msg and msg.strip():
                warnings.extend(f'引擎校验告警：{ln}' for ln in msg.strip().splitlines() if ln.strip())
            return {'success': True, 'error': None, 'blueprint': manifest, 'manifest': manifest,
                    'warnings': warnings, 'attempts': attempts, 'fixed_errors': fixed_errors,
                    'fix_instructions': fix_instructions, 'tokens': total_tokens}
        instr, unknown_ids = _llm_ify_error(msg, manifest)
        fixed_errors.append(msg)
        fix_instructions.append(instr)
        if rebuild_system and unknown_ids:  # 错误点名未知能力 → 尝试补该族全量（下轮 system 换新）
            new_sys = rebuild_system(unknown_ids)
            if new_sys:
                cur_system = new_sys
        last_assistant, last_instruction = text, instr
    return {'success': False, 'error': f'自动修正 {attempts} 次后仍未通过校验，换个说法再试试。',
            'blueprint': None, 'attempts': attempts, 'fixed_errors': fixed_errors,
            'fix_instructions': fix_instructions, 'tokens': total_tokens,
            'raw_error': fixed_errors[-1] if fixed_errors else None}

# ── 低模生成四件（REQ-STUDIO·让弱模型不在 81 项词表里从零作曲）─────────────────
# ③ 校验错误 LLM 化：把 manifest-check 的机读错误改写成「一句可执行修改指令」（指名 entity/字段 +
#   合法值示例）。侵入最小方案=纯 zerocraft.py 侧字符串映射层，不改引擎校验器（manifest-check.mjs）。
_RE_UNKNOWN_CAP = re.compile(r'未知 capability id[:：]\s*(.+?)（')
# formatIssues 形状：「<entity>.<Comp>.<field> —— <Comp>.<field> 应为 number，实为 string」，
# 把 entity.Comp.field 与其后的 应为<type> 绑起来抽取（entity id 允许连字符）。
_RE_COMP_TYPE = re.compile(
    r'([A-Za-z0-9_-]+)\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*——\s*[A-Za-z0-9_]+\.[A-Za-z0-9_]+\s*应为\s*(number|boolean)')

def _llm_ify_error(msg: str, manifest: dict):
    """manifest-check 机读错误 → (可执行修改指令, 名到的未知能力 id 集)。unknown 供词汇族按需扩用。"""
    msg = msg or ''
    lines: list[str] = []
    unknown: set[str] = set()
    m = _RE_UNKNOWN_CAP.search(msg)
    if m:
        caps = [c.strip() for c in re.split(r'[,，、]\s*', m.group(1)) if c.strip()]
        unknown.update(caps)
        cap_list = '、'.join(f'`{c}`' for c in caps)
        lines.append(f'capabilities 数组里出现了目录中没有的能力 id：{cap_list}。把它们删掉，'
                     f'或替换成"能力目录"里真实列出的 id（未知 id 会被引擎拒绝加载）。')
    for ent, comp, field, typ in _RE_COMP_TYPE.findall(msg)[:8]:
        example = '0 这样的纯数字（不要加引号）' if typ == 'number' else 'true 或 false（布尔·不要加引号）'
        lines.append(f'实体 `{ent}` 的组件 `{comp}` 的字段 `{field}` 必须是 {typ}——把它的值改成 {example}。')
    if not lines:  # 结构/其它错误：原样给 + 通用可执行包装
        lines.append(f'上一版 manifest 没通过引擎校验：{_trunc(msg, 300)}。请据此修正。')
    instruction = ('该 manifest 未通过引擎校验，请按下面逐条修改（只改需要改的，其余保持原样），'
                   '然后只输出完整的修正后 manifest 纯 JSON：\n- ' + '\n- '.join(lines))
    return instruction, unknown
