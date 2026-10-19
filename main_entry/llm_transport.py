"""游戏生成 providers + 统一 LLM 传输层 + get_api_key/get_available_providers。"""
import os
import time
import json
import shutil
import urllib.request
import urllib.parse

from .claude_code import _claude_code_request
from .config import _config_api_key
from .mock import _mock_enabled, _mock_response
from .sysutil import ROOT, c

# ── 游戏生成（Claude API / 其他 LLM）──

GAME_GEN_SYSTEM_PROMPT = """You are ZeroCraft Preview's game generator. You create playable 2D games by outputting Assembly blueprints (JSON).

## Output format — a canonical Manifest (JSON ONLY, no markdown, no explanation)

{
  "name": "game name",
  "description": "one line",
  "capabilities": ["a1-transform","b1-velocity", "..."],
  "entities": {
    "entity-id": {
      "Transform": { "x":100,"y":300,"rotation":0,"scaleX":1,"scaleY":1 },
      "Velocity":  { "vx":0,"vy":0,"angular":0 }
    }
  }
}

KEY: `entities` is an OBJECT keyed by entity id; each entity is an OBJECT keyed by component
type (NO "type" field inside the component). `capabilities` lists the engine capability ids to enable.

## Capability catalog — the authoritative vocabulary (ids, component fields, examples)
Enable ONLY ids from this catalog, and use ONLY the components/fields it lists. Each line gives a
capability id, the components it provides (with field signatures), when to use it, and example data
shapes. This catalog is the single source of truth for the vocabulary — do not invent components or
fields, and unknown capability ids are rejected on load.
{CAPABILITY_CATALOG}

## Art assets (give every visual entity a skin slot — REQUIRED for the reskin pipeline)
- Every entity that represents something a player looks at (characters, enemies, items, terrain tiles, projectiles, backgrounds) SHOULD carry a Sprite whose textureKey is an "art:<english keywords>" reference — e.g. "art:skeleton warrior", "art:forest floor tile". That art: reference IS the replaceable skin slot the art pipeline later swaps for generated art. A game made of only shape+color blocks (no art: slots) cannot be reskinned — avoid that.
- Write art: queries as DETAILED image briefs, not bare nouns: subject + distinguishing features + color/mood + view angle, 4-10 words. Good: "art:armored skeleton knight, glowing red eyes, top-down". Bad: "art:enemy". The art pipeline feeds these words straight to a text-to-image model — the richer the query, the better every generated skin.
- The engine deterministically resolves "art:" against a CC0 32x32 sprite library (4800+ tagged assets); the same query always picks the same sprite. Unresolvable queries fall back to a placeholder, never crash.
- Useful keywords — monsters: undead/skeleton/zombie/demon/dragon/animal/wolf/spider/boss/flying/fire/ice/poison; terrain: floor/wall/grass/lava/water/door/altar/trap; items: sword/axe/bow/armor/shield/potion/book/gold; fx: arrow/bolt/cloud.
- Entities with a Sprite still need a Transform (and a Shape if they collide). Use shape+color only for pure abstractions (HUD bars, hitboxes) that genuinely have no art.

## Rules
- Canvas is 640x400, origin top-left. Include one camera entity centered on the canvas (offsetX 320, offsetY 200) so world coordinates map 1:1 to the screen and entities are visible.
- Keep every entity within 0..640 (x) and 0..400 (y) so it stays on-screen.
- For gravity, apply a small constant downward acceleration per tick (about 0.3-0.8); static bodies such as ground and walls should have zero mass.
- Tint colors are packed as a 0xRRGGBB integer (e.g. red 0xFF0000 == 16711680).

## Minimal Example (bouncing ball + ground)
{"name":"bounce","description":"a ball bounces on the ground","capabilities":["a1-transform","b1-velocity","b2-acceleration","c1-shape","l2-color","d1-overlap-detect","t1-accel-apply","t1-motion-apply","t2-collision-resolve","t2-bounds-clamp"],"entities":{"camera":{"Camera":{"zoom":1,"offsetX":320,"offsetY":200,"rotation":0,"viewportW":640,"viewportH":400}},"ball":{"Transform":{"x":320,"y":60,"rotation":0,"scaleX":1,"scaleY":1},"Velocity":{"vx":2,"vy":0,"angular":0},"Acceleration":{"ax":0,"ay":0.5},"Shape":{"kind":"circle","radius":12},"Color":{"tint":4886754,"alpha":1},"Mass":{"value":1},"Bounds":{"minX":0,"minY":0,"maxX":640,"maxY":400}},"ground":{"Transform":{"x":320,"y":380,"rotation":0,"scaleX":1,"scaleY":1},"Shape":{"kind":"box","width":640,"height":40},"Color":{"tint":3553598,"alpha":1},"Mass":{"value":0}}}}
"""

# 回退能力目录 = **部分应急词汇表**，仅在前端未送 catalog 时兜底；正常路径由 TS 的
# buildCapabilityCatalog 自动派生送来（含全部能力 + 组件字段 + 示例，故 hitbox/prefab/dialogue 等都在）。
# 这 12 条 id 已对照 capability registry 核实存在；不求完整，只保证兜底时也能产出可跑的最小物理游戏。
_FALLBACK_CATALOG = (
    "(Partial fallback vocabulary — the full capability catalog is normally injected by the frontend; "
    "this short list is only a safety net when no catalog was provided.)\n"
    "a1-transform(Transform) · b1-velocity(Velocity) · b2-acceleration(Acceleration) · c1-shape(Shape) · "
    "l2-color(Color) · d1-overlap-detect · t1-accel-apply · t1-motion-apply · t2-collision-resolve · "
    "t2-bounds-clamp(Bounds) · t2-jump · t2-ground-sense"
)

LLM_PROVIDERS = {
    # 订阅通道（owner 2026-07-10 拍板「不买 API·不花新钱」·spec=workshop-spec-2026-07-10.md §2.1，归档层已删·查 git 历史）：
    # 走本机 Claude Code CLI headless（`claude -p`），凭订阅（已登录）或 setup-token（CLAUDE_CODE_OAUTH_TOKEN）。
    # 档位=CLI 模型别名（opus=默认主力·fable=展示档更强·sonnet=量产档），不硬编日期型号。
    'claude-code': {
        'name': 'Claude Code（订阅·零 API 费）',
        'env_key': 'CLAUDE_CODE_OAUTH_TOKEN',
        'models': ['opus', 'fable', 'sonnet'],
    },
    'anthropic': {
        'name': 'Claude (Anthropic API·BYO key)',
        # 弃用型号修复（claude-sonnet-4-20250514 已 2026-06-15 退役）→ 当前代次
        'env_key': 'ANTHROPIC_API_KEY',
        'models': ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
    },
    'qwen': {
        'name': 'Qwen (Alibaba DashScope)',
        'env_key': 'DASHSCOPE_API_KEY',
        'models': ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    },
    'openai': {
        'name': 'OpenAI / Compatible',
        'env_key': 'OPENAI_API_KEY',
        'models': ['gpt-4o', 'gpt-4o-mini'],
    },
    'deepseek': {
        'name': 'DeepSeek',
        'env_key': 'DEEPSEEK_API_KEY',
        'models': ['deepseek-v4-pro', 'deepseek-chat'],
    },
    'local': {
        'name': 'Local (Ollama)',
        'env_key': '',
        'models': ['llama3', 'qwen2', 'mistral'],
    },
}

def get_api_key(provider: str) -> str | None:
    if provider == 'mock':
        return 'mock' if _mock_enabled() else None
    # 优先级：config(.apollo-config.json) > env > .env。
    cfg_key = _config_api_key(provider)
    if cfg_key:
        return cfg_key
    info = LLM_PROVIDERS.get(provider, {})
    env_key = info.get('env_key', '')
    if not env_key:
        return 'local'
    key = os.environ.get(env_key, '')
    if not key:
        env_file = ROOT / '.env'
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith(f'{env_key}='):
                    key = line.split('=', 1)[1].strip().strip('"').strip("'")
    if not key and provider == 'claude-code' and shutil.which('claude'):
        return 'cli'  # 本机 CLI 已登录即可用（订阅凭据在 CLI 侧·无需 token）——sentinel 不是密钥不入日志
    return key or None

def get_available_providers() -> list[dict]:
    result = []
    for pid, info in LLM_PROVIDERS.items():
        has_key = get_api_key(pid) is not None
        result.append({
            'id': pid,
            'name': info['name'],
            'models': info['models'],
            'available': has_key,
        })
    if _mock_enabled():
        result.append({'id': 'mock', 'name': 'Mock (test)', 'models': ['mock'], 'available': True})
    return result

# ── 统一 LLM 传输层（system + messages[{role,content}] → 原始文本）──────────
# generate（单轮）与 autofix（多轮回喂错误）共用一条传输。mock provider 在此短路。
# 各 provider 的 chat 格式差异只在这里消化：anthropic 走独立 system 字段，其余（OpenAI 兼容 /
# Ollama）把 system 折成首条 system message。返回 {success, text} 或 {success:False, error}。
_OPENAI_COMPAT_URLS = {
    'qwen': 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    'deepseek': 'https://api.deepseek.com/chat/completions',
}

def _provider_request(provider: str, api_key: str, model: str, system, messages: list,
                      max_tokens: int = 4096, effort: str = 'high', session: dict = None) -> dict:
    # system: str 或 list[str] 缓存分段（token 优化 P0·2026-07-15）：[0]=跨对话稳定大块（能力目录·全角色共享），
    # [1]=角色规则+开局冻结上下文。anthropic 逐段独立 cache_control 断点（不同游戏/角色共享目录段缓存）
    # + 末条消息第三断点（对话历史增量缓存·多轮只付新增 token）；其余供应商顺序拼接单 system
    # （DeepSeek 自动前缀缓存靠「稳定在前·历史只增不改」命中）。传 str = 原语义不变（生成管线照旧）。
    segments = [s for s in (system if isinstance(system, list) else [system]) if s]
    system_str = '\n\n'.join(segments)
    # 度量（供 _llm_log）：promptChars = system + 全 messages 内容字节；elapsedMs = 本轮墙钟；
    # usage = provider 回的 token 数（若有）。这些是 additive，不改任何调用方语义。
    prompt_chars = len(system_str) + sum(len(str(m.get('content', ''))) for m in messages)
    t0 = time.time()
    # 控制台打点（owner 07-11「详细 debug 日志对齐」）：传输层唯一咽喉——所有 LLM 往返（生成/对话/autofix）
    # 都过这里，进出各一行即可对齐「卡在哪」。逐笔 JSONL 明细照旧在 .apollo/llm-logs/。
    if provider != 'mock':
        print(c('  [LLM]', 'b'), f'→ {provider}/{model} · prompt {prompt_chars:,} 字 · {len(messages)} msg', flush=True)

    def _meta(d: dict) -> dict:
        d.setdefault('promptChars', prompt_chars)
        d.setdefault('responseChars', len(d.get('text', '') or ''))
        d.setdefault('elapsedMs', int((time.time() - t0) * 1000))
        if provider != 'mock':
            tag = ('  [LLM]', 'g') if d.get('success') else ('  [LLM]', 'r')
            what = f"回 {d['responseChars']:,} 字" if d.get('success') else f"✗ {str(d.get('error', ''))[:120]}"
            print(c(*tag), f'← {provider}/{model} · {d["elapsedMs"] / 1000:.1f}s · {what}', flush=True)
        return d

    if provider == 'mock':
        return _meta(_mock_response(system_str, messages))
    if provider == 'claude-code':
        return _meta(_claude_code_request(api_key, model, system_str, messages, effort, session))
    try:
        if provider == 'anthropic':
            url = 'https://api.anthropic.com/v1/messages'
            headers = {'Content-Type': 'application/json', 'x-api-key': api_key, 'anthropic-version': '2023-06-01'}
            # 当前代次合规（4.7+·spec §2.2）：adaptive thinking；不发采样参数（发即 400）；max_tokens 抬底
            # （thinking 计入输出预算·太小会把 manifest 掐半截）。
            # 缓存断点（token 优化 P0·≤4 上限）：system 逐段（≤3 段·各自独立前缀断点——目录段跨游戏复用）
            # + 末条消息尾块（对话历史增量缓存：多轮编辑只付新增 token·不再整史全价重读）。
            sys_blocks = [{'type': 'text', 'text': s, **({'cache_control': {'type': 'ephemeral'}} if i < 3 else {})}
                          for i, s in enumerate(segments)]
            msgs = [dict(m) for m in messages]
            if msgs and isinstance(msgs[-1].get('content'), str):
                msgs[-1]['content'] = [{'type': 'text', 'text': msgs[-1]['content'], 'cache_control': {'type': 'ephemeral'}}]
            body = json.dumps({
                'model': model, 'max_tokens': max(max_tokens, 16000),
                'thinking': {'type': 'adaptive'},
                'system': sys_blocks,
                'messages': msgs,
            }).encode()
            fmt, timeout = 'anthropic', 300
        elif provider == 'local':
            url = os.environ.get('OLLAMA_URL', 'http://localhost:11434') + '/api/chat'
            headers = {'Content-Type': 'application/json'}
            body = json.dumps({'model': model, 'stream': False,
                               'messages': [{'role': 'system', 'content': system_str}, *messages]}).encode()
            fmt, timeout = 'ollama', 120
        else:  # OpenAI 兼容：qwen / deepseek / openai(+兼容端)
            url = _OPENAI_COMPAT_URLS.get(provider) or (
                os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1') + '/chat/completions')
            headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'}
            body = json.dumps({'model': model, 'max_tokens': max_tokens,
                               'messages': [{'role': 'system', 'content': system_str}, *messages]}).encode()
            fmt, timeout = 'openai', 60
        req = urllib.request.Request(url, data=body, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
        usage = None
        if fmt == 'anthropic':
            # 4.7+ 响应可含 thinking 块——遍历 blocks 取 text，绝不假设 content[0] 是文本；
            # refusal 明报错不静默（安全分类器拒答=HTTP 200·stop_reason='refusal'）。
            if data.get('stop_reason') == 'refusal':
                return _meta({'success': False, 'error': 'Claude 安全分类器拒答（refusal）——换个说法或换模型档再试'})
            text = ''.join(b.get('text', '') for b in data.get('content', []) if b.get('type') == 'text')
            usage = data.get('usage')
        elif fmt == 'ollama':
            text = data.get('message', {}).get('content', '')
            usage = {k: data[k] for k in ('prompt_eval_count', 'eval_count') if k in data} or None
        else:
            text = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            usage = data.get('usage')
        return _meta({'success': True, 'text': text, 'usage': usage})
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if hasattr(e, 'read') else str(e)
        return _meta({'success': False, 'error': f'API error {e.code}: {err_body[:500]}'})
    except Exception as e:
        return _meta({'success': False, 'error': str(e)})
