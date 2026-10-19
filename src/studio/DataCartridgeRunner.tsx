import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseManifestDetailed } from '../assembly/manifest.js';
import { SHELL } from '../ui/shell-theme.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';
import type { GameEntry, LibraryEntry } from './library-model.js';
import { runBlueprintInto, controllablePlayerIds, RUN_VP } from './cart-run-core.js';
import type { CartPresentation } from '../assembly/cart-presentation.js';
import { fetchCartArtIndex, requireCartAssetIndex, assertCartMasksBound, loadCartArt, resolveCartSkins, type CartArtSession } from '../assets/cart-art.js';

// 引擎运行核已抽到 cart-run-core（供离线单文件 cartridge-inline-run 复用同一路径）。
// 兼容既有引用：controllable.test.ts 仍从本模块导入 controllablePlayerIds。
export { controllablePlayerIds };

// ═══════════════════════════════════════════════════════════════
//  创作台 v1 · 卡带架接库前端（玩家模式）
//   · EmptyShelf            —— 空库欢迎态（呼吸虚线「新建游戏」空卡位 + 装入示例）
//   · StatusLight           —— 顶栏 API 状态灯（已连接 / 未配置）
//   · LibraryShelf          —— 受控展示：entries=null 加载中 / [] 空态 / 有 → renderCarousel
//   · LibActionBar          —— 选中 library 卡带的操作条（开始 / 继续创作 / 版本历史 / 导出占位）
//   · VersionHistoryOverlay —— 版本历史浮层（列 history · 逐行回滚）
//   · DataCartridgeRunner   —— 全屏纯运行（挂载即拉 manifest→parse→跑，左上返回架上）
//  数据（library 列表）由 launcher 统一拉取持有——返修 Lead 缺陷 #1 的根因正是「shelf 自拉 +
//  launcher 另拉」两份状态在玩家模式下断线；收成单一数据源杜绝这一类。
//  纯运行部分抽自 StudioInspector 的引擎生命周期（load→CanvasRenderer→start），无检查器 chrome。
// ═══════════════════════════════════════════════════════════════

const CART_W = 160; // 对齐现有 Cartridge 尺寸/圆角
const CART_H = 240;
const CART_RADIUS = 10;

// 呼吸动画注入（幂等·全局单例）：prefers-reduced-motion 下自动降级为静态描边（媒体查询关掉 animation）。
function ensureShelfKeyframes(): void {
  if (typeof document === 'undefined') return;
  const id = 'apollo-shelf-kf';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
    @keyframes apollo-shelf-breathe {
      0%, 100% { border-color: rgba(56,189,248,0.28); box-shadow: 0 0 0 0 rgba(56,189,248,0.0); }
      50%      { border-color: rgba(56,189,248,0.72); box-shadow: 0 0 22px 2px rgba(56,189,248,0.18); }
    }
    .apollo-shelf-newcard { animation: apollo-shelf-breathe 2.8s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) {
      .apollo-shelf-newcard { animation: none; border-color: rgba(56,189,248,0.5); }
    }
  `;
  document.head.appendChild(s);
}

// ── 顶栏 API 状态灯（M3：可点击 → 打开设置面板）──
export function StatusLight({ tone, label, onClick }: { tone: 'ok' | 'warn'; label: string; onClick?: () => void }) {
  const color = tone === 'ok' ? SHELL.ok : SHELL.warn;
  const wash = tone === 'ok' ? SHELL.okWash : SHELL.warnWash;
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '4px 12px', borderRadius: 999,
    background: wash, border: `1px solid ${color}55`,
    color, fontSize: 12, fontWeight: 600, letterSpacing: 0.4,
    userSelect: 'none', fontFamily: SHELL.fontUi,
    cursor: onClick ? 'pointer' : 'default', outline: 'none',
  };
  const inner = (
    <>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
      {onClick && <span style={{ marginLeft: 3, opacity: 0.7 }}>⚙</span>}
    </>
  );
  if (onClick) {
    return <button type="button" title={`${label}（点击设置 AI）`} onClick={onClick} style={style}>{inner}</button>;
  }
  return <span title={label} style={style}>{inner}</span>;
}

// ── 空库欢迎态 ──
export function EmptyShelf({ onNewGame, onInstallSample, installing }: {
  onNewGame: () => void;
  onInstallSample: () => void;
  installing?: boolean;
}) {
  useEffect(ensureShelfKeyframes, []);
  const [hover, setHover] = useState(false);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 26, padding: '48px 20px', textAlign: 'center',
    }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: SHELL.text, letterSpacing: 1 }}>
          你的游戏架还是空的
        </div>
        <div style={{ marginTop: 10, fontSize: 14, color: SHELL.sub, maxWidth: 420, lineHeight: 1.7 }}>
          说一句创意，让 AI 为你压出第一盘卡带
        </div>
      </div>

      {/* 呼吸虚线「新建游戏」空卡位（尺寸/圆角对齐现有 Cartridge） */}
      <button
        onClick={onNewGame}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="apollo-shelf-newcard"
        aria-label="新建游戏"
        style={{
          width: CART_W, height: CART_H, borderRadius: CART_RADIUS,
          border: '2px dashed rgba(56,189,248,0.5)',
          background: hover ? 'rgba(56,189,248,0.07)' : 'rgba(56,189,248,0.03)',
          color: SHELL.text, cursor: 'pointer', outline: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          transition: 'background 0.2s',
          fontFamily: SHELL.fontUi,
        }}
      >
        <span style={{ fontSize: 46, lineHeight: 1, color: '#38bdf8', fontWeight: 300 }}>＋</span>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: 1 }}>新建游戏</span>
      </button>

      {/* 次按钮：装入官方示例卡带 */}
      <button
        onClick={onInstallSample}
        disabled={installing}
        style={{
          padding: '8px 18px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${SHELL.line}`,
          color: installing ? SHELL.dim : SHELL.sub,
          fontSize: 13, cursor: installing ? 'wait' : 'pointer',
          outline: 'none', fontFamily: SHELL.fontUi,
        }}
      >
        {installing ? '装入中…' : '⤓ 装入官方示例卡带'}
      </button>
    </div>
  );
}

// ── library 卡带架（受控展示）：entries=null 加载中 / [] 空态 / 有 → renderCarousel ──
export function LibraryShelf({ entries, installing, onNewGame, onInstallSample, renderCarousel }: {
  entries: LibraryEntry[] | null;
  installing?: boolean;
  onNewGame: () => void;
  onInstallSample: () => void;
  renderCarousel: (entries: LibraryEntry[]) => React.ReactNode;
}) {
  if (entries === null) {
    return <div style={{ padding: 60, textAlign: 'center', color: SHELL.dim, fontSize: 13 }}>加载游戏架…</div>;
  }
  if (entries.length === 0) {
    return <EmptyShelf onNewGame={onNewGame} onInstallSample={onInstallSample} installing={installing} />;
  }
  return <>{renderCarousel(entries)}</>;
}

// ── 选中 library 卡带的操作条（spec ③·替代内置卡带的单个 LAUNCH 大按钮区域）──
export function LibActionBar({ entry, onStart, onContinue, onHistory, onBench, onLedger, onPipeline, onExport }: {
  entry: GameEntry;
  onStart: () => void;
  onContinue: () => void;
  onHistory: () => void;
  onBench?: () => void;
  onLedger?: () => void;
  onPipeline?: () => void;
  onExport?: () => void;
}) {
  const playable = entry.status === 'playable';
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 }}>
      <button
        onClick={() => playable && onStart()}
        disabled={!playable}
        title={playable ? undefined : 'manifest 损坏，先修复（继续创作）'}
        style={{ ...opBtn(true, entry.accentColor), opacity: playable ? 1 : 0.4, cursor: playable ? 'pointer' : 'default' }}
      >
        ▶ 开始游戏
      </button>
      <button onClick={onContinue} style={opBtn(false)}>✎ 继续创作</button>
      <button onClick={onHistory} style={opBtn(false)}>⟲ 版本历史</button>
      {onBench && (
        <button
          onClick={() => playable && onBench()}
          disabled={!playable}
          title={playable ? '跑引擎五轴体检（是否可玩·确定性·数值健康…）' : 'manifest 损坏，先修复'}
          style={{ ...opBtn(false), opacity: playable ? 1 : 0.4, cursor: playable ? 'pointer' : 'default' }}
        >
          🩺 体检
        </button>
      )}
      {onLedger && <button onClick={onLedger} title="美术台账：浏览本局所需美术·按编号点名重生成/换库/上传·一键换皮" style={opBtn(false)}>🎨 美术台账</button>}
      {onPipeline && <button onClick={onPipeline} title="生产流程板：八阶段双验看板（机器门真跑+人门 review 落账）" style={opBtn(false)}>🏭 生产板</button>}
      {onExport
        ? <button onClick={onExport} title="导出下载包（zip：卡带本体 + 游戏资产·不含 mock 预览物）" style={opBtn(false)}>⤓ 导出</button>
        : <button disabled title="即将支持" style={{ ...opBtn(false), opacity: 0.4, cursor: 'default' }}>⤓ 导出</button>}
    </div>
  );
}

// ── 体检浮层（M4）：POST /api/library/<slug>/bench → 五轴分 + 总分 + 及格线 70。──
interface BenchAxisView { name: string; score: number; max: number; notes?: string[] }
interface BenchResult { success?: boolean; error?: string; score?: number; pass?: boolean; threshold?: number; axes?: BenchAxisView[] }

// 轴名中文注解（数据级"看得见"体检的直白解释；仅展示用，评分逻辑全在引擎 zerocraft-bench）。
const AXIS_ZH: Record<string, string> = {
  Structure: '结构 · 装配意图',
  Load: '装载 · 能否成世界',
  Determinism: '确定性 · 两跑一致',
  Numeric: '数值 · 无 NaN/∞',
  Visual: '可见 · 渲染代理',
};

export function BenchOverlay({ api, slug, title, onClose }: {
  api: string;
  slug: string;
  title: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ k: 'loading' } | { k: 'done'; r: BenchResult } | { k: 'error'; message: string }>({ k: 'loading' });

  useEffect(() => {
    let dead = false;
    fetch(`${api}/api/library/${slug}/bench`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => r.json())
      .then((d: BenchResult) => {
        if (dead) return;
        if (d && d.success && typeof d.score === 'number') setState({ k: 'done', r: d });
        else setState({ k: 'error', message: d?.error ?? '体检失败' });
      })
      .catch((e) => { if (!dead) setState({ k: 'error', message: e instanceof Error ? e.message : String(e) }); });
    return () => { dead = true; };
  }, [api, slug]);

  const threshold = (state.k === 'done' && state.r.threshold) || 70;
  const passed = state.k === 'done' && !!state.r.pass;
  const tone = passed ? SHELL.ok : SHELL.warn;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,12,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 220 }}
    >
      <div onClick={(e) => e.stopPropagation()} className="zerocraft-bench-overlay" style={{
        width: 460, maxWidth: '92%', maxHeight: '84%', overflow: 'auto',
        background: SHELL.bg1, border: `1px solid ${SHELL.lineStrong}`, borderRadius: 12, padding: 20,
        fontFamily: SHELL.fontUi,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: SHELL.text }}>🩺 卡带体检 · {title}</span>
          <button onClick={onClose} aria-label="关闭" style={{ background: 'none', border: 'none', color: SHELL.dim, cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        {state.k === 'loading' && <div style={{ color: SHELL.dim, fontSize: 13, padding: '20px 0' }}>正在跑引擎体检（约几秒）…</div>}
        {state.k === 'error' && (
          <div style={{ padding: '10px 12px', background: SHELL.dangerWash, border: `1px solid ${SHELL.danger}44`, borderRadius: 8 }}>
            <div style={{ color: SHELL.danger, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>体检没跑成 😕</div>
            <div style={{ color: SHELL.sub, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{state.message}</div>
          </div>
        )}
        {state.k === 'done' && (
          <>
            {/* 总分 + 及格线 */}
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14,
              padding: '12px 14px', borderRadius: 10,
              background: passed ? SHELL.okWash : SHELL.warnWash, border: `1px solid ${tone}44`,
            }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: tone, lineHeight: 1 }}>{state.r.score}</span>
              <span style={{ fontSize: 14, color: SHELL.sub }}>/ 100</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: tone }}>
                {passed ? '✓ 通过' : '✕ 未及格'}
              </span>
              <span style={{ fontSize: 12, color: SHELL.dim }}>及格线 {threshold}</span>
            </div>

            {/* 五轴分条 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {(state.r.axes ?? []).map((a) => {
                const pct = a.max > 0 ? Math.round((a.score / a.max) * 100) : 0;
                const full = a.score >= a.max;
                const barColor = full ? SHELL.ok : (a.score === 0 ? SHELL.danger : SHELL.warn);
                return (
                  <div key={a.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: SHELL.text }}>{AXIS_ZH[a.name] ?? a.name}</span>
                      <span style={{ color: SHELL.sub, fontFamily: SHELL.fontMono }}>{a.score}/{a.max}</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 999 }} />
                    </div>
                    {a.notes && a.notes.length > 0 && (
                      <div style={{ fontSize: 11, color: SHELL.dim, marginTop: 3, lineHeight: 1.4 }}>{a.notes.join('；')}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface HistoryEntry { rev: string; subject: string; date: string; }

// ── 版本历史浮层：列 GET history 的 entries，逐行「回滚」→ POST rollback → 刷新浮层 + 通知上层刷架 ──
export function VersionHistoryOverlay({ api, slug, onClose, onRolledBack }: {
  api: string;
  slug: string;
  onClose: () => void;
  onRolledBack?: () => void;
}) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${api}/api/library/${slug}/history`)
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data?.entries) ? (data.entries as HistoryEntry[]) : []))
      .catch(() => setHistory([]));
  }, [api, slug]);

  useEffect(load, [load]);

  const rollback = useCallback(async (rev: string) => {
    setRolling(rev);
    try {
      await fetch(`${api}/api/library/${slug}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rev }),
      });
    } catch { /* 离线：静默 */ }
    setRolling(null);
    load();
    onRolledBack?.();
  }, [api, slug, load, onRolledBack]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,12,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxWidth: '92%', maxHeight: '80%', overflow: 'auto',
        background: SHELL.bg1, border: `1px solid ${SHELL.lineStrong}`, borderRadius: 12, padding: 20,
        fontFamily: SHELL.fontUi,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: SHELL.text }}>⟲ 版本历史</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: SHELL.dim, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        {history === null ? (
          <div style={{ color: SHELL.dim, fontSize: 13 }}>加载中…</div>
        ) : history.length === 0 ? (
          <div style={{ color: SHELL.dim, fontSize: 13 }}>（暂无历史版本）</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h) => (
              <div key={h.rev} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${SHELL.line}`, borderRadius: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: SHELL.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.subject}</div>
                  <div style={{ fontSize: 11, color: SHELL.dim, fontFamily: SHELL.fontMono }}>{h.date}</div>
                </div>
                <button onClick={() => rollback(h.rev)} disabled={rolling === h.rev} style={opBtn(false)}>
                  {rolling === h.rev ? '回滚中…' : '回滚'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 纯运行：build 引擎 + CanvasRenderer 跑 WorldBlueprint（无检查器面板）。
//    引擎生命周期/键盘接线/装载探针已抽到 cart-run-core.runBlueprintInto（与离线单文件共用）。──
function RunOnly({ blueprint, vp = RUN_VP, presentation, art, fill = false, onError }: {
  blueprint: WorldBlueprint;
  vp?: { w: number; h: number };
  presentation?: CartPresentation;
  art?: CartArtSession;
  fill?: boolean;
  /** 装载/首帧崩溃时回调错误文本（owner 07-11「告诉我为什么没法加载」——没有它就是静默白屏）。 */
  onError?: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const div = ref.current;
    if (!div) return;
    try {
      // 装载探针（load + 空跑 2 tick）先同步引爆坏稿·成功则建引擎+渲染器跑起来，返回清理函数。
      const stop = runBlueprintInto(div, blueprint, vp, presentation, art?.assets);
      return () => { stop(); art?.dispose(); };
    } catch (e: unknown) {
      art?.dispose();
      onError?.(e instanceof Error ? e.message : String(e));
      return;
    }
  }, [blueprint, vp.w, vp.h, presentation, art, onError]);
  return <div ref={ref} style={fill && presentation
    ? { position: 'relative', width: '100%', height: '100%' }
    : { position: presentation ? 'relative' : undefined, width: vp.w, height: vp.h, maxWidth: '100%' }} />;
}

// ── 预览运行核（喂 manifest 而非拉 slug）：创作向导的「预览试玩」复用同一 RunOnly。
//    raw manifest → resolveArt（art: 选材，可选）→ parseManifest → RunOnly；解析失败出错误态不白屏。
export function ManifestPreview({ manifest, resolveArt, slug, vp = { w: 640, h: 400 } }: {
  manifest: unknown;
  resolveArt?: (raw: unknown) => unknown;
  /** Existing saved cartridge; unsaved previews have no local art index. */
  slug?: string;
  vp?: { w: number; h: number };
}) {
  const [parsed, setParsed] = React.useState<
    { phase: 'loading' } | { phase: 'running'; bp: WorldBlueprint; presentation?: CartPresentation; art?: CartArtSession } | { phase: 'error'; message: string }
  >({ phase: 'loading' });
  const [runError, setRunError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let dead = false;
    setParsed({ phase: 'loading' });
    setRunError(null);
    (async () => {
      try {
        const raw = resolveArt ? resolveArt(manifest) : manifest;
        const index = requireCartAssetIndex(raw, slug ?? 'preview', slug ? await fetchCartArtIndex(slug) : null);
        const result = parseManifestDetailed(raw, index ? { assetIndex: index, assetKeys: new Set(index.assets.map((a) => a.id)) } : {});
        assertCartMasksBound(result.blueprint);
        const presentation = resolveCartSkins(result.presentation, index);
        const art = await loadCartArt(index, result.blueprint.entities, result.presentation);
        if (dead) art?.dispose();
        else setParsed({ phase: 'running', bp: result.blueprint, presentation, art });
      } catch (e: unknown) {
        if (!dead) setParsed({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { dead = true; };
  }, [manifest, resolveArt, slug]);
  if (parsed.phase === 'loading') return <div style={{ padding: 24, color: SHELL.dim }}>正在装入预览…</div>;
  if (parsed.phase === 'error' || runError) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: SHELL.danger, fontSize: 13, lineHeight: 1.6 }}>
        预览无法加载：{parsed.phase === 'error' ? parsed.message : runError}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <RunOnly blueprint={parsed.bp} vp={vp} presentation={parsed.presentation} art={parsed.art} onError={setRunError} />
    </div>
  );
}

type RunState =
  | { phase: 'loading' }
  | { phase: 'running'; bp: WorldBlueprint; presentation?: CartPresentation; art?: CartArtSession }
  | { phase: 'error'; message: string };

// ── 数据卡带运行器：挂载即拉 manifest → resolveArt → parseManifest → 全屏纯运行。
//    操作条在架上（LibActionBar），此处只管「跑」；左上「← 返回架上」。──
export function DataCartridgeRunner({ slug, entry, api, resolveArt, onBack }: {
  slug: string;
  entry: GameEntry;
  api: string;
  /** manifest 原始 JSON → 过 art: 选材解析（launcher 注入·与 openInStudio 同一段）。缺省=原样。 */
  resolveArt?: (raw: unknown) => unknown;
  onBack: () => void;
}) {
  const [state, setState] = useState<RunState>({ phase: 'loading' });

  useEffect(() => {
    let dead = false;
    setState({ phase: 'loading' });
    (async () => {
      try {
        const res = await fetch(`${api}/api/library/${slug}/manifest`);
        if (!res.ok) throw new Error(`服务器未返回卡带 manifest（HTTP ${res.status}）——API(:3000) 是否在跑、卡带是否还在库里？`);
        const raw = await res.json();
        const manifest = resolveArt ? resolveArt(raw) : raw;
        const index = requireCartAssetIndex(manifest, slug, await fetchCartArtIndex(slug));
        const parsed = parseManifestDetailed(manifest, index ? { assetIndex: index, assetKeys: new Set(index.assets.map((a) => a.id)) } : {});
        assertCartMasksBound(parsed.blueprint);
        let bp = parsed.blueprint;
        if (entry.hasLogic) {
          // ── 执行侧闸门（engine-review-2026-08-04 §3.3 · owner 2026-08-05 拍板补）──────
          // 旧实现只看 `hasLogic`（= 盘上有 logic.ts）就直接 import 执行，而**授权旗
          // `allowTs` 压根没被传到运行时**（后端 library.py 明明发了，前端 metaToGameEntry
          // 漏映射）。等于「写」有闸（后端 features.tsCarts + 卡带打勾控制 PE 能不能写），
          // 「跑」没闸：任何方式落到 library/<slug>/ 的 logic.ts 都会被执行——旧卡带、
          // 手工塞的、外部拷来的卡带包，哪怕从未被打勾授权。
          // 现在改 fail-closed：**未授权一律不 import**。且刻意**不静默跳过**——静默跳过
          // 会让游戏少了逻辑却看不出来（又一个 fail-silent），必须明确报出来让人处理。
          if (!entry.allowTs) {
            throw new Error(
              '此卡带盘上有 logic.ts，但未获 TS 例外授权（需后端 features.tsCarts 开启 + 卡带 meta.allowTs 打勾）'
              + '——已拒绝装载它的 TS 逻辑。请在创作台给这张卡带打勾授权，或删除 logic.ts。',
            );
          }
          // TS 例外卡带（owner 07-11 拍板·记债）：logic.ts 经 vite 管线动态装载成附加 capability
          // 与数据蓝图合体。只在 dev 线可跑（静态包无 vite transform）；装不上=明报不白屏。
          // ⚠ 已知边界（不夸大）：ESM 动态 import 一旦发生，模块顶层代码就已执行，
          // 「先查契约再执行」对 ESM 本身做不到（要沙箱/静态分析，超出本次范围）。
          // 故**真正的安全边界是上面那道授权闸**，下面的契约检查只用于「装上来的东西形状对不对」。
          try {
            const mod = (await import(/* @vite-ignore */ `/library/${slug}/logic.ts?v=${Date.now()}`)) as {
              cartCapability?: WorldBlueprint['capabilities'][number];
            };
            const cap = mod.cartCapability;
            if (!cap || typeof cap.id !== 'string' || !Array.isArray(cap.systems)) {
              throw new Error('logic.ts 未导出合契约的 cartCapability');
            }
            bp = { ...bp, capabilities: [...bp.capabilities, cap] };
          } catch (e: unknown) {
            const m = e instanceof Error ? e.message : String(e);
            throw new Error(`TS 逻辑装载失败（此卡带是 TS 例外·logic.ts）：${m}——仅 dev 线（vite）可跑；可回创作台让「程序」修，或撤除 TS 逻辑。`);
          }
        }
        const presentation = resolveCartSkins(parsed.presentation, index);
        const art = await loadCartArt(index, bp.entities, parsed.presentation);
        if (dead) art?.dispose();
        else setState({ phase: 'running', bp, presentation, art });
      } catch (e: unknown) {
        if (!dead) setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { dead = true; };
  }, [api, slug, resolveArt, entry.hasLogic, entry.allowTs]);
  // RunOnly 装载/首帧崩溃 → 同一错误态（原因明文，不再静默白屏）。
  const onRunError = useCallback((message: string) => setState({ phase: 'error', message }), []);

  return (
    <div style={{
      position: 'absolute', inset: 0, background: SHELL.bg0, color: SHELL.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: SHELL.fontUi,
    }}>
      {state.phase === 'loading' && (
        <div style={{ textAlign: 'center', color: SHELL.dim, fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{entry.icon}</div>
          正在装入「{entry.title}」…
        </div>
      )}
      {state.phase === 'error' && (
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <div style={{ color: SHELL.danger, fontSize: 14, marginBottom: 8 }}>卡带装入失败</div>
          <div style={{ color: SHELL.sub, fontSize: 13, lineHeight: 1.6 }}>{state.message}</div>
          <div style={{ color: SHELL.dim, fontSize: 12, lineHeight: 1.7, marginTop: 12 }}>
            多为 AI 改稿引入——回创作台在「程序」对话里粘贴上面的错误让它修复；
            或在「版本历史」回滚到上一个能跑的版本。
          </div>
        </div>
      )}
      {state.phase === 'running' && <RunOnly blueprint={state.bp} presentation={state.presentation} art={state.art} fill onError={onRunError} />}
      <button onClick={onBack} style={backBtnStyle}>← 返回架上</button>
    </div>
  );
}

const backBtnStyle: React.CSSProperties = {
  position: 'absolute', top: 14, left: 14, zIndex: 210,
  padding: '7px 14px', borderRadius: 8,
  background: 'rgba(255,255,255,0.06)', border: `1px solid ${SHELL.line}`,
  color: SHELL.sub, fontSize: 13, cursor: 'pointer', outline: 'none',
  fontFamily: SHELL.fontUi,
};

function opBtn(primary: boolean, accent: string = SHELL.jade): React.CSSProperties {
  return {
    padding: primary ? '11px 30px' : '9px 18px',
    borderRadius: 9,
    background: primary ? `linear-gradient(135deg, ${accent}, ${accent}cc)` : 'rgba(255,255,255,0.05)',
    color: primary ? '#0f172a' : SHELL.sub,
    border: primary ? 'none' : `1px solid ${SHELL.line}`,
    fontSize: primary ? 15 : 13,
    fontWeight: primary ? 700 : 600,
    letterSpacing: 0.5,
    cursor: 'pointer',
    outline: 'none',
    fontFamily: SHELL.fontUi,
    boxShadow: primary ? `0 4px 20px ${accent}44` : 'none',
  };
}
