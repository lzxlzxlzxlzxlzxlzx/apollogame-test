"""GAL 创作台对话。只转发一轮模型文本，工具在浏览器里执行。"""
from .llm_log import _llm_log
from .llm_transport import _provider_request

SYSTEM = (
    '你是 GAL 创作台的当前步骤助手。你看不到材料正文，只能看到目录。'
    '需要时调用工具读取。文档在工具结果的正文里，图片会跟在同一次工具结果后面。'
    '每一轮只返回一个 JSON 对象，不要加解释。'
    '查看时返回 {"kind":"tool","name":"工具名","args":{}}。'
    '工具名只能是 read_step、read_material、read_character、read_spec、read_rules、submit_candidate。'
    '要说话时返回 {"kind":"reply","text":"..."}。'
    '你不能通过或退回任何步骤，也不能改素材库和角色档案。'
)


def _message_content(item: dict):
    text = str(item.get('content', ''))[:24000]
    images = item.get('images')
    if not isinstance(images, list) or not images:
        return text
    parts = [{'type': 'text', 'text': text}]
    for url in images[:4]:
        if isinstance(url, str) and url.startswith('data:image/') and len(url) <= 2_000_000:
            parts.append({'type': 'image_url', 'image_url': {'url': url}})
    return parts


def handle_gal_authoring(provider: str, api_key: str, model: str, body: dict) -> dict:
    messages = body.get('messages')
    if not isinstance(messages, list) or not messages:
        return {'success': False, 'error': 'gal-authoring 需要 messages[]'}
    msgs = [{'role': item.get('role'), 'content': _message_content(item)}
            for item in messages if isinstance(item, dict) and item.get('role') in ('user', 'assistant')]
    if not msgs:
        return {'success': False, 'error': 'messages 里没有有效对话轮次'}
    result = _provider_request(provider, api_key, model, SYSTEM, msgs, max_tokens=2048, effort='medium')
    _llm_log(provider=provider, model=model, mode='gal-authoring', req=result,
             validation='n/a' if result.get('success') else 'error',
             errors=[] if result.get('success') else [result.get('error')],
             prompt_full=SYSTEM, response_full=result.get('text', ''))
    if not result.get('success'):
        return {'success': False, 'error': result.get('error', 'LLM 请求失败')}
    return {'success': True, 'reply': result.get('text', '')}
