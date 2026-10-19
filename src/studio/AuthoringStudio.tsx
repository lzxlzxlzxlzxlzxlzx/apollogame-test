import React, { useEffect, useState } from 'react';
import { authoringMaterialFromUpload, GAL_AUTHORING_STEPS, addAuthoringMaterial, attachAuthoringReference, authoringSteps, characterLibraryHref, emptyAuthoringSession, openAuthoringStep, reviewAuthoringStep, setAuthoringCast, submitAuthoringData,
  type AuthoringSession, type AuthoringStepId,
} from '../authoring/gal-authoring-flow.js';
import { runAuthoringChat } from '../authoring/gal-authoring-chat.js';
import { currentApprovedGalDraft, galDraftStatus } from '../authoring/gal-draft-review.js';
import { createAuthoringWork, installAuthoringSeed, readAuthoringWorks, saveAuthoringWork, writeAuthoringWorks, type AuthoringWork, type AuthoringWorkCatalog } from '../authoring/gal-authoring-works.js';
import { applyAuthoringImages, loadAuthoringImages, saveAuthoringImages } from '../authoring/gal-authoring-files.js';
import { manorEscapeAuthoringWork } from '../authoring/manor-escape-authoring.js';
import { STORY_BOX_H, STORY_BOX_W, layoutStoryGraph, storyGraphLabels, type StoryGraphPicture } from '../authoring/gal-story-graph-view.js';

const statusLabel: Record<string, string> = { approved: '已通过', draft: '待通过', locked: '还没到', stale: '待重挂' };
const WORKS_KEY = 'gal-authoring-works-v1';

function ensureAuthoringStyles(): void {
  if (typeof document === 'undefined') return;
  const style = document.getElementById('gal-authoring-studio') ?? document.createElement('style');
  style.id = 'gal-authoring-studio';
  style.textContent = `
    .gal-studio{height:100vh;display:grid;grid-template-rows:64px minmax(0,1fr);background:#e7edf2;color:#1c2430;font-family:"Microsoft YaHei",system-ui,sans-serif}
    .gal-studio *{box-sizing:border-box}
    .gal-studio button,.gal-studio input,.gal-studio textarea,.gal-studio select{font:inherit;color:inherit}
    .gal-studio button{cursor:pointer}
    .gal-studio header{display:flex;align-items:center;gap:16px;padding:0 20px;background:#142033;color:#f4f7fb}
    .gal-studio header h1{font-size:16px;font-weight:600;margin:0}
    .gal-studio header p{margin:0;color:#b7c3d4;font-size:12px}
    .gal-studio .spacer{flex:1}
    .gal-studio .ghost{border:1px solid #8ea0b8;background:transparent;color:#d5e2f2;border-radius:8px;height:34px;padding:0 12px}
    .gal-studio .ghost.dark{color:#243044;border-color:#c5d0dc;background:#fff}
    .gal-studio .primary{border:0;background:#2f6fed;color:#fff;border-radius:8px;height:34px;padding:0 14px}
    .gal-studio .primary:disabled,.gal-studio .ghost:disabled{opacity:.4;cursor:not-allowed}
    .gal-studio .body{display:grid;grid-template-columns:248px minmax(0,1fr) 360px;min-height:0}
    .gal-studio nav{background:#f7f9fb;border-right:1px solid #d5dee7;overflow:auto;padding:14px 10px}
    .gal-studio .step{width:100%;text-align:left;border:0;background:transparent;border-radius:10px;padding:8px 10px;display:grid;grid-template-columns:22px 1fr;gap:2px 8px;margin-bottom:4px}
    .gal-studio .step:hover{background:#e8eef5}.gal-studio .step.current{background:#e5efff}
    .gal-studio .step b{font-weight:600;font-size:14px}.gal-studio .step small{grid-column:2;color:#66788c;font-size:12px}
    .gal-studio .dot{width:18px;height:18px;border-radius:50%;margin-top:1px;display:grid;place-items:center;font-size:11px;color:#fff}
    .gal-studio .approved{background:#1f8a4c}.gal-studio .draft{background:#c47b12}.gal-studio .locked{background:#9aa8b8}.gal-studio .stale{background:#b42318}
    .gal-studio .artifact{display:grid;grid-template-rows:auto auto minmax(0,1fr);background:#f3f6f8;min-height:0}
    .gal-studio .crumb{display:flex;align-items:center;gap:10px;padding:14px 22px 0}
    .gal-studio .crumb h2{margin:0;font-size:22px}
    .gal-studio .badge{font-size:12px;border-radius:99px;padding:3px 8px;background:#e5eefc;color:#2452b0}
    .gal-studio .badge.approved{background:#e5f6ec;color:#146c3a}.gal-studio .badge.stale{background:#fdecec;color:#9f1d1d}.gal-studio .badge.locked{background:#eef1f4;color:#66788c}
    .gal-studio .refs{padding:8px 22px 0;color:#5c6d80;font-size:13px}
    .gal-studio .sheet{margin:14px 22px 22px;background:#fff;border:1px solid #d7e0e8;border-radius:14px;overflow:auto;padding:18px 20px}
    .gal-studio .sheet h3{margin:0 0 8px;font-size:15px}
    .gal-studio .sheet p,.gal-studio .sheet li{line-height:1.7;font-size:14px}
    .gal-studio .sheet textarea,.gal-studio .composer textarea{width:100%;border:1px solid #c9d5e2;border-radius:8px;padding:8px;background:#fff}
    .gal-studio .sheet textarea{min-height:280px}
    .gal-studio table{width:100%;border-collapse:collapse;font-size:13px}
    .gal-studio th,.gal-studio td{text-align:left;padding:8px 6px;border-bottom:1px solid #e6edf3;vertical-align:top}
    .gal-studio a.repo{color:#2452b0;font-weight:600}
    .gal-studio pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6}
    .gal-studio .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin:0 0 16px}
    .gal-studio .gallery figure{margin:0;background:#f7f9fb;border:1px solid #e1e8ef;border-radius:10px;overflow:hidden}
    .gal-studio .gallery img{display:block;width:100%;height:220px;object-fit:contain;background:#eef3f7}
    .gal-studio .gallery figcaption{padding:8px 10px;font-size:12px;line-height:1.45}
    .gal-studio .gallery small{display:block;color:#5c6d80}
    .gal-studio .story{display:block;width:100%;height:auto}
    .gal-studio .story text{font-size:12px;fill:#1c2430}
    .gal-studio .story .sub{font-size:11px;fill:#5c6d80}
    .gal-studio aside{border-left:1px solid #d5dee7;background:#f7f9fb;display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0}
    .gal-studio .tabs{display:flex;gap:6px;padding:12px}
    .gal-studio .tabs button{flex:1;height:34px;border-radius:8px;border:1px solid #d0dae4;background:#fff}
    .gal-studio .tabs button.on{background:#142033;color:#fff;border-color:#142033}
    .gal-studio .pane{min-height:0;display:grid;grid-template-rows:minmax(0,1fr) auto}
    .gal-studio .list{overflow:auto;padding:0 12px 12px;display:flex;flex-direction:column;gap:8px}
    .gal-studio .card{background:#fff;border:1px solid #d7e0e8;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.55}
    .gal-studio .card.user{background:#e5efff;border-color:#c5d7f5}
    .gal-studio .card b{display:block;margin-bottom:2px}
    .gal-studio .card p{margin:0;white-space:pre-wrap}
    .gal-studio .card img{display:block;max-width:100%;margin-top:6px;border-radius:8px}
    .gal-studio .composer{padding:12px;display:grid;gap:8px;border-top:1px solid #e1e8ef;background:#f7f9fb}
    .gal-studio .composer textarea{min-height:88px;resize:vertical}
    .gal-studio .fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .gal-studio .fields input,.gal-studio .fields select,.gal-studio .composer input{height:34px;border:1px solid #c9d5e2;border-radius:8px;padding:0 8px;background:#fff}
    .gal-studio .alert{margin:8px 22px 0;color:#9f1d1d;font-size:13px}
    .gal-studio .picker{padding:28px clamp(16px,4vw,56px) 48px;overflow:auto}
    .gal-studio .picker h2{margin:18px 0 8px;font-size:28px}
    .gal-studio .works{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:16px}
    .gal-studio .work{text-align:left;padding:16px;border-radius:12px;border:1px solid #d7e0e8;background:#fff;cursor:pointer}
    .gal-studio .work small{display:block;margin-top:6px;color:#66788c}
    .gal-studio .create{display:flex;gap:8px;align-items:center;margin-top:18px;flex-wrap:wrap}
    .gal-studio .create input{height:34px;border:1px solid #c9d5e2;border-radius:8px;padding:0 8px;background:#fff}
  `;
  if (!style.parentElement) document.head.appendChild(style);
}

function StoryGraphView({ picture }: { picture: StoryGraphPicture }) {
  const at = new Map(picture.boxes.map((box) => [box.key, box]));
  return <svg className="story" viewBox={`0 0 ${picture.width} ${picture.height}`} role="img" aria-label="剧情图">
    <defs><marker id="story-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#8aa0b5" /></marker></defs>
    {picture.links.map((link) => {
      const from = at.get(link.from);
      const to = at.get(link.to);
      if (!from || !to) return null;
      const x1 = from.x + STORY_BOX_W / 2;
      const y1 = from.y + STORY_BOX_H;
      const x2 = to.x + STORY_BOX_W / 2;
      const y2 = to.y;
      return <g key={`${link.from}-${link.to}`}>
        <path d={`M ${x1} ${y1} C ${x1} ${y1 + 24}, ${x2} ${y2 - 24}, ${x2} ${y2}`} fill="none" stroke="#8aa0b5" strokeWidth="1.5" markerEnd="url(#story-arrow)" />
      </g>;
    })}
    {picture.boxes.map((box) => <g key={box.key}>
      <rect x={box.x} y={box.y} width={STORY_BOX_W} height={STORY_BOX_H} rx="10" fill={box.kind === 'ending' ? '#e5f6ec' : box.kind === 'choice' ? '#e5eefc' : '#fff'} stroke={box.kind === 'ending' ? '#8dcfab' : box.kind === 'choice' ? '#9db7ef' : '#d7e0e8'} />
      <text x={box.x + 12} y={box.y + 30}>{box.title}</text>
      <text className="sub" x={box.x + 12} y={box.y + 50}>{box.subtitle}</text>
    </g>)}
  </svg>;
}

function stepData(session: AuthoringSession): unknown {
  const spec = GAL_AUTHORING_STEPS.find((step) => step.id === session.stepId);
  if (!spec?.kind) return null;
  const pending = [...session.ledger.drafts].reverse().find((draft) => draft.projectId === session.projectId && draft.kind === spec.kind && galDraftStatus(session.ledger, session.projectId, draft.draftId) === 'draft');
  return pending?.data ?? currentApprovedGalDraft(session.ledger, session.projectId, spec.kind)?.data ?? null;
}

export function AuthoringStudio({ api, onBack }: { api: string; onBack: () => void }) {
  useEffect(ensureAuthoringStyles, []);
  const [catalog, setCatalog] = useState<AuthoringWorkCatalog>(() => {
    const stored = readAuthoringWorks(typeof localStorage === 'undefined' ? null : localStorage.getItem(WORKS_KEY));
    try { return installAuthoringSeed(stored, manorEscapeAuthoringWork()); }
    catch { return stored; }
  });
  const [workId, setWorkId] = useState<string | null>(null);
  const [newId, setNewId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [session, setSession] = useState<AuthoringSession>(() => emptyAuthoringSession());
  const [pane, setPane] = useState<'library' | 'chat'>('chat');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [castId, setCastId] = useState('');
  const [castName, setCastName] = useState('');
  const [castRef, setCastRef] = useState('');
  const [castSource, setCastSource] = useState<'library' | 'new'>('new');
  const [novelTitle, setNovelTitle] = useState('小说');
  const [novelText, setNovelText] = useState('');
  const [threads, setThreads] = useState<AuthoringWork['threads']>({});
  const [chatText, setChatText] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(WORKS_KEY, writeAuthoringWorks(catalog)); }
    catch { setNotice('图片没有写进作品存档。这次打开时仍可给模型看。'); }
    void saveAuthoringImages(catalog).catch(() => undefined);
  }, [catalog]);
  useEffect(() => {
    let dead = false;
    void loadAuthoringImages(catalog).then((loaded) => { if (!dead) setCatalog((current) => applyAuthoringImages(current, loaded)); }).catch(() => undefined);
    return () => { dead = true; };
  }, []);
  useEffect(() => {
    if (!workId) return;
    setCatalog((prev) => saveAuthoringWork(prev, workId, session, threads));
  }, [workId, session, threads]);
  const selectWork = (id: string) => {
    const work = catalog.works.find((item) => item.id === id);
    if (!work) return;
    setWorkId(work.id);
    setSession(work.session);
    setThreads(work.threads);
    setEditing(false);
    setNotice('');
    setChatText('');
    setPane('chat');
  };
  const steps = authoringSteps(session);
  const current = steps.find((step) => step.id === session.stepId) ?? steps[0]!;
  const messages = threads[current.id] ?? [];
  const data = stepData(session);
  const graphPicture = current.id === 'graph' ? layoutStoryGraph(data, storyGraphLabels(currentApprovedGalDraft(session.ledger, session.projectId, 'routes')?.data)) : null;
  const exhibit = current.id === 'art' || current.id === 'assets' || current.id === 'play' ? session.exhibits?.[current.id] : undefined;
  const approve = async () => {
    if (session.stepId !== 'cast') { const result = reviewAuthoringStep(session, 'approve', '工作室通过这一步'); apply(result.session, result.issues); return; }
    try {
      const index = await fetch('/characters/index.json').then((response) => response.json()) as { characters?: { id: string }[] };
      const ids = new Set((index.characters ?? []).map((item) => item.id));
      const result = reviewAuthoringStep(session, 'approve', '工作室通过这一步', ids);
      apply(result.session, result.issues);
    } catch { setNotice('角色仓库索引读不到，这一步没有通过，也没有写入仓库。'); }
  };
  const apply = (next: AuthoringSession, issues: { message: string }[] = []) => {
    setSession(next);
    setNotice(issues[0]?.message ?? '');
    if (!issues.length) setEditing(false);
  };
  const takeFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    let next = session;
    let error = '';
    for (const file of Array.from(list)) {
      const image = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
      const payload = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        if (image) reader.readAsDataURL(file); else reader.readAsText(file);
      });
      const made = authoringMaterialFromUpload({ name: file.name, type: file.type || (image ? 'image/png' : 'text/plain'), text: image ? undefined : payload, dataUrl: image ? payload : undefined }, next.materials.length + 1);
      if (!made.material) { error = made.error ?? '没有放进去'; continue; }
      next = addAuthoringMaterial(next, made.material);
    }
    apply(next, error ? [{ message: error }] : []);
    setPane('library');
  };
  const openStep = (stepId: AuthoringStepId) => {
    setSession(openAuthoringStep(session, stepId));
    setEditing(false);
    setNotice('');
  };
  const sendChat = async () => {
    const saying = chatText.trim();
    if (!saying || chatBusy || current.locked) return;
    const stepId = current.id;
    setChatBusy(true);
    setChatText('');
      setThreads((items) => ({ ...items, [stepId]: [...(items[stepId] ?? []), { role: 'user' as const, content: saying }] }));
    try {
      const providers = await fetch(`${api}/api/generate/providers`).then((response) => response.json()) as { id: string; available: boolean; model?: string }[];
      const deepseek = providers.find((item) => item.id === 'deepseek' && item.available);
      if (!deepseek) throw new Error('首页的 DeepSeek 还没有可用的密钥。');
      const result = await runAuthoringChat(session, messages, saying, async (round) => {
        const response = await fetch(`${api}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'gal-authoring', provider: 'deepseek', messages: round }) });
        const body = await response.json() as { success?: boolean; reply?: string; error?: string };
        if (!body.success || typeof body.reply !== 'string') throw new Error(body.error || '模型没有返回');
        return body.reply;
      });
      setSession(result.session);
      setThreads((items) => ({ ...items, [stepId]: result.history }));
      setNotice(result.notes.find((item) => item && !item.startsWith('read_') && item !== 'submit_candidate') ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : '对话没有发出去';
      setThreads((items) => ({ ...items, [stepId]: [...(items[stepId] ?? []), { role: 'assistant' as const, content: message }] }));
    } finally { setChatBusy(false); }
  };
  const work = catalog.works.find((item) => item.id === workId);
  if (!work) return <main className="gal-studio">
    <header>
      <div><h1>GAL 创作台</h1><p>先选择一部作品。每部作品有自己的步骤、素材和对话。</p></div>
      <span className="spacer" />
      <button className="ghost" onClick={onBack}>返回</button>
    </header>
    <section className="picker">
      <h2>选择作品</h2>
      <p>同时创作多部游戏时，从这里进入对应的那一份。对话不会串到另一部。</p>
      {notice && <p className="alert" role="alert">{notice}</p>}
      {catalog.works.length === 0 ? <article className="card"><b>还没有作品</b><p>创建第一部之后，下次进来会先看到这份列表。</p></article> : <div className="works">{catalog.works.map((item) => {
        const progress = authoringSteps(item.session);
        const approved = progress.filter((step) => step.status === 'approved').length;
        return <button key={item.id} className="work" onClick={() => selectWork(item.id)}><b>{item.title}</b><small>{item.id} · 已通过 {approved}/{progress.length} 步</small></button>;
      })}</div>}
      <form className="create" onSubmit={(event) => {
        event.preventDefault();
        const created = createAuthoringWork(catalog, newId, newTitle);
        if (created.issues.length || !created.work) { setNotice(created.issues[0]?.message ?? '没有创建'); return; }
        setCatalog(created.catalog);
        setNewId('');
        setNewTitle('');
        setNotice('');
        setWorkId(created.work.id);
        setSession(created.work.session);
        setThreads(created.work.threads);
      }}>
        <input aria-label="作品 id" value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="作品 id，如 manor-escape" />
        <input aria-label="作品标题" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="作品标题" />
        <button className="primary">创建并进入</button>
      </form>
    </section>
  </main>;
  return <main className="gal-studio">
    <header>
      <div><h1>{work.title}</h1><p>使用首页已保存的 DeepSeek。模型只改当前这一步，通过和退回仍在这里。</p></div>
      <span className="spacer" />
      <button className="ghost" onClick={() => setWorkId(null)}>作品列表</button>
      <button className="ghost" onClick={onBack}>返回</button>
      <button className="ghost" disabled={current.locked} onClick={() => { const result = reviewAuthoringStep(session, 'reject', '工作室退回这一步'); apply(result.session, result.issues); }}>退回这一步</button>
      <button className="primary" disabled={current.locked} onClick={() => { void approve(); }}>通过这一步</button>
    </header>
    <div className="body">
      <nav aria-label="创作步骤">
        {steps.map((step, index) => <button key={step.id} className={`step${step.id === current.id ? ' current' : ''}`} onClick={() => openStep(step.id)}>
          <i className={`dot ${step.status}`}>{index + 1}</i><b>{step.name}</b><small>{statusLabel[step.status]} · {step.hint}</small>
        </button>)}
      </nav>
      <section className="artifact">
        <div className="crumb">
          <h2>{current.name}</h2>
          <span className={`badge ${current.status}`}>{statusLabel[current.status]}</span>
          <span className="spacer" />
          {current.id !== 'cast' && !exhibit && <button className="ghost dark" disabled={current.locked} onClick={() => { setEditing((value) => !value); setText(data ? JSON.stringify(data, null, 2) : ''); }}>手动修改</button>}
        </div>
        <div className="refs">{session.materials.length ? `本步参考素材 ${session.materials.length} 份：${session.materials.map((item) => item.title).join('、')}` : '素材库还是空的。上传的小说会从简报重新走。'}</div>
        {notice && <p className="alert" role="alert">{notice}</p>}
        <div className="sheet">
          {current.id === 'cast' ? <form onSubmit={(event) => {
            event.preventDefault();
            const listed = setAuthoringCast(session, [...session.cast, { id: castId, name: castName, reference: '', source: castSource }]);
            const result = castRef ? attachAuthoringReference(listed.session, castId, { id: `ref-${castId}`, title: `${castName}外型参考`, text: castRef, role: 'reference' }) : listed;
            apply(result.session, result.issues); setCastId(''); setCastName(''); setCastRef('');
          }}>
            <h3>本作品的角色</h3>
            <p>外型参考写在这一步，挂在这个角色上。名字打开角色仓库里的百科页。这里不写入仓库，所以不会覆盖已有档案。</p>
            <table>
              <thead><tr><th>角色</th><th>来源</th><th>外型参考</th></tr></thead>
              <tbody>{session.cast.map((item) => <tr key={item.id}><td><a className="repo" href={characterLibraryHref(item.id)} target="_blank" rel="noopener">{item.name}</a><br />{item.id}</td><td>{item.source === 'library' ? '引用仓库' : '新建'}</td><td>{item.reference || '文字造型'}</td></tr>)}</tbody>
            </table>
            <div className="fields" style={{ marginTop: 12 }}>
              <input aria-label="角色 id" value={castId} onChange={(event) => setCastId(event.target.value)} placeholder="角色 id" disabled={current.locked} />
              <input aria-label="角色名" value={castName} onChange={(event) => setCastName(event.target.value)} placeholder="名字" disabled={current.locked} />
              <input aria-label="外型参考" value={castRef} onChange={(event) => setCastRef(event.target.value)} placeholder="外型参考" disabled={current.locked} />
              <select aria-label="角色来源" value={castSource} onChange={(event) => setCastSource(event.target.value === 'library' ? 'library' : 'new')} disabled={current.locked}><option value="new">新建</option><option value="library">引用仓库</option></select>
            </div>
            <button className="primary" style={{ marginTop: 8 }} disabled={current.locked || !castId.trim() || !castName.trim()}>记下角色</button>
          </form> : editing ? <form onSubmit={(event) => { event.preventDefault(); try { const result = submitAuthoringData(session, JSON.parse(text), '手动修改'); apply(result.session, result.issues); } catch { setNotice('产物必须是 JSON'); } }}>
            <h3>手动修改当前产物</h3>
            <textarea aria-label="当前产物" value={text} onChange={(event) => setText(event.target.value)} disabled={current.locked} />
            <button className="primary" style={{ marginTop: 8 }} disabled={current.locked}>保存这一步</button>
          </form> : <>
            <h3>{current.summary}</h3>
            {graphPicture ? <StoryGraphView picture={graphPicture} /> : exhibit?.pictures?.length ? <>
              {(['portrait', 'background', 'cg'] as const).map((group) => {
                const items = exhibit.pictures!.filter((item) => item.group === group);
                if (!items.length) return null;
                const heading = group === 'portrait' ? '立绘' : group === 'background' ? '背景' : 'CG';
                return <div key={group}><h3>{heading}</h3><div className="gallery">{items.map((item) => <figure key={item.src}><img src={item.src} alt={item.title} /><figcaption><b>{item.title}</b><small>{item.caption}</small></figcaption></figure>)}</div></div>;
              })}
            </> : (current.id === 'art' || current.id === 'assets') && exhibit ? <p>这一步还没有画面。</p> : data || exhibit ? <pre>{JSON.stringify(exhibit?.data ?? data, null, 2)}</pre> : <p>{current.locked ? '前面的步骤还没通过，这一步先不能改。' : '还没有产物。在右边写下要改的地方，或点手动修改。'}</p>}
          </>}
        </div>
      </section>
      <aside>
        <div className="tabs">
          <button className={pane === 'library' ? 'on' : ''} onClick={() => setPane('library')}>素材库</button>
          <button className={pane === 'chat' ? 'on' : ''} onClick={() => setPane('chat')}>和这一步对话</button>
        </div>
        {pane === 'library' ? <div className="pane">
          <div className="list">
            {session.materials.map((item) => <article key={item.id} className="card"><b>{item.title}</b>{item.image ? <img src={item.image} alt={item.title} /> : <p>{item.text.length > 500 ? `${item.text.slice(0, 500)}…` : item.text}</p>}</article>)}
            {!session.materials.length && <article className="card"><b>还没有素材</b><p>可以上传 txt、md、json、csv，或 png、jpg、webp、gif。模型需要时会自己打开查看。</p></article>}
          </div>
          <form className="composer" onSubmit={(event) => { event.preventDefault(); if (!novelText.trim()) return; apply(addAuthoringMaterial(session, { id: `novel-${session.materials.length + 1}`, title: novelTitle.trim() || '小说', text: novelText.trim(), role: 'novel' })); setNovelText(''); }}>
            <input aria-label="素材标题" value={novelTitle} onChange={(event) => setNovelTitle(event.target.value)} />
            <textarea aria-label="素材正文" value={novelText} onChange={(event) => setNovelText(event.target.value)} placeholder="把小说或笔记贴在这里。它会从简报重新走，不会直接当成台词。" />
            <input aria-label="上传文档或图片" type="file" multiple accept=".txt,.md,.json,.csv,.png,.jpg,.jpeg,.webp,.gif,text/plain,image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void takeFiles(event.target.files); event.target.value = ''; }} />
            <button className="primary" disabled={!novelText.trim()}>放入文字</button>
          </form>
        </div> : <form className="pane" onSubmit={(event) => { event.preventDefault(); void sendChat(); }}>
          <div className="list" aria-live="polite">
            {!messages.length && <article className="card"><b>这一步</b><p>只要求修改「{current.name}」。例如：把时长改成一小时。模型会自己去读素材和规格，改完后仍要你点通过。</p></article>}
            {messages.map((item, index) => <article key={`${item.role}-${index}`} className={`card${item.role === 'user' ? ' user' : ''}`}><b>{item.role === 'user' ? '你' : '模型'}</b><p>{item.content}</p></article>)}
            {chatBusy && <article className="card"><b>模型</b><p>正在查看这一步要用的材料。</p></article>}
          </div>
          <div className="composer">
            <textarea aria-label="对这一步说" name="note" value={chatText} onChange={(event) => setChatText(event.target.value)} disabled={chatBusy || current.locked} placeholder={current.locked ? '这一步还没到。' : `只要求修改「${current.name}」。`} />
            <button className="primary" disabled={chatBusy || current.locked || !chatText.trim()}>{chatBusy ? '正在改这一步' : '让模型改这一步'}</button>
          </div>
        </form>}
      </aside>
    </div>
  </main>;
}
