import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SHELL } from '../ui/shell-theme.js';
import { LOCAL_PROVIDER_IDS, type ProviderInfo } from './library-model.js';
import { ManifestPreview } from './DataCartridgeRunner.js';

// ═══════════════════════════════════════════════════════════════
//  创作台 · 设计先行创作流（讨论 → 分解 → 对齐 → 定稿 → 原型）
//   主创作流升级：输入是策划案 / 从讨论窗构想 → AI 分解成 design 目录 → 反复对齐细节 → 定稿生成原型。
//   一句话生成降级为「⚡ 快速模式」（CreationWizard）。
//   · EntryChoice     —— 新建入口双选卡：🗣 设计一个游戏（推荐）/ ⚡ 快速生成
//   · ContinueChoice  —— 已有 design 的卡带「✎ 继续创作」：改设计 / 快改数值(M2 revise)
//   · DesignStudio    —— 设计模式主件：聊天窗 → 目录浏览（左树右文·逐篇「改这里」）→ 定稿生成原型 → 预览保存
//   端点：POST /api/generate {mode: design-chat|design-breakdown|design-revise|prototype}；
//        GET/PUT /api/library/<slug>/design[/<path>]；保存原型走既有 PUT manifest。
//   本组件是**创作台产品壳**（非游戏 UI），沿用既有 React 壳层风格（SHELL 令牌），不走 LayoutNode。
// ═══════════════════════════════════════════════════════════════

const PANEL_BG = SHELL.bg1;

// 关键帧（幂等·全局单例）。prefers-reduced-motion 下瞬现。
function ensureDesignKeyframes(): void {
  if (typeof document === 'undefined') return;
  const id = 'apollo-design-kf';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
    @keyframes apollo-design-fadein { from { opacity: 0; } to { opacity: 1; } }
    @keyframes apollo-design-spin { to { transform: rotate(360deg); } }
    .apollo-design-studio { animation: apollo-design-fadein 0.2s ease; }
    @media (prefers-reduced-motion: reduce) { .apollo-design-studio { animation: none; } }
  `;
  document.head.appendChild(s);
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

/** 设计模式默认 provider 优先级：① 配了 key 的真云 provider（deepseek/qwen…）→ ② mock（仅
 *  APOLLO_MOCK_LLM=1 才在列·测试意图明确）→ ③ 本地 Ollama / 其它 available 兜底。
 *  绝不让 mock 静默顶替用户配置的真 provider——这正是「怪 sample」的根：旧逻辑把 mock 排最前，
 *  用户明明配了 deepseek 也被 mock 的内置样例（投骰/平台跳）顶掉。注意 `local`(Ollama) 后端恒报
 *  available=true（未必真在跑），故必须排在 mock 之后，否则测试/无云 key 环境会误连 11434 拒连。 */
function pickProvider(providers: ProviderInfo[]): ProviderInfo | null {
  return (
    providers.find((p) => p.available && p.id !== 'mock' && !LOCAL_PROVIDER_IDS.has(p.id))
    ?? providers.find((p) => p.available && p.id === 'mock')
    ?? providers.find((p) => p.available)
    ?? null
  );
}

interface DraftSummary { id: string; slug: string | null; name: string; phase: Phase; updatedAt: string; turns: number; messageCount: number }

/** 草稿 id：优先 crypto.randomUUID；无则时间戳兜底（studio 产品壳·非 sim·无确定性要求）。 */
function newDraftId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const perf = typeof performance !== 'undefined' ? Math.floor(performance.now()) : 0;
  return `d-${Date.now().toString(36)}-${perf.toString(36)}`;
}

/** 相对时间（草稿列表用·简版）：刚刚 / N 分钟前 / N 小时前 / MM-DD HH:mm。 */
function fmtDraftTime(iso: string): string {
  if (!iso) return '';
  const t = Date.parse(iso.replace(' ', 'T'));
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const PHASE_LABEL: Record<Phase, string> = { chat: '讨论中', design: '设计稿', preview: '原型预览' };

/** 把 provider 的原始返回体安全序列化成可展开的「原文」（失败态展示·绝不再抛）。 */
function safeStringify(v: unknown): string | undefined {
  if (v == null) return undefined;
  try { return typeof v === 'string' ? v : JSON.stringify(v, null, 2); }
  catch { return String(v); }
}

// ── 新建入口双选卡（🗣 设计一个游戏 推荐 / ⚡ 快速生成）──
export function EntryChoice({ onDesign, onQuick, onClose }: {
  onDesign: () => void;
  onQuick: () => void;
  onClose: () => void;
}) {
  return (
    <div onClick={onClose} onKeyDown={(e) => e.stopPropagation()} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} className="apollo-design-studio" style={{
        width: 'min(680px, 94vw)', background: PANEL_BG, border: `1px solid ${SHELL.lineStrong}`,
        borderRadius: 14, padding: '26px 26px 30px', fontFamily: SHELL.fontUi, color: SHELL.text,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.6 }}>＋ 新建游戏</span>
          <button onClick={onClose} aria-label="关闭" style={closeBtn}>×</button>
        </div>
        <div style={{ fontSize: 13, color: SHELL.sub, marginBottom: 20 }}>选一种创作方式</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <ChoiceCard
            emoji="🗣" title="设计一个游戏" badge="推荐"
            desc="和 AI 聊清楚玩法 → 分解成设计稿 → 逐条对齐 → 定稿生成原型。做得深、改得准。"
            onClick={onDesign} accent={SHELL.jade}
          />
          <ChoiceCard
            emoji="⚡" title="快速生成"
            desc="说一句创意，直接压出一盘可玩卡带。想先看到东西、之后再慢慢改就选它。"
            onClick={onQuick} accent={SHELL.violet}
          />
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ emoji, title, desc, onClick, accent, badge }: {
  emoji: string; title: string; desc: string; onClick: () => void; accent: string; badge?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        flex: '1 1 260px', minWidth: 240, textAlign: 'left', cursor: 'pointer',
        padding: '20px 18px', borderRadius: 12, fontFamily: SHELL.fontUi,
        background: hover ? `${accent}14` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hover ? accent : SHELL.line}`,
        transition: 'background 0.18s, border-color 0.18s', outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 30, lineHeight: 1 }}>{emoji}</span>
        <span style={{ fontSize: 17, fontWeight: 700, color: SHELL.text }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', background: accent, padding: '2px 8px', borderRadius: 999 }}>{badge}</span>
        )}
      </div>
      <div style={{ fontSize: 13, color: SHELL.sub, lineHeight: 1.7 }}>{desc}</div>
    </button>
  );
}

// ── 已有 design 的卡带「✎ 继续创作」双选：改设计 / 快改数值 ──
export function ContinueChoice({ name, onEditDesign, onQuickRevise, onClose }: {
  name: string;
  onEditDesign: () => void;
  onQuickRevise: () => void;
  onClose: () => void;
}) {
  return (
    <div onClick={onClose} onKeyDown={(e) => e.stopPropagation()} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} className="apollo-design-studio" style={{
        width: 'min(620px, 94vw)', background: PANEL_BG, border: `1px solid ${SHELL.lineStrong}`,
        borderRadius: 14, padding: '26px 26px 30px', fontFamily: SHELL.fontUi, color: SHELL.text,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>✎ 继续创作 · {name}</span>
          <button onClick={onClose} aria-label="关闭" style={closeBtn}>×</button>
        </div>
        <div style={{ fontSize: 13, color: SHELL.sub, marginBottom: 20 }}>这盘卡带有设计稿。你想怎么改？</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <ChoiceCard emoji="📐" title="改设计" desc="打开设计稿目录，对齐玩法/数值/内容规模，改完再重新生成原型。" onClick={onEditDesign} accent={SHELL.jade} />
          <ChoiceCard emoji="🎚" title="快改数值" desc="不动设计，直接对当前卡带下一句修改指令（M2 对话式迭代）。" onClick={onQuickRevise} accent={SHELL.violet} />
        </div>
      </div>
    </div>
  );
}

type Phase = 'chat' | 'design' | 'preview';

export function DesignStudio({
  api, providers, catalog, catalogIndex, resolveArt, initialSlug, initialName, onClose, onSaved, onDirty,
}: {
  api: string;
  providers: ProviderInfo[];
  catalog: string;
  /** 能力**索引面**（id + 一句话·约 7.8k vs 全量近 7 万）。用于只需「按名字挑件」的调用；
   *  缺省回落全量（老调用方零回归）。省上下文这件事此前只有命令行享受得到，产品路径一个字节没省。 */
  catalogIndex?: string;
  resolveArt?: (raw: unknown) => unknown;
  /** 继续创作已有 design → 直接进目录浏览（跳过讨论）。 */
  initialSlug?: string;
  initialName?: string;
  onClose: () => void;
  /** 原型保存入库成功 → 刷架 + 选中该 slug。 */
  onSaved: (slug: string, warnings?: string[]) => void;
  /** 分解已建库 / 落盘改动 → 通知上层刷架（卡带此刻已存在）。 */
  onDirty?: () => void;
}) {
  useEffect(ensureDesignKeyframes, []);

  const provider = useMemo(() => pickProvider(providers), [providers]);

  const [name, setName] = useState(initialName ?? '');
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
  const [phase, setPhase] = useState<Phase>(initialSlug ? 'design' : 'chat');

  // 讨论
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [ready, setReady] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  // 目录 / 对齐
  const [files, setFiles] = useState<Record<string, string> | null>(initialSlug ? null : {});
  const [selected, setSelected] = useState<string | null>(null);
  const [reviseInput, setReviseInput] = useState('');
  const [revising, setRevising] = useState(false);

  // 分解 / 原型 / 保存
  const [busy, setBusy] = useState(false);
  const [previewManifest, setPreviewManifest] = useState<unknown>(null);
  // 生成期告警（计划体检 + 引擎告警）。**不拦，但必须看得见**：服务端早就把 planCheck/warnings
  // 原样带回来了，可界面一直没画——独立审查第二轮把这点判成「假覆盖」（字段在、渲染没有，
  // 等于守卫守了个空气）。这两份 state 就是那块缺掉的渲染面。
  const [genWarnings, setGenWarnings] = useState<string[]>([]);
  const [planCheck, setPlanCheck] = useState<{ hasPlan?: boolean; unknownIds?: string[]; pendingGaps?: string[] } | null>(null);
  const [err, setErr] = useState<{ message: string; raw?: string } | null>(null);

  // 草稿持久化 + 相变后对话回看
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [showThread, setShowThread] = useState(false);
  const draftIdRef = useRef<string>(newDraftId());
  const latestDraftRef = useRef<Record<string, unknown> | null>(null);
  const discardedRef = useRef(false);   // 弃置后禁止再落盘/复活（防 flush/unmount 复活已删草稿）

  const showErr = useCallback((message: string, raw?: string) => setErr({ message, raw }), []);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [messages, chatBusy]);

  const loadDesign = useCallback(async (s: string) => {
    try {
      const r = await fetch(`${api}/api/library/${s}/design`);
      const d = await r.json();
      const f = (d?.files ?? {}) as Record<string, string>;
      setFiles(f);
      setSelected((prev) => (prev && f[prev] ? prev : Object.keys(f)[0] ?? null));
    } catch (e: unknown) {
      showErr(e instanceof Error ? e.message : String(e));
      setFiles({});
    }
  }, [api, showErr]);

  useEffect(() => { if (initialSlug) loadDesign(initialSlug); }, [initialSlug, loadDesign]);

  const post = useCallback((body: unknown) => fetch(`${api}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json()), [api]);

  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || chatBusy || !provider) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setChatBusy(true);
    setErr(null);
    try {
      const d = await post({ mode: 'design-chat', messages: next, provider: provider.id });
      if (d?.success) {
        setMessages((m) => [...m, { role: 'assistant', content: d.reply ?? '' }]);
        setReady((prev) => prev || !!d.ready);
      } else {
        // 失败不降级：红条报错 + 线程原样保留（用户那条 user 消息已在 next 里，不清空）。
        showErr(d?.error ?? '讨论失败（provider 返回不可解析）', safeStringify(d));
      }
    } catch (e: unknown) {
      showErr(e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : undefined);
    }
    setChatBusy(false);
  }, [input, chatBusy, provider, messages, post, showErr]);

  const breakdown = useCallback(async () => {
    if (!name.trim() || !ready || busy || !provider) return;
    setBusy(true);
    setErr(null);
    try {
      let s = slug;
      if (!s) {
        // description=设计讨论的第一条用户消息（一句话玩法·REQ-WORKSHOP C1）→ meta 副标题 + S1 立项卡 pitch。
        const pitch = (messages.find((m) => m.role === 'user')?.content ?? '').trim().slice(0, 300);
        const cr = await fetch(`${api}/api/library/create`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: pitch, provider: provider.id }),
        });
        const cd = await cr.json();
        if (!cd?.success || !cd?.slug) throw new Error(cd?.error ?? '建库失败');
        s = cd.slug;
        setSlug(s);
      }
      // 分解阶段产出的是**设计稿**（按名字点名要用哪些能力），不出 manifest ⇒ 索引面够用。
      // 全量目录留给 prototype 那一步（真要逐字段形状）。实测省 88.7% 上下文。
      const d = await post({ mode: 'design-breakdown', slug: s, messages, catalog: catalogIndex ?? catalog, provider: provider.id });
      if (!d?.success) throw new Error(d?.error ?? '分解失败');
      const f = (d.files ?? {}) as Record<string, string>;
      setFiles(f);
      setSelected(Object.keys(f)[0] ?? null);
      setPhase('design');
      onDirty?.();   // 游戏此刻已建 + 落了设计稿 → 让上层刷架
    } catch (e: unknown) {
      showErr(e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : undefined);
    }
    setBusy(false);
  }, [name, ready, busy, provider, slug, api, messages, catalog, catalogIndex, post, onDirty, showErr]);

  const reviseFile = useCallback(async () => {
    if (!selected || !reviseInput.trim() || revising || !provider || !slug || !files) return;
    setRevising(true);
    setErr(null);
    try {
      const d = await post({
        mode: 'design-revise', file_path: selected,
        current_content: files[selected] ?? '', instruction: reviseInput.trim(), provider: provider.id,
      });
      if (!d?.success || typeof d.content !== 'string') throw new Error(d?.error ?? '修订失败');
      const content = d.content as string;
      const pr = await fetch(`${api}/api/library/${slug}/design/${selected}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, note: reviseInput.trim().slice(0, 50) || `design: ${selected}` }),
      });
      const pd = await pr.json();
      if (!pd?.success) throw new Error(pd?.error ?? '落盘失败');
      setFiles((prev) => ({ ...(prev ?? {}), [selected]: content }));
      setReviseInput('');
      onDirty?.();
    } catch (e: unknown) {
      showErr(e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : undefined);
    }
    setRevising(false);
  }, [selected, reviseInput, revising, provider, slug, files, api, post, onDirty, showErr]);

  const prototype = useCallback(async () => {
    if (!slug || busy || !provider) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await post({ mode: 'prototype', slug, catalog, provider: provider.id });
      if (!d?.success) throw new Error(d?.error ?? '原型生成失败');
      setPreviewManifest(d.manifest ?? d.blueprint);
      setGenWarnings(Array.isArray(d.warnings) ? d.warnings.map(String) : []);
      setPlanCheck((d.planCheck as { hasPlan?: boolean; unknownIds?: string[]; pendingGaps?: string[] } | undefined) ?? null);
      setPhase('preview');
    } catch (e: unknown) {
      showErr(e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : undefined);
    }
    setBusy(false);
  }, [slug, busy, provider, catalog, post, showErr]);

  const savePrototype = useCallback(async () => {
    if (!slug || previewManifest == null || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const pr = await fetch(`${api}/api/library/${slug}/manifest`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest: previewManifest, note: '原型生成 v1' }),
      });
      const pd = await pr.json();
      if (!pd?.success) throw new Error(pd?.error ?? '保存失败');
      // 入库成功=创作完成 → 弃置草稿（fire-and-forget）+ 禁后续 flush 复活。
      discardedRef.current = true;
      fetch(`${api}/api/design-drafts/${draftIdRef.current}`, { method: 'DELETE' }).catch(() => {});
      onSaved(slug, genWarnings.length > 0 ? genWarnings : (Array.isArray(pd.warnings) ? pd.warnings.map(String) : undefined));
    } catch (e: unknown) {
      showErr(e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : undefined);
      setBusy(false);
    }
  }, [slug, previewManifest, busy, api, onSaved, showErr, genWarnings]);

  // ── 草稿持久化：每轮 chat 往返 / 相变 / 改稿后自动落盘（防抖 400ms）——刷新/相变/换页永不丢 ──
  // 只在有值得留存的中间态（有对话 或 有设计稿）时落盘，避免开台即空写污染草稿区。
  const draftBody = useMemo(() => ({
    id: draftIdRef.current,
    slug, name, provider: provider?.id ?? null, phase, ready,
    messages, files: files ?? {}, manifest: previewManifest ?? null,
  }), [slug, name, provider, phase, ready, messages, files, previewManifest]);
  useEffect(() => { latestDraftRef.current = draftBody; }, [draftBody]);

  const draftWorthSaving = useCallback((d: Record<string, unknown>): boolean => {
    const msgs = d.messages as unknown[] | undefined;
    const f = d.files as Record<string, unknown> | undefined;
    return (Array.isArray(msgs) && msgs.length > 0) || (!!f && Object.keys(f).length > 0);
  }, []);

  useEffect(() => {
    if (discardedRef.current || !draftWorthSaving(draftBody)) return;
    const t = setTimeout(() => {
      fetch(`${api}/api/design-drafts/${draftIdRef.current}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draftBody),
      }).catch(() => { /* 落盘失败静默：下一轮/关闭时会再落 */ });
    }, 400);
    return () => clearTimeout(t);
  }, [draftBody, api, draftWorthSaving]);

  // 立即落盘（关闭 / 换页 unload 用·keepalive 保证卸载时也送达）。
  const flushDraft = useCallback(() => {
    if (discardedRef.current) return;
    const d = latestDraftRef.current;
    if (!d || !draftWorthSaving(d)) return;
    try {
      fetch(`${api}/api/design-drafts/${draftIdRef.current}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d), keepalive: true,
      }).catch(() => {});
    } catch { /* noop */ }
  }, [api, draftWorthSaving]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onUnload = () => flushDraft();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [flushDraft]);

  const handleClose = useCallback(() => { flushDraft(); onClose(); }, [flushDraft, onClose]);

  // 未完成草稿列表（打开设计台时·仅新建流展示·时间倒序由服务端给）。
  const refreshDrafts = useCallback(async () => {
    try {
      const r = await fetch(`${api}/api/design-drafts`);
      const d = await r.json();
      setDrafts(Array.isArray(d?.drafts) ? d.drafts : []);
    } catch { setDrafts([]); }
  }, [api]);
  useEffect(() => { if (!initialSlug) refreshDrafts(); }, [initialSlug, refreshDrafts]);

  const resumeDraft = useCallback(async (id: string) => {
    setErr(null);
    try {
      const r = await fetch(`${api}/api/design-drafts/${id}`);
      const d = await r.json();
      const draft = d?.draft;
      if (!d?.success || !draft) throw new Error(d?.error ?? '草稿读取失败');
      discardedRef.current = false;
      draftIdRef.current = id;
      const dFiles = (draft.files && typeof draft.files === 'object') ? draft.files as Record<string, string> : {};
      const dMsgs = Array.isArray(draft.messages) ? draft.messages : [];
      setName(typeof draft.name === 'string' ? draft.name : '');
      setSlug(typeof draft.slug === 'string' ? draft.slug : null);
      setMessages(dMsgs);
      setReady(!!draft.ready);
      setFiles(dFiles);
      setSelected(Object.keys(dFiles)[0] ?? null);
      setPreviewManifest(draft.manifest ?? null);
      const ph: Phase = (draft.phase === 'design' || draft.phase === 'preview') ? draft.phase : 'chat';
      setPhase(ph);
      setDrafts([]);
      // named 草稿若没随身带 files（老数据）→ 从服务端补拉最新设计稿。
      if (typeof draft.slug === 'string' && Object.keys(dFiles).length === 0) loadDesign(draft.slug);
    } catch (e: unknown) {
      showErr(e instanceof Error ? e.message : String(e));
    }
  }, [api, loadDesign, showErr]);

  const discardDraft = useCallback(async (id: string, active = false) => {
    const ok = typeof window === 'undefined' || window.confirm('确认弃置这份草稿？删除后无法恢复。');
    if (!ok) return;
    if (active) discardedRef.current = true;   // 阻止 flush/自动落盘复活已删草稿
    try { await fetch(`${api}/api/design-drafts/${id}`, { method: 'DELETE' }); } catch { /* noop */ }
    if (active) {
      setMessages([]); setFiles({}); setPreviewManifest(null); setReady(false);
      setSelected(null); setPhase('chat'); setSlug(null); setName(initialName ?? '');
      setShowThread(false); setErr(null);
      draftIdRef.current = newDraftId();
      discardedRef.current = false;
    }
    refreshDrafts();
  }, [api, initialName, refreshDrafts]);

  const hasActiveDraft = messages.length > 0 || !!slug;

  const providerBar = (
    <div style={{ fontSize: 12, color: SHELL.sub, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>当前 AI：{provider
        ? <b style={{ color: SHELL.jade }}>{provider.name}</b>
        : <b style={{ color: SHELL.warn }}>未配置 API Key（去设置或用本地模型）</b>}</span>
      {provider?.id === 'mock' && (
        <span title="当前是 Mock 测试后端，输出为内置样例——不是真 AI 生成" style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: '#0f172a',
          background: SHELL.warn, padding: '1px 6px', borderRadius: 4,
        }}>MOCK</span>
      )}
    </div>
  );

  return (
    <div
      onKeyDown={(e) => e.stopPropagation()}   // 挡键盘事件冒泡到 launcher 轮播的 window handler（防裸 Enter 启动库卡带）
      style={{
        position: 'fixed', inset: 0, background: SHELL.bg0, color: SHELL.text,
        display: 'flex', flexDirection: 'column', fontFamily: SHELL.fontUi, zIndex: 400,
      }} className="apollo-design-studio">
      {/* 头栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px',
        borderBottom: `1px solid ${SHELL.line}`,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.6 }}>🗣 设计工作台</span>
        <StepDots phase={phase} />
        <span style={{ flex: 1 }} />
        {/* 相变后（设计稿/原型态）仍可回看讨论线程——绝不销毁对话。 */}
        {phase !== 'chat' && messages.length > 0 && (
          <button onClick={() => setShowThread(true)} style={{ ...secondaryBtn, padding: '6px 12px', fontSize: 12 }}>
            💬 对话记录（{messages.length}）
          </button>
        )}
        {hasActiveDraft && (
          <button
            onClick={() => discardDraft(draftIdRef.current, true)}
            title="弃置当前草稿（需二次确认）"
            style={{ ...secondaryBtn, padding: '6px 12px', fontSize: 12, color: SHELL.danger, borderColor: `${SHELL.danger}55` }}
          >弃置草稿</button>
        )}
        {providerBar}
        <button onClick={handleClose} aria-label="关闭" style={{ ...closeBtn, fontSize: 24 }}>×</button>
      </div>

      {err && (
        <div style={{ padding: '12px 22px', background: SHELL.dangerWash, borderBottom: `1px solid ${SHELL.danger}66` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ color: SHELL.danger, fontSize: 14, fontWeight: 800 }}>⚠ 出错了</span>
            <span style={{ color: SHELL.text, fontSize: 13.5, flex: 1, wordBreak: 'break-word' }}>{err.message}</span>
            <button onClick={() => setErr(null)} style={{ ...secondaryBtn, padding: '4px 10px', fontSize: 12 }}>知道了</button>
          </div>
          <div style={{ color: SHELL.sub, fontSize: 12, marginTop: 4 }}>你的对话没有丢——修好后可直接继续（AI 失败不会用样例顶替真输出）。</div>
          {err.raw && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ color: SHELL.danger, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>查看原始返回（未改动·可复制排查）</summary>
              <pre style={{
                color: SHELL.sub, fontSize: 11.5, lineHeight: 1.5, marginTop: 6, maxHeight: 200, overflow: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: SHELL.bg0, border: `1px solid ${SHELL.line}`, borderRadius: 6, padding: 8,
              }}>{err.raw}</pre>
            </details>
          )}
        </div>
      )}

      {/* ── 讨论态 ── */}
      {phase === 'chat' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '14px 22px 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: SHELL.dim }}>游戏名</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}  // 裸 Enter 不提交/不触发相变
              placeholder="给你的游戏起个名字（分解前必填）"
              style={{ ...inputStyle, width: 320, maxWidth: '60vw' }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            {/* 未完成草稿一键恢复（时间倒序·仅新建流·开台即见） */}
            {messages.length === 0 && drafts.length > 0 && (
              <div style={{ border: `1px solid ${SHELL.jadeLine}`, background: SHELL.jadeWash, borderRadius: 10, padding: '12px 14px', maxWidth: 680 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: SHELL.jade, marginBottom: 8 }}>⏮ 未完成的草稿（点「恢复」接着做）</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {drafts.map((dr) => (
                    <div key={dr.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)', border: `1px solid ${SHELL.line}`,
                    }}>
                      <span style={{ fontSize: 13, color: SHELL.text, fontWeight: 600 }}>{dr.name || '（未命名）'}</span>
                      <span style={{ fontSize: 11.5, color: SHELL.dim }}>{PHASE_LABEL[dr.phase] ?? dr.phase} · {dr.turns} 轮对话 · {fmtDraftTime(dr.updatedAt)}</span>
                      <span style={{ flex: 1 }} />
                      <button onClick={() => resumeDraft(dr.id)} style={{ ...primaryBtn, padding: '5px 14px', fontSize: 12 }}>恢复</button>
                      <button onClick={() => discardDraft(dr.id)} title="弃置这份草稿" style={{ ...closeBtn, fontSize: 18, color: SHELL.dim }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {messages.length === 0 && (
              <div style={{ color: SHELL.dim, fontSize: 14, lineHeight: 1.8, maxWidth: 640 }}>
                先聊清楚你的想法——AI 会引导你把<b style={{ color: SHELL.sub }}> 类型与参照物 / 核心循环 / 胜负与进程 / 内容规模 </b>
                这四件事说明白，然后你就能一键把它分解成设计稿。<br />
                <span style={{ color: SHELL.faint }}>例：「我想做个两人投骰子比大小的小游戏」</span>
              </div>
            )}
            {messages.map((m, i) => <Bubble key={i} role={m.role} text={m.content} />)}
            {chatBusy && <Bubble role="assistant" text="…" busy />}
            {ready && (
              <div style={{
                alignSelf: 'flex-start', padding: '8px 12px', borderRadius: 8,
                background: SHELL.jadeWash, border: `1px solid ${SHELL.jadeLine}`, color: SHELL.jade, fontSize: 12,
              }}>
                ✓ 想法够清楚了，可以分解成设计稿了
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: '12px 22px 18px', borderTop: `1px solid ${SHELL.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <textarea
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendChat(); } }}
                placeholder="说说你的想法…（Ctrl/⌘+Enter 发送）"
                rows={2}
                disabled={!provider}
                style={{ ...inputStyle, flex: 1, resize: 'vertical', minHeight: 48 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <button onClick={sendChat} disabled={!input.trim() || chatBusy || !provider} style={{ ...secondaryBtn, flex: 1, opacity: (!input.trim() || chatBusy || !provider) ? 0.5 : 1 }}>
                  发送
                </button>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: SHELL.jade, textAlign: 'center', letterSpacing: 0.3 }}>Ctrl / ⌘ + Enter</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: SHELL.dim }}>
              <b style={{ color: SHELL.sub }}>回车换行</b>，<b style={{ color: SHELL.jade }}>Ctrl / ⌘ + Enter 才发送</b>——裸回车不会发送、也不会触发相变。
            </div>
            <button
              onClick={breakdown}
              disabled={!ready || !name.trim() || busy || !provider}
              title={!name.trim() ? '先给游戏起个名字' : (!ready ? '再聊几句，把四件事说清楚' : undefined)}
              style={{ ...primaryBtn, opacity: (!ready || !name.trim() || busy) ? 0.5 : 1, cursor: (!ready || !name.trim() || busy) ? 'default' : 'pointer' }}
            >
              {busy ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Spinner /> 正在分解成设计稿…</span> : '分解成设计稿 →'}
            </button>
          </div>
        </div>
      )}

      {/* ── 目录浏览 / 对齐态 ── */}
      {phase === 'design' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '12px 22px', borderBottom: `1px solid ${SHELL.line}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, color: SHELL.sub }}>设计稿目录 · <b style={{ color: SHELL.text }}>{name || slug}</b></span>
            <span style={{ flex: 1 }} />
            <button onClick={prototype} disabled={busy || !files || Object.keys(files).length === 0} style={{ ...primaryBtn, padding: '9px 18px', opacity: (busy || !files || Object.keys(files ?? {}).length === 0) ? 0.5 : 1 }}>
              {busy ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Spinner /> 生成原型中…</span> : '设计定稿 → 生成原型'}
            </button>
          </div>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {/* 左：文件树 */}
            <div style={{ width: 230, minWidth: 180, borderRight: `1px solid ${SHELL.line}`, overflowY: 'auto', padding: 10 }}>
              {files === null ? (
                <div style={{ color: SHELL.dim, fontSize: 13, padding: 12 }}>加载设计稿…</div>
              ) : Object.keys(files).length === 0 ? (
                <div style={{ color: SHELL.dim, fontSize: 13, padding: 12 }}>（暂无设计稿）</div>
              ) : (
                Object.keys(files).sort().map((f) => (
                  <button key={f} onClick={() => { setSelected(f); setReviseInput(''); }} style={{
                    display: 'block', width: '100%', textAlign: 'left', marginBottom: 4,
                    padding: '8px 10px', borderRadius: 7, fontFamily: SHELL.fontMono, fontSize: 12,
                    background: selected === f ? SHELL.jadeWash : 'transparent',
                    border: `1px solid ${selected === f ? SHELL.jadeLine : 'transparent'}`,
                    color: selected === f ? SHELL.jade : SHELL.sub, cursor: 'pointer', outline: 'none',
                  }}>
                    {f}
                  </button>
                ))
              )}
            </div>
            {/* 右：内容 + 「改这里」 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
                {selected && files ? (
                  <pre style={{
                    margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    fontFamily: SHELL.fontMono, fontSize: 13, lineHeight: 1.7, color: SHELL.text,
                  }}>{files[selected]}</pre>
                ) : (
                  <div style={{ color: SHELL.dim, fontSize: 13 }}>选一份设计稿查看</div>
                )}
              </div>
              {selected && (
                <div style={{ borderTop: `1px solid ${SHELL.line}`, padding: '12px 22px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <label style={{ fontSize: 12, color: SHELL.dim }}>改这里：（对 <b style={{ color: SHELL.sub }}>{selected}</b> 下一句修订指令）</label>
                    <textarea
                      value={reviseInput} onChange={(e) => setReviseInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); reviseFile(); } }}
                      placeholder="例：把目标分数从 2 改成 3 / 加一句节奏描述 / 补一个音效系统（Ctrl/⌘+Enter 应用）"
                      rows={2}
                      disabled={!provider}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 44 }}
                    />
                  </div>
                  <button onClick={reviseFile} disabled={!reviseInput.trim() || revising || !provider} style={{ ...secondaryBtn, marginTop: 22, opacity: (!reviseInput.trim() || revising || !provider) ? 0.5 : 1 }}>
                    {revising ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner /> 修订中</span> : '应用修订'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 原型预览态 ── */}
      {phase === 'preview' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '18px 22px', gap: 14, overflowY: 'auto' }}>
          <div style={{ fontSize: 14, color: SHELL.sub }}>原型预览 · <b style={{ color: SHELL.text }}>{name || slug}</b>（由设计稿生成）</div>
          {(genWarnings.length > 0 || planCheck?.hasPlan === false) && (
            <div style={{ background: 'rgba(255,176,32,0.08)', border: '1px solid rgba(255,176,32,0.45)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 600, color: '#ffb020', marginBottom: 4 }}>
                生成期告警 {genWarnings.length > 0 ? `· ${genWarnings.length} 条` : ''}（不拦，但别当没看见）
              </div>
              {genWarnings.map((w, i) => (
                <div key={i} style={{ color: SHELL.text }}>· {w}</div>
              ))}
              {planCheck?.hasPlan === false && genWarnings.length === 0 && (
                <div style={{ color: SHELL.text }}>· 设计里没有 capability-plan.md —— 没做能力总览就生成，等于跳过 S2</div>
              )}
              {(planCheck?.unknownIds?.length ?? 0) > 0 && (
                <div style={{ color: SHELL.sub, marginTop: 4 }}>编造的能力 id：{planCheck!.unknownIds!.join('、')}</div>
              )}
              {(planCheck?.pendingGaps?.length ?? 0) > 0 && (
                <div style={{ color: SHELL.sub }}>未裁决缺口 {planCheck!.pendingGaps!.length} 条 —— 先走缺口裁决协议（先查 → 摆 A/B → owner 判）</div>
              )}
            </div>
          )}
          <div style={{ background: SHELL.bg1, borderRadius: 10, border: `1px solid ${SHELL.line}`, padding: 8, alignSelf: 'center' }}>
            <ManifestPreview manifest={previewManifest} resolveArt={resolveArt} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={savePrototype} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Spinner /> 保存入库…</span> : '保存入库'}
            </button>
            <button onClick={() => setPhase('design')} style={secondaryBtn}>← 回设计稿再改改</button>
          </div>
        </div>
      )}

      {/* 相变后对话线程回看抽屉（右滑·只读·绝不销毁讨论记录） */}
      {showThread && <ThreadDrawer messages={messages} onClose={() => setShowThread(false)} />}
    </div>
  );
}

function ThreadDrawer({ messages, onClose }: { messages: ChatMsg[]; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,12,0.5)', zIndex: 420, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(460px, 92vw)', height: '100%', background: SHELL.bg1, borderLeft: `1px solid ${SHELL.lineStrong}`,
        boxShadow: '-16px 0 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', fontFamily: SHELL.fontUi,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${SHELL.line}` }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: SHELL.text }}>💬 讨论记录</span>
          <span style={{ fontSize: 12, color: SHELL.dim }}>（{messages.length} 条·只读）</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="关闭" style={closeBtn}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0
            ? <div style={{ color: SHELL.dim, fontSize: 13 }}>（本会话没有讨论记录）</div>
            : messages.map((m, i) => <Bubble key={i} role={m.role} text={m.content} />)}
        </div>
      </div>
    </div>
  );
}

function StepDots({ phase }: { phase: Phase }) {
  const steps: Array<{ k: Phase; label: string }> = [
    { k: 'chat', label: '讨论' }, { k: 'design', label: '设计稿' }, { k: 'preview', label: '原型' },
  ];
  const idx = steps.findIndex((s) => s.k === phase);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.k}>
          <span style={{ fontSize: 12, color: i <= idx ? SHELL.jade : SHELL.faint, fontWeight: i === idx ? 700 : 500 }}>{s.label}</span>
          {i < steps.length - 1 && <span style={{ color: SHELL.faint, fontSize: 11 }}>›</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

function Bubble({ role, text, busy }: { role: 'user' | 'assistant'; text: string; busy?: boolean }) {
  const mine = role === 'user';
  return (
    <div style={{
      alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%',
      padding: '10px 14px', borderRadius: 12,
      background: mine ? SHELL.violetWash : 'rgba(255,255,255,0.04)',
      border: `1px solid ${mine ? SHELL.violetLine : SHELL.line}`,
      color: SHELL.text, fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {busy ? <Spinner /> : text}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 14, height: 14, borderRadius: '50%',
      border: `2px solid ${SHELL.line}`, borderTopColor: SHELL.jade,
      display: 'inline-block', animation: 'apollo-design-spin 0.8s linear infinite',
    }} />
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(3,6,12,0.66)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 350, padding: 20,
};

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: SHELL.dim, cursor: 'pointer', fontSize: 22, lineHeight: 1, outline: 'none',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', boxSizing: 'border-box',
  background: SHELL.bg0, color: SHELL.text,
  border: `1px solid ${SHELL.line}`, borderRadius: 8,
  fontSize: 14, outline: 'none', fontFamily: SHELL.fontUi,
};

const primaryBtn: React.CSSProperties = {
  padding: '11px 20px', borderRadius: 9, border: 'none',
  background: `linear-gradient(135deg, ${SHELL.jade}, ${SHELL.jade}cc)`,
  color: '#0f172a', fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
  cursor: 'pointer', outline: 'none', fontFamily: SHELL.fontUi,
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 9,
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${SHELL.line}`,
  color: SHELL.sub, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', outline: 'none', fontFamily: SHELL.fontUi, whiteSpace: 'nowrap',
};
