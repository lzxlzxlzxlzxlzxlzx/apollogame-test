import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PROFILE,
  type NormalizationProfile,
  type ImportFile,
  type ImageInfo,
  type PlanRow,
  planImport,
  planEntries,
  sniffImage,
  fnv1a,
  gridDims,
  gridCells,
  sheetSpec,
  atlasFrames,
  LIBRARY_TAXONOMY,
  type AssetIndexEntry,
} from '@assets/index.js';
import { SHELL, sBtn, sInput, sSelect, sChip, sLabel } from '../ui/shell-theme.js';

// ═══════════════════════════════════════════════════════════════
//  资产导入向导 —— 资源库的「数据导入器」面。四步：
//   ① 放入文件 → ② 模式与归一化（散图/精灵表/乱目录） → ③ 预览映射表 → ④ 提交写库
//  判定逻辑全在纯核心（@assets/import/*，已单测）；本组件只做交互/预览/写盘调用。
//  写盘 = POST zerocraft.py /api/assets/import（文件落 assets/<type>/<分类>/ + index.json 增量）。
// ═══════════════════════════════════════════════════════════════

const API = 'http://localhost:4000';

// 抠图去背 → 真 alpha（REQ-ASSET-导入抠图·PA 能力 /api/assets/matte）：逐图过端点，用抠好的图替换入库负载，
// provenance 记 matte 步（M2.5 人审可见来源）。任一图失败即整批中止（绝不静默把没抠的原图入库）。导出供单测。
export async function matteImportFiles(
  files: ReadonlyArray<{ path: string; dataBase64: string }>,
  entries: ReadonlyArray<AssetIndexEntry>,
  mode: 'flood' | 'rembg',
  apiBase: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ files: Array<{ path: string; dataBase64: string }>; entries: AssetIndexEntry[] }> {
  const outFiles = files.map((f) => ({ ...f }));
  const outEntries = entries.map((e) => ({ ...e }));
  for (let i = 0; i < outFiles.length; i++) {
    onProgress?.(i + 1, outFiles.length);
    const mr = await fetch(`${apiBase}/api/assets/matte`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataBase64: outFiles[i].dataBase64, mode }),
    }).then((r) => r.json() as Promise<{ success?: boolean; dataBase64?: string; provenance?: unknown; error?: string }>);
    if (!mr.success || !mr.dataBase64) throw new Error(`抠图失败（${outFiles[i].path}）：${mr.error ?? '未知'}`);
    outFiles[i].dataBase64 = mr.dataBase64;
    if (outEntries[i]) {
      const prov = (outEntries[i].provenance ?? {}) as Record<string, unknown>;
      outEntries[i] = { ...outEntries[i], provenance: { ...prov, matte: { mode, ...(mr.provenance && typeof mr.provenance === 'object' ? mr.provenance as Record<string, unknown> : {}) } } };
    }
  }
  return { files: outFiles, entries: outEntries };
}

type Mode = 'loose' | 'sheet' | 'rename';
type Step = 1 | 2 | 3 | 4;

interface LoadedFile {
  readonly name: string;
  readonly size: number;
  readonly bytes: Uint8Array;
  readonly hash: string;
  readonly info?: ImageInfo;
  readonly url: string; // objectURL 预览
}

function toImportFile(f: LoadedFile): ImportFile {
  return { name: f.name, size: f.size, hash: f.hash, info: f.info };
}

function b64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

const TEXTURE_CATS = LIBRARY_TAXONOMY.find((t) => t.type === 'texture')!.categories;

// ── 主组件 ──

export function AssetImportWizard({
  existingIds,
  onClose,
  onCommitted,
}: {
  existingIds: ReadonlySet<string>;
  onClose: () => void;
  onCommitted: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>('loose');
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // 散图/乱目录归一化配置
  const [category, setCategory] = useState('misc');
  const [tagsText, setTagsText] = useState('');
  const [dupPolicy, setDupPolicy] = useState<'skip' | 'keep'>('skip');
  const [conflictPolicy, setConflictPolicy] = useState<'suffix' | 'skip'>('suffix');
  const [rulesText, setRulesText] = useState(''); // 每行 "关键词=分类"

  // 精灵表配置
  const [cellW, setCellW] = useState(32);
  const [cellH, setCellH] = useState(32);
  const [offX, setOffX] = useState(0);
  const [offY, setOffY] = useState(0);
  const [spcX, setSpcX] = useState(0);
  const [spcY, setSpcY] = useState(0);
  const [product, setProduct] = useState<'sheet' | 'atlas'>('sheet');
  const [template, setTemplate] = useState('frame_{n}');
  const [sheetId, setSheetId] = useState('');
  const [dropEmpty, setDropEmpty] = useState(true);
  const [emptyCells, setEmptyCells] = useState<ReadonlySet<number>>(new Set());

  // 步骤③ 行级改写：rowIndex → 改写 id / 强制跳过
  const [overrides, setOverrides] = useState<Map<number, { id?: string; skip?: boolean }>>(new Map());
  // 步骤④
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // 入库主动扫描标注（Claude 视觉 → tags 写回索引；失败不阻塞导入本身）
  const [autotag, setAutotag] = useState(true);
  const [tagMsg, setTagMsg] = useState<string | null>(null);
  // 抠图去背 → 真 alpha（REQ-ASSET-导入抠图·owner 07-16「用 rembg」·PA 能力 /api/assets/matte）：
  // 开则导入前逐图过抠图端点、用抠好的真 alpha 图入库（flood 漫填快 / rembg AI 兜底）。sheet 模式不适用。
  const [matteOn, setMatteOn] = useState(false);
  const [matteMode, setMatteMode] = useState<'flood' | 'rembg'>('flood');
  const [matteMsg, setMatteMsg] = useState<string | null>(null);

  // ── 文件加载 ──
  const addFiles = useCallback(async (list: FileList | File[]) => {
    const loaded: LoadedFile[] = [];
    for (const file of Array.from(list)) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      loaded.push({
        name: rel,
        size: file.size,
        bytes: buf,
        hash: fnv1a(buf),
        info: sniffImage(buf),
        url: URL.createObjectURL(file),
      });
    }
    setFiles((prev) => [...prev, ...loaded]);
  }, []);

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []);

  // ── profile（数据！可复放）──
  const profile: NormalizationProfile = useMemo(
    () => ({
      ...DEFAULT_PROFILE,
      category,
      duplicatePolicy: dupPolicy,
      conflictPolicy,
      defaultTags: tagsText.split(/[,\s]+/).filter(Boolean),
      categoryRules: rulesText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return { match: l.slice(0, i).trim(), category: l.slice(i + 1).trim() };
        })
        .filter((r) => r.match && r.category),
    }),
    [category, dupPolicy, conflictPolicy, tagsText, rulesText],
  );

  const plan = useMemo(
    () => (mode === 'sheet' ? null : planImport(files.map(toImportFile), profile, existingIds)),
    [mode, files, profile, existingIds],
  );

  // ── 精灵表：选第一张已嗅探出尺寸的图 ──
  const sheetFile = useMemo(() => files.find((f) => f.info), [files]);
  const grid = useMemo(
    () =>
      sheetFile?.info
        ? { sheetW: sheetFile.info.width, sheetH: sheetFile.info.height, cellW, cellH, offsetX: offX, offsetY: offY, spacingX: spcX, spacingY: spcY }
        : null,
    [sheetFile, cellW, cellH, offX, offY, spcX, spcY],
  );

  useEffect(() => {
    if (sheetFile && !sheetId) {
      const stem = sheetFile.name.split(/[\\/]/).pop()!.replace(/\.[a-z0-9]+$/i, '');
      setSheetId(`texture/sheet/${stem.toLowerCase().replace(/[^a-z0-9._-]+/g, '_')}`);
      setTemplate(`${stem.toLowerCase().replace(/[^a-z0-9._-]+/g, '_')}_{n}`);
    }
  }, [sheetFile, sheetId]);

  // 空白格检测（像素层，canvas）—— 纯核心的 keep 参数由这里产出。
  useEffect(() => {
    if (!grid || !sheetFile) return;
    const cells = gridCells(grid);
    if (cells.length === 0 || cells.length > 4096) {
      setEmptyCells(new Set());
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const cv = document.createElement('canvas');
      cv.width = grid.sheetW;
      cv.height = grid.sheetH;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const empties = new Set<number>();
      cells.forEach((c, i) => {
        const data = ctx.getImageData(c.x, c.y, c.w, c.h).data;
        let blank = true;
        for (let p = 3; p < data.length; p += 4) {
          if (data[p] !== 0) {
            blank = false;
            break;
          }
        }
        if (blank) empties.add(i);
      });
      if (!cancelled) setEmptyCells(empties);
    };
    img.src = sheetFile.url;
    return () => {
      cancelled = true;
    };
  }, [grid, sheetFile]);

  // 预览画布：原图 + 网格叠加（空白格压暗）。
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (mode !== 'sheet' || step !== 2 || !grid || !sheetFile || !canvasRef.current) return;
    const cv = canvasRef.current;
    const scale = Math.min(1, 560 / grid.sheetW, 420 / grid.sheetH);
    cv.width = Math.round(grid.sheetW * scale);
    cv.height = Math.round(grid.sheetH * scale);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const cells = gridCells(grid);
      cells.forEach((c, i) => {
        const x = c.x * scale;
        const y = c.y * scale;
        const w = c.w * scale;
        const h = c.h * scale;
        if (emptyCells.has(i)) {
          ctx.fillStyle = 'rgba(6,8,13,0.65)';
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeStyle = 'rgba(156,210,197,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      });
    };
    img.src = sheetFile.url;
  }, [mode, step, grid, sheetFile, emptyCells]);

  // ── 步骤③ 的有效行（应用行级改写）──
  const effectiveRows = useMemo(() => {
    if (!plan) return [];
    return plan.rows.map((r, i) => {
      const ov = overrides.get(i);
      if (!ov) return r;
      let row: PlanRow = r;
      if (ov.skip) row = { ...row, action: 'skip-conflict', reason: '人工跳过' };
      else if (ov.id && ov.id !== r.id) {
        const tail = ov.id.split('/').pop()!;
        const ext = r.targetPath.split('.').pop()!;
        row = { ...row, id: ov.id, targetPath: `assets/${profile.type}/${r.category}/${tail}.${ext}`, reason: '人工改写 id' };
      }
      return row;
    });
  }, [plan, overrides, profile.type]);

  // ── 提交 ──
  const commit = useCallback(async () => {
    setCommitting(true);
    setResult(null);
    try {
      let payloadFiles: Array<{ path: string; dataBase64: string }> = [];
      let entries: AssetIndexEntry[] = [];

      if (mode === 'sheet') {
        if (!sheetFile?.info || !grid) throw new Error('没有可用的精灵表（需先放入一张能侦测尺寸的图）');
        const ext = sheetFile.info.format === 'jpeg' ? 'jpg' : sheetFile.info.format;
        const path = `assets/texture/sheet/${sheetId.split('/').pop()}.${ext}`;
        const keep = dropEmpty
          ? gridCells(grid).map((_, i) => i).filter((i) => !emptyCells.has(i))
          : undefined;
        const spec: Record<string, unknown> = {
          width: grid.sheetW,
          height: grid.sheetH,
          format: ext,
          ...(product === 'sheet'
            ? { sheet: sheetSpec(grid, keep ? keep.length : undefined) }
            : { frames: atlasFrames(grid, template, keep) }),
        };
        payloadFiles = [{ path, dataBase64: b64(sheetFile.bytes) }];
        entries = [{
          id: sheetId,
          type: 'texture',
          description: `精灵表 ${sheetFile.name}（${gridDims(grid).cols}×${gridDims(grid).rows} 格）`,
          status: 'filled',
          path: path.replace(/^assets\//, ''),
          spec,
          category: 'sheet',
          tags: ['sheet', ...(product === 'atlas' ? ['atlas'] : [])],
          source: 'import',
          provenance: { method: 'import-sheet', originalFile: sheetFile.name, hash: sheetFile.hash },
        }];
      } else {
        const rows = effectiveRows.filter((r) => r.action === 'import' || r.action === 'rename');
        const byName = new Map(files.map((f) => [f.name, f]));
        payloadFiles = rows.map((r) => ({ path: r.targetPath, dataBase64: b64(byName.get(r.file.name)!.bytes) }));
        const fakePlan = { rows, counts: { import: 0, rename: 0, 'skip-duplicate': 0, 'skip-conflict': 0, 'skip-unsupported': 0 } } as const;
        entries = planEntries(fakePlan, profile, { method: mode === 'rename' ? 'import-rename' : 'import-loose' });
      }

      if (entries.length === 0) throw new Error('没有可导入的条目');

      // 抠图去背 → 真 alpha（REQ-ASSET·PA 能力）：逐图过 /api/assets/matte，用抠好的图入库；
      // 任一失败即中止（绝不静默把没抠的原图入库）。provenance 记 matte 步（M2.5 人审可见来源）。sheet 不适用。
      if (matteOn && mode !== 'sheet' && payloadFiles.length > 0) {
        const m = await matteImportFiles(payloadFiles, entries, matteMode, API, (i, n) => setMatteMsg(`🎯 抠图去背 ${i}/${n}（${matteMode}）…`));
        payloadFiles = m.files; entries = m.entries;
        setMatteMsg(null);
      }

      const res = await fetch(`${API}/api/assets/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payloadFiles, entries }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; written?: number; indexAdded?: number };
      if (!data.success) throw new Error(data.error ?? '未知错误');
      setResult({ ok: true, msg: `已写入 ${data.written} 个文件，索引新增 ${data.indexAdded} 条。` });
      onCommitted();

      // 入库主动扫描标注：写库成功后逐张过 Claude 视觉，tags 合并回索引（异步，失败可重试不影响导入）。
      if (autotag && entries.length > 0) {
        setTagMsg('✨ 自动扫描标注中…');
        try {
          const tagRes = await fetch(`${API}/api/assets/autotag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: entries.map((e) => ({ id: e.id, path: `assets/${e.path}` })) }),
          });
          const tagData = (await tagRes.json()) as { success?: boolean; error?: string; tagged?: number; results?: Array<{ id: string; tags?: string[]; error?: string }> };
          if (!tagData.success) throw new Error(tagData.error ?? '未知错误');
          const failed = (tagData.results ?? []).filter((r) => r.error).length;
          const sample = (tagData.results ?? []).find((r) => r.tags?.length);
          setTagMsg(`✨ 已标注 ${tagData.tagged}/${entries.length} 张${failed ? `（${failed} 张失败，可重试）` : ''}${sample ? ` · 如 ${sample.id.split('/').pop()}: ${sample.tags!.slice(0, 5).join(' ')}` : ''}`);
          onCommitted(); // tags 写回了索引 → 再刷一次资源库
        } catch (te) {
          setTagMsg(`自动标注未完成：${te instanceof Error ? te.message : String(te)}（导入不受影响，可稍后重试）`);
        }
      }
    } catch (e) {
      setResult({ ok: false, msg: `提交失败：${e instanceof Error ? e.message : String(e)}（需 python3 zerocraft.py 起 API）` });
    } finally {
      setCommitting(false);
    }
  }, [mode, sheetFile, grid, sheetId, product, template, dropEmpty, emptyCells, effectiveRows, files, profile, onCommitted, autotag, matteOn, matteMode]);

  // ── 渲染 ──
  const stepDot = (n: Step, label: string) => {
    const done = step > n;
    const cur = step === n;
    return (
      <span key={n} style={{ display: 'flex', alignItems: 'center', gap: 7, color: cur ? SHELL.jade : done ? SHELL.sub : SHELL.dim, fontSize: 12 }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
          background: cur ? SHELL.jadeWash : done ? SHELL.okWash : SHELL.bg2,
          border: `1px solid ${cur ? SHELL.jadeLine : done ? SHELL.ok : SHELL.line}`,
        }}>{done ? '✓' : n}</span>
        {label}
        {n < 4 && <span style={{ color: SHELL.faint, margin: '0 10px' }}>→</span>}
      </span>
    );
  };

  const importableCount = mode === 'sheet'
    ? (sheetFile ? 1 : 0)
    : effectiveRows.filter((r) => r.action === 'import' || r.action === 'rename').length;

  return (
    <div style={{ position: 'absolute', inset: 0, background: SHELL.appBg, color: SHELL.text, display: 'flex', flexDirection: 'column', fontFamily: SHELL.fontUi }}>
      {/* 标题 + 步骤条 */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${SHELL.line}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: SHELL.violet }}>📥 导入资产</span>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {stepDot(1, '放入文件')}
          {stepDot(2, '模式与归一化')}
          {stepDot(3, '预览映射')}
          {stepDot(4, '提交写库')}
        </div>
        <button onClick={onClose} style={{ ...sBtn('quiet'), marginLeft: 'auto' }}>✕ 关闭</button>
      </div>

      {/* 主体 */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {step === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
              style={{
                width: 'min(640px, 90%)', padding: '48px 24px', textAlign: 'center', borderRadius: 14,
                border: `1.5px dashed ${dragOver ? SHELL.jade : SHELL.lineStrong}`,
                background: dragOver ? SHELL.jadeWash : SHELL.bg1, transition: 'all .15s',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 10 }}>🖼</div>
              <div style={{ fontSize: 14, color: SHELL.text, marginBottom: 6 }}>把 2D 贴图拖到这里</div>
              <div style={{ fontSize: 12, color: SHELL.dim, marginBottom: 18 }}>png / jpg / webp / gif · 散图、整张精灵表、整个乱目录都可以</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <label style={sBtn('primary')}>
                  选择文件
                  <input type="file" multiple accept="image/*" style={{ display: 'none' }}
                    onChange={(e) => e.target.files && void addFiles(e.target.files)} />
                </label>
                <label style={sBtn('ghost')}>
                  选择整个目录
                  <input type="file" style={{ display: 'none' }} {...({ webkitdirectory: '' } as object)}
                    onChange={(e) => e.target.files && void addFiles(e.target.files)} />
                </label>
              </div>
            </div>
            {files.length > 0 && (
              <div style={{ width: 'min(640px, 90%)' }}>
                <div style={{ ...sLabel, marginBottom: 8 }}>已放入 {files.length} 个文件</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflow: 'auto' }}>
                  {files.map((f, i) => (
                    <span key={i} style={{ ...sChip(false), display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'default' }}>
                      <img src={f.url} alt="" width={16} height={16} style={{ imageRendering: 'pixelated', borderRadius: 2 }} />
                      {f.name.split(/[\\/]/).pop()}
                      <span style={{ color: SHELL.faint }}>{f.info ? `${f.info.width}×${f.info.height}` : '?'}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <>
            {/* 模式选择（不带数字——曾与步骤条①②③撞语义，用户把模式卡当"下一步"点，
                落在精灵表模式后批量文件被静默只取第一张） */}
            <div style={{ display: 'flex', gap: 8, padding: '14px 20px 0' }}>
              {([
                ['loose', '🖼 散图批量', '多张独立图片入库：变体分组 · 重复剔除 · 批量命名'],
                ['sheet', '✂️ 精灵表切割', '一张大图切成多帧（只处理第一张图）'],
                ['rename', '🗂 乱目录归一', '散图批量 + 关键词→分类规则 · 冲突检查'],
              ] as const).map(([m, title, desc]) => (
                <div key={m} onClick={() => setMode(m)} style={{
                  flex: 1, padding: '10px 14px', borderRadius: 9, cursor: 'pointer',
                  border: `1px solid ${mode === m ? SHELL.jadeLine : SHELL.line}`,
                  background: mode === m ? SHELL.jadeWash : SHELL.bg1,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: mode === m ? SHELL.jade : SHELL.sub }}>{title}</div>
                  <div style={{ fontSize: 11, color: SHELL.dim, marginTop: 2 }}>{desc}</div>
                </div>
              ))}
            </div>

            {mode === 'sheet' ? (
              <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                  {sheetFile ? (
                    <canvas ref={canvasRef} style={{ borderRadius: 6, border: `1px solid ${SHELL.lineStrong}`, maxWidth: '100%' }} />
                  ) : (
                    <div style={{ color: SHELL.dim, fontSize: 13 }}>第一步还没放入能侦测尺寸的图片</div>
                  )}
                </div>
                <div style={{ width: 320, flex: 'none', borderLeft: `1px solid ${SHELL.line}`, background: SHELL.bg1, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
                  {files.length > 1 && (
                    <div style={{ color: SHELL.warn, fontSize: 12, lineHeight: 1.5, padding: '8px 10px', background: SHELL.warnWash, borderRadius: 6 }}>
                      ⚠ 已放入 {files.length} 个文件，本模式<b>只切割第一张</b>，其余 {files.length - 1} 张不会入库——多张独立图片请用「散图批量」。
                    </div>
                  )}
                  {sheetFile?.info && (
                    <div style={{ color: SHELL.dim, fontSize: 11 }}>
                      {sheetFile.name.split(/[\\/]/).pop()} · {sheetFile.info.width}×{sheetFile.info.height} · {sheetFile.info.format}
                      {grid && <> · 网格 {gridDims(grid).cols}×{gridDims(grid).rows}，空白 {emptyCells.size} 格</>}
                    </div>
                  )}
                  {([
                    ['单元宽×高', cellW, setCellW, cellH, setCellH],
                    ['起点偏移', offX, setOffX, offY, setOffY],
                    ['间距', spcX, setSpcX, spcY, setSpcY],
                  ] as const).map(([label, va, sa, vb, sb]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 88, color: SHELL.dim }}>{label}</span>
                      <input type="number" value={va} onChange={(e) => sa(Math.max(0, +e.target.value || 0))} style={{ ...sInput(), width: 70 }} />
                      <input type="number" value={vb} onChange={(e) => sb(Math.max(0, +e.target.value || 0))} style={{ ...sInput(), width: 70 }} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 88, color: SHELL.dim }}>切割产物</span>
                    <select value={product} onChange={(e) => setProduct(e.target.value as 'sheet' | 'atlas')} style={{ ...sSelect(), flex: 1 }}>
                      <option value="sheet">sprite-sheet（按索引取帧）</option>
                      <option value="atlas">atlas 命名帧（按名字取帧）</option>
                    </select>
                  </div>
                  {product === 'atlas' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 88, color: SHELL.dim }}>帧名模板</span>
                      <input value={template} onChange={(e) => setTemplate(e.target.value)} style={{ ...sInput(), flex: 1, fontFamily: SHELL.fontMono }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 88, color: SHELL.dim }}>目标 id</span>
                    <input value={sheetId} onChange={(e) => setSheetId(e.target.value)} style={{ ...sInput(), flex: 1, fontFamily: SHELL.fontMono }} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: SHELL.sub, cursor: 'pointer' }}>
                    <input type="checkbox" checked={dropEmpty} onChange={(e) => setDropEmpty(e.target.checked)} />
                    剔除全透明空白格（侦测到 {emptyCells.size} 格）
                  </label>
                  <div style={{ color: SHELL.dim, fontSize: 11, lineHeight: 1.6, marginTop: 'auto' }}>
                    网格线实时叠加在原图上，空白格压暗。产物落回 AssetIndex 既有契约
                    （spec.sheet / spec.frames），渲染端零新概念。
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 110, color: SHELL.dim }}>目标分类</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...sSelect(), width: 220 }}>
                    {TEXTURE_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}（{c.id}）</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 110, color: SHELL.dim }}>默认 tags</span>
                  <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="空格/逗号分隔，如 hero walk" style={{ ...sInput(), flex: 1 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 110, color: SHELL.dim }}>同内容重复</span>
                  <select value={dupPolicy} onChange={(e) => setDupPolicy(e.target.value as 'skip' | 'keep')} style={sSelect()}>
                    <option value="skip">跳过（推荐，防浏览器重复下载）</option>
                    <option value="keep">仍然导入</option>
                  </select>
                  <span style={{ width: 80, color: SHELL.dim, textAlign: 'right' }}>id 冲突</span>
                  <select value={conflictPolicy} onChange={(e) => setConflictPolicy(e.target.value as 'suffix' | 'skip')} style={sSelect()}>
                    <option value="suffix">自动加后缀 _2…</option>
                    <option value="skip">跳过该文件</option>
                  </select>
                </div>
                {mode === 'rename' && (
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 110, color: SHELL.dim, paddingTop: 6 }}>分类规则</span>
                    <div style={{ flex: 1 }}>
                      <textarea
                        value={rulesText}
                        onChange={(e) => setRulesText(e.target.value)}
                        placeholder={'每行一条「路径关键词=分类」，自上而下首个命中生效：\nbg/=background\nicon=icon.item\nportrait=portrait'}
                        rows={5}
                        style={{ ...sInput(), width: '100%', fontFamily: SHELL.fontMono, resize: 'vertical' }}
                      />
                      <div style={{ color: SHELL.dim, fontSize: 11, marginTop: 4 }}>
                        规则 + 下方策略 = 一份可复放的归一化 profile（数据）；同一批文件同一份 profile 永远得到同一份映射。
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <div style={{ padding: '8px 20px', overflow: 'auto' }}>
            {mode === 'sheet' ? (
              grid && sheetFile ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '8px 10px', color: SHELL.dim }}>原始文件</td>
                      <td style={{ fontFamily: SHELL.fontMono }}>{sheetFile.name}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 10px', color: SHELL.dim }}>归一化 id</td>
                      <td style={{ fontFamily: SHELL.fontMono, color: SHELL.jade }}>{sheetId}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 10px', color: SHELL.dim }}>切割</td>
                      <td>
                        {gridDims(grid).cols}×{gridDims(grid).rows} 格 · {product === 'sheet' ? 'sprite-sheet' : `atlas（${template}）`}
                        {dropEmpty && ` · 剔除空白 ${emptyCells.size} 格`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div style={{ color: SHELL.warn, fontSize: 13, padding: 20 }}>没有可用的精灵表，请回第一步放入图片。</div>
              )
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['', '原始文件', '归一化 id（可改写）', '规格', '处置 / 理由'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', color: SHELL.dim, fontWeight: 500, padding: '6px 10px', borderBottom: `1px solid ${SHELL.line}`, fontSize: 11, position: 'sticky', top: 0, background: SHELL.bg0 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {effectiveRows.map((r, i) => {
                    const skipped = r.action.startsWith('skip');
                    const file = files.find((f) => f.name === r.file.name);
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)`, opacity: skipped ? 0.55 : 1 }}>
                        <td style={{ padding: '5px 10px', width: 28 }}>
                          {file && <img src={file.url} alt="" width={20} height={20} style={{ imageRendering: 'pixelated', borderRadius: 3 }} />}
                        </td>
                        <td style={{ padding: '5px 10px', fontFamily: SHELL.fontMono, color: SHELL.sub }}>{r.file.name}</td>
                        <td style={{ padding: '5px 10px' }}>
                          {skipped ? (
                            <span style={{ color: SHELL.faint }}>—</span>
                          ) : (
                            <input
                              value={r.id}
                              onChange={(e) => setOverrides((m) => new Map(m).set(i, { ...m.get(i), id: e.target.value }))}
                              style={{ ...sInput(), width: '100%', fontFamily: SHELL.fontMono, color: r.action === 'rename' || r.transliterated ? SHELL.warn : SHELL.jade, padding: '3px 8px' }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '5px 10px', color: SHELL.dim, whiteSpace: 'nowrap' }}>
                          {r.file.info ? `${r.file.info.width}×${r.file.info.height} ${r.file.info.format}${r.file.info.alpha ? ' 透明' : ''}` : '未侦测'}
                        </td>
                        <td style={{ padding: '5px 10px' }}>
                          <span style={{
                            fontSize: 10, padding: '1px 7px', borderRadius: 8, marginRight: 6, whiteSpace: 'nowrap',
                            background: skipped ? 'rgba(154,170,196,0.10)' : r.action === 'rename' || r.transliterated ? SHELL.warnWash : SHELL.okWash,
                            color: skipped ? SHELL.dim : r.action === 'rename' || r.transliterated ? SHELL.warn : SHELL.ok,
                          }}>
                            {r.action === 'import' ? '导入' : r.action === 'rename' ? '改名导入' : r.action === 'skip-duplicate' ? '跳过·重复' : r.action === 'skip-conflict' ? '跳过' : '跳过·不支持'}
                          </span>
                          <span style={{ color: SHELL.dim, fontSize: 11 }}>{r.reason}</span>
                          {!skipped && (
                            <button onClick={() => setOverrides((m) => new Map(m).set(i, { skip: true }))} style={{ ...sBtn('quiet'), padding: '1px 7px', fontSize: 10, marginLeft: 6 }}>跳过</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {step === 4 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
            {!result && !committing && (
              <>
                <div style={{ fontSize: 14 }}>将写入 <b style={{ color: SHELL.gold }}>{importableCount}</b> 个资产到 <span style={{ fontFamily: SHELL.fontMono, color: SHELL.jade }}>assets/</span> 并更新 index.json</div>
                <div style={{ color: SHELL.dim, fontSize: 12 }}>写盘经 zerocraft.py API（限定 assets/ 子树）· 条目带来源溯源 provenance · 可在资源库立即看到</div>
                <div style={{ color: SHELL.dim, fontSize: 12 }}>颜色/明暗/体量等<b style={{ color: SHELL.sub }}>事实标签</b>由本地像素扫描自动打（免费·确定性·必跑）</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: SHELL.sub, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={autotag} onChange={(e) => setAutotag(e.target.checked)} />
                  ✨ 追加语义标注（Claude 视觉认主体，约 $0.003/张；需 .env 配 ANTHROPIC_API_KEY）
                </label>
                {mode !== 'sheet' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: SHELL.sub, fontSize: 12, cursor: 'pointer', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <input type="checkbox" checked={matteOn} onChange={(e) => setMatteOn(e.target.checked)} />
                    🎯 背景移除 → 真 alpha（抠图·导入前逐图处理）
                    {matteOn && (
                      <select value={matteMode} onChange={(e) => setMatteMode(e.target.value as 'flood' | 'rembg')} style={{ ...sSelect(), width: 280 }}>
                        <option value="flood">flood 漫填（快·确定性·纯色/干净底最佳）</option>
                        <option value="rembg">rembg AI（慢·复杂前景/杂底·需装 rembg）</option>
                      </select>
                    )}
                  </label>
                )}
                <button onClick={() => void commit()} style={{ ...sBtn('primary'), padding: '10px 28px', fontSize: 13 }}>提交写库 ✓</button>
              </>
            )}
            {committing && <div style={{ color: SHELL.sub }}>{matteMsg ?? '写入中…'}</div>}
            {result && (
              <>
                <div style={{ fontSize: 14, color: result.ok ? SHELL.ok : SHELL.danger }}>{result.ok ? '✓ 导入完成' : '✕ 导入失败'}</div>
                <div style={{ color: SHELL.sub, fontSize: 12, maxWidth: 560, textAlign: 'center' }}>{result.msg}</div>
                {tagMsg && <div style={{ color: tagMsg.startsWith('✨') ? SHELL.violet : SHELL.warn, fontSize: 12, maxWidth: 560, textAlign: 'center' }}>{tagMsg}</div>}
                {result.ok ? (
                  <button onClick={onClose} style={sBtn('primary')}>回到资源库</button>
                ) : (
                  <button onClick={() => setResult(null)} style={sBtn('ghost')}>重试</button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 底栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderTop: `1px solid ${SHELL.line}` }}>
        <span style={{ color: SHELL.sub, fontSize: 12, flex: 1 }}>
          {files.length} 文件
          {plan && mode !== 'sheet' && step >= 3 && (
            <> → <b style={{ color: SHELL.ok }}>{effectiveRows.filter((r) => r.action === 'import').length} 导入</b>
              · <b style={{ color: SHELL.warn }}>{effectiveRows.filter((r) => r.action === 'rename').length} 改名</b>
              · {effectiveRows.filter((r) => r.action.startsWith('skip')).length} 跳过</>
          )}
          {mode === 'sheet' && files.length > 1 && (
            <b style={{ color: SHELL.warn }}> → 精灵表模式只取第 1 张，{files.length - 1} 张未选用</b>
          )}
        </span>
        {step > 1 && step < 4 && <button onClick={() => setStep((s) => (s - 1) as Step)} style={sBtn('ghost')}>← 上一步</button>}
        {step < 4 && (
          <button
            onClick={() => setStep((s) => (s + 1) as Step)}
            disabled={files.length === 0}
            style={{ ...sBtn('primary'), opacity: files.length === 0 ? 0.4 : 1 }}
          >
            {step === 3 ? `去提交（${importableCount}）→` : '下一步 →'}
          </button>
        )}
      </div>
    </div>
  );
}
