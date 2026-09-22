"""POST /api/generate 处理核（模式分派）。"""
import json

from .config import _config_model
from .design_flow import _handle_design_breakdown, _handle_design_chat, _handle_design_revise, _handle_prototype
from .generation import _generate_with_autofix
from .llm_transport import GAME_GEN_SYSTEM_PROMPT, LLM_PROVIDERS, _FALLBACK_CATALOG, get_api_key
from .lowmodel import _handle_template_edit

def handle_generate(body: dict) -> dict:
    """POST /api/generate 的对外壳：分派给 `_handle_generate`，并给 **mock 产物盖章**。

    ⚠ 盖章不是装饰（owner 2026-08-26 实证事故）：mock provider 对**任何** prompt 都回同一份内置
    manifest（`_mock_manifest()` = platformer 预设：一个可控方块 + 地面 + 三个平台方块）。
    它一旦被选中，作者会看到「每个游戏生成出来都一模一样」，而此前响应里**没有任何字样**说明
    这是测试样例——静默失效正是本仓最难查的那类。现在凡走 mock，响应恒带 `mock: true`，
    调用方（工作台）据此明示，别让人以为是真生成。
    """
    res = _handle_generate(body)
    if isinstance(res, dict) and body.get('provider') == 'mock':
        res['mock'] = True
    return res


def _handle_generate(body: dict) -> dict:
    """POST /api/generate 的处理核。mode='create'（默认）从 prompt 生成；mode='revise' 从
    current_manifest + instruction 生成完整修订版；设计先行流四模式 design-chat/design-breakdown/
    design-revise/prototype 见各 _handle_* 。autofix=True 开服务端校验重试回路。"""
    provider = body.get('provider', 'anthropic')
    catalog = body.get('catalog', None)
    mode = body.get('mode', 'create')
    autofix = bool(body.get('autofix', False))
    system = GAME_GEN_SYSTEM_PROMPT.replace('{CAPABILITY_CATALOG}', catalog or _FALLBACK_CATALOG)

    if provider != 'mock' and provider not in LLM_PROVIDERS:
        return {'success': False, 'error': f'Unknown provider: {provider}', 'blueprint': None}

    api_key = get_api_key(provider)
    if not api_key:
        env_key = LLM_PROVIDERS.get(provider, {}).get('env_key', '?')
        hint = 'mock provider 未启用（需 ZEROCRAFT_MOCK_LLM=1）' if provider == 'mock' else f'Set {env_key} in .env file.'
        return {'success': False, 'error': f'No API key for {provider}. {hint}', 'blueprint': None}

    models = LLM_PROVIDERS.get(provider, {}).get('models') or ['mock']
    model = body.get('model') or _config_model(provider) or models[0]

    # 设计先行流四模式分派（各自的校验器 / 系统词；prototype 复用 manifest 系统词 + autofix）。
    if mode == 'design-chat':
        return _handle_design_chat(provider, api_key, model, body)
    if mode == 'design-breakdown':
        return _handle_design_breakdown(provider, api_key, model, body, catalog)
    if mode == 'design-revise':
        return _handle_design_revise(provider, api_key, model, body)
    if mode == 'prototype':
        return _handle_prototype(provider, api_key, model, body, system)
    # 低模默认路径（REQ-STUDIO 低模 ①）：从最近的能跑模板做增量修改（题材子集词表 + 校验回路）。
    if mode == 'template-edit':
        return _handle_template_edit(provider, api_key, model, body, catalog)

    if mode == 'revise':
        current = body.get('current_manifest')
        instruction = str(body.get('instruction') or '').strip()
        if not isinstance(current, dict):
            return {'success': False, 'error': 'revise 需要 current_manifest（对象）', 'blueprint': None}
        if not instruction:
            return {'success': False, 'error': 'revise 需要 instruction（非空修改指令）', 'blueprint': None}
        user_msg = (
            '## Current game manifest\n'
            + json.dumps(current, ensure_ascii=False, indent=2)
            + '\n\n## User instruction\n' + instruction
            + '\n\nOutput the COMPLETE revised manifest as pure JSON.'
        )
    else:
        prompt = str(body.get('prompt') or '').strip()
        if not prompt:
            return {'success': False, 'error': 'No prompt provided', 'blueprint': None}
        user_msg = prompt

    return _generate_with_autofix(provider, api_key, model, system, user_msg, autofix,
                                  log_mode='revise' if mode == 'revise' else 'generate')
