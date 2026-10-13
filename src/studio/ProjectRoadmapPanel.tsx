import React, { useEffect, useMemo, useState } from 'react';
import { SHELL } from '../ui/shell-theme.js';

type Evidence = { kind: string; ref: string; label: string };
type Milestone = {
  id: string; title: string; track: string; description: string; status: string;
  dependsOn: string[]; acceptance: string[]; evidence: Evidence[];
  gates: { selfCheck: string; review: string; owner: string };
};
type Roadmap = { project: { id: string; title: string; summary: string; status: string }; milestones: Milestone[] };
type ProjectSummary = { project: { id: string; title: string }; completed: number; total: number; nextActionable?: Milestone[] };

const statusMeta: Record<string, { label: string; color: string; wash: string }> = {
  planned: { label: '计划中', color: SHELL.dim, wash: 'rgba(255,255,255,.045)' },
  active: { label: '进行中', color: SHELL.jade, wash: SHELL.jadeWash },
  blocked: { label: '受阻', color: SHELL.danger, wash: SHELL.dangerWash },
  review: { label: '待复查', color: SHELL.warn, wash: SHELL.warnWash },
  done: { label: '已完成', color: SHELL.ok, wash: SHELL.okWash },
};
const statuses = Object.keys(statusMeta);
const button = (tone: 'solid' | 'soft' | 'quiet' = 'soft'): React.CSSProperties => ({
  padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: SHELL.fontUi, fontSize: 12.5, fontWeight: 700,
  border: `1px solid ${tone === 'solid' ? SHELL.jade : tone === 'quiet' ? 'transparent' : SHELL.line}`,
  background: tone === 'solid' ? SHELL.jade : tone === 'quiet' ? 'transparent' : SHELL.jadeWash,
  color: tone === 'solid' ? SHELL.bg0 : tone === 'quiet' ? SHELL.sub : SHELL.jade,
});
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', color: SHELL.text, background: SHELL.bg0, border: `1px solid ${SHELL.line}`, borderRadius: 7, outline: 'none', fontFamily: SHELL.fontUi, fontSize: 13 };
const label: React.CSSProperties = { display: 'grid', gap: 5, color: SHELL.dim, fontSize: 11.5, fontWeight: 700, letterSpacing: .3 };

function evidenceHref(ref: string): string | undefined {
  const value = ref.trim().replace(/\\/g, '/');
  if (!value || value.startsWith('/') || value.split('/').includes('..')) return undefined;
  return value.startsWith('https://') || !/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : undefined;
}
function newMilestone(index: number): Milestone {
  return { id: `milestone-${index + 1}`, title: '新里程碑', track: '核心', description: '待补充说明', status: 'planned', dependsOn: [], acceptance: ['待验收'], evidence: [], gates: { selfCheck: 'pending', review: 'pending', owner: 'not-required' } };
}
function Pill({ children, color, wash }: { children: React.ReactNode; color: string; wash: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: 999, background: wash, color, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{children}</span>;
}
function Gate({ label: name, value }: { label: string; value: string }) {
  const color = value === 'pass' || value === 'approved' || value === 'not-required' ? SHELL.ok : value === 'fail' || value === 'changes-requested' ? SHELL.danger : SHELL.warn;
  return <span style={{ fontSize: 11.5, color: SHELL.sub }}>{name} <b style={{ color }}>{value === 'not-required' ? '无需' : value === 'approved' ? '已批准' : value === 'changes-requested' ? '已退回' : value}</b></span>;
}

export function ProjectRoadmapPanel({ api, onBack }: { api: string; onBack: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]); const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [projectId, setProjectId] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [saved, setSaved] = useState(false);
  const refresh = () => fetch(`${api}/api/projects`).then(x => x.json()).then(d => setProjects(d.projects ?? [])).catch(() => setError('项目控制台不可用'));
  useEffect(() => { void refresh(); }, []);
  const open = (id: string) => fetch(`${api}/api/projects/${id}/roadmap`).then(x => x.json()).then(d => d.success ? (setRoadmap(d.roadmap), setSaved(false), setError('')) : setError(d.diagnostics?.[0]?.message ?? '读取失败'));
  const save = async () => {
    if (!roadmap) return;
    const result = await fetch(`${api}/api/projects/${roadmap.project.id}/roadmap`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(roadmap) }).then(x => x.json());
    if (result.success) { setRoadmap(result.roadmap); setError(''); setNotice(result.autoClosed?.length ? `已自动收束：${result.autoClosed.join('、')}` : '路线图已保存'); setSaved(true); void refresh(); } else setError(result.diagnostics?.map((x: any) => `${x.path}: ${x.message}`).join('；') ?? '保存失败');
  };
  const register = async () => {
    const result = await fetch(`${api}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, title: projectId }) }).then(x => x.json());
    if (result.success) { setRoadmap(result.roadmap); setProjectId(''); setSaved(false); void refresh(); } else setError(result.diagnostics?.[0]?.message ?? '注册失败');
  };
  const update = (index: number, milestone: Milestone) => roadmap && (setRoadmap({ ...roadmap, milestones: roadmap.milestones.map((item, i) => i === index ? milestone : item) }), setSaved(false));
  const ownerDecision = async (milestoneId: string, decision: 'approve' | 'return') => {
    if (!roadmap) return;
    try {
      const response = await fetch(`${api}/api/projects/${roadmap.project.id}/roadmap/owner-decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ milestoneId, decision }) });
      const result = await response.json();
      if (result.success) { setRoadmap(result.roadmap); setError(''); setNotice(result.ownerDecision === 'approved' ? 'Owner 已通过，里程碑已收束。' : 'Owner 已退回，里程碑已回到返修。'); setSaved(true); void refresh(); }
      else setError(result.diagnostics?.map((x: any) => `${x.path}: ${x.message}`).join('；') ?? result.error ?? `Owner 操作失败（HTTP ${response.status}）`);
    } catch {
      setError('Owner 操作无法连接到控制台服务；请确认服务已加载路线图终审端点。');
    }
  };
  const grouped = useMemo(() => roadmap?.milestones.reduce<Record<string, Milestone[]>>((groups, milestone) => { (groups[milestone.track] ??= []).push(milestone); return groups; }, {}) ?? {}, [roadmap]);
  const progress = useMemo(() => !roadmap?.milestones.length ? 0 : Math.round(roadmap.milestones.filter(m => m.status === 'done').length / roadmap.milestones.length * 100), [roadmap]);
  const nextReason = (m: Milestone) => {
    const dependenciesReady = m.dependsOn.every(id => roadmap?.milestones.find(item => item.id === id)?.status === 'done');
    if (m.status === 'done') return '此项已收束';
    if (!dependenciesReady) return `依赖未完成：${m.dependsOn.join('、')}`;
    if (m.gates.owner === 'changes-requested') return 'Owner 已退回；完成返修后重新送交独立复查';
    if (m.status === 'review') return m.gates.review !== 'pass' ? '等待 agent 独立复查' : m.gates.owner === 'not-required' ? '保存时由 Agent 自动收束' : '等待 Owner 通过';
    return '补齐验收与证据后送交独立复查';
  };

  return <main style={{ minHeight: '100vh', background: SHELL.appBg, color: SHELL.text, fontFamily: SHELL.fontUi, padding: '22px clamp(16px, 4vw, 56px) 56px' }}>
    <div style={{ maxWidth: 1380, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingBottom: 18, borderBottom: `1px solid ${SHELL.line}` }}>
        <button style={button('quiet')} onClick={onBack}>← 返回工作台</button><span style={{ color: SHELL.dim, fontSize: 12 }}>PROJECT CONTROL · v1</span>
      </header>
      <section style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'end', padding: '30px 0 24px', flexWrap: 'wrap' }}>
        <div><div style={{ color: SHELL.jade, fontSize: 12, fontWeight: 800, letterSpacing: 1.5 }}>ROADMAP OVERVIEW</div><h1 style={{ margin: '7px 0 8px', fontSize: 'clamp(30px, 4vw, 46px)', letterSpacing: -1.5 }}>项目控制台</h1><p style={{ margin: 0, maxWidth: 630, color: SHELL.sub, lineHeight: 1.7 }}>将跨游戏的工程目标、证据与裁决收束在一张可审计的路线图中。</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 6, border: `1px solid ${SHELL.line}`, borderRadius: 10, background: SHELL.bg1 }}><input aria-label="项目 id" style={{ ...input, width: 190, border: 'none', background: 'transparent' }} value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="输入项目 id" /><button style={button('solid')} onClick={register}>注册项目</button></div>
      </section>
      {error && <div role="alert" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 9, border: `1px solid ${SHELL.danger}`, background: SHELL.dangerWash, color: SHELL.danger, fontSize: 13 }}>⚠ {error}</div>}
      {notice && <div role="status" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 9, border: `1px solid ${SHELL.ok}`, background: SHELL.okWash, color: SHELL.ok, fontSize: 13 }}>✓ {notice}</div>}
      {!roadmap ? <section style={{ padding: '20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}><h2 style={{ margin: 0, fontSize: 18 }}>已注册项目</h2><span style={{ color: SHELL.dim, fontSize: 12 }}>{projects.length} 个路线图</span></div>
        {projects.length === 0 ? <div style={{ padding: 34, borderRadius: 14, background: SHELL.bg1, border: `1px dashed ${SHELL.line}`, color: SHELL.sub, textAlign: 'center' }}>尚无路线图。输入已有项目 ID 后注册，已有文件不会被覆盖。</div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>{projects.map(project => <button key={project.project.id} onClick={() => open(project.project.id)} style={{ textAlign: 'left', padding: 17, borderRadius: 12, border: `1px solid ${SHELL.line}`, background: SHELL.bg1, color: SHELL.text, cursor: 'pointer', fontFamily: SHELL.fontUi }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{project.project.title}</b><span style={{ color: SHELL.jade, fontSize: 12 }}>{project.completed}/{project.total}</span></div><div style={{ height: 4, margin: '13px 0 10px', borderRadius: 4, background: SHELL.bg0 }}><div style={{ width: `${project.total ? project.completed / project.total * 100 : 0}%`, height: '100%', borderRadius: 4, background: SHELL.jade }} /></div><span style={{ color: SHELL.dim, fontSize: 12 }}>下一项 · {project.nextActionable?.[0]?.title ?? '暂无可推进项'}</span></button>)}</div>}
      </section> : <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}><div><button style={button('quiet')} onClick={() => setRoadmap(null)}>‹ 项目列表</button><h2 style={{ margin: '9px 0 0', fontSize: 25 }}>{roadmap.project.title}</h2></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ color: saved ? SHELL.ok : SHELL.dim, fontSize: 12 }}>{saved ? '✓ 已保存' : '有未保存修改'}</span><button style={button('soft')} onClick={() => setRoadmap({ ...roadmap, milestones: [...roadmap.milestones, newMilestone(roadmap.milestones.length)] })}>＋ 里程碑</button><button style={button('solid')} onClick={save}>保存路线图</button></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.5fr) repeat(3, minmax(120px, .65fr))', gap: 1, overflow: 'hidden', borderRadius: 13, border: `1px solid ${SHELL.line}`, background: SHELL.line, marginBottom: 22 }}><div style={{ background: SHELL.bg1, padding: 17 }}><div style={{ color: SHELL.dim, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>总体进度</div><div style={{ display: 'flex', alignItems: 'end', gap: 10, marginTop: 5 }}><b style={{ fontSize: 29 }}>{progress}%</b><span style={{ color: SHELL.sub, fontSize: 12, paddingBottom: 5 }}>已收束 {roadmap.milestones.filter(m => m.status === 'done').length} / {roadmap.milestones.length}</span></div><div style={{ height: 5, marginTop: 10, background: SHELL.bg0, borderRadius: 8 }}><div style={{ width: `${progress}%`, height: '100%', borderRadius: 8, background: SHELL.jade }} /></div></div>{[['进行中', roadmap.milestones.filter(m => m.status === 'active').length, SHELL.jade], ['待复查', roadmap.milestones.filter(m => m.status === 'review').length, SHELL.warn], ['受阻', roadmap.milestones.filter(m => m.status === 'blocked').length, SHELL.danger]].map(([name, count, color]) => <div key={String(name)} style={{ background: SHELL.bg1, padding: 17 }}><div style={{ color: SHELL.dim, fontSize: 11, fontWeight: 800 }}>{name}</div><b style={{ display: 'block', color: String(color), fontSize: 29, marginTop: 6 }}>{count}</b></div>)}</div>
        {Object.entries(grouped).map(([track, milestones]) => <section key={track} style={{ marginBottom: 26 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 10px 2px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: SHELL.violet }} /><h3 style={{ margin: 0, fontSize: 16 }}>{track}</h3><span style={{ color: SHELL.dim, fontSize: 12 }}>{milestones.length} 项</span></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>{milestones.map(m => {
          const index = roadmap.milestones.indexOf(m); const meta = statusMeta[m.status] ?? statusMeta.planned;
          return <article key={`${m.id}-${index}`} style={{ padding: 17, borderRadius: 13, border: `1px solid ${m.status === 'blocked' ? SHELL.danger : SHELL.line}`, background: SHELL.bg1, boxShadow: '0 10px 30px rgba(0,0,0,.12)' }}>
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 10 }}><div><div style={{ color: SHELL.dim, fontFamily: SHELL.fontMono, fontSize: 10.5, marginBottom: 5 }}>{m.id}</div><b style={{ fontSize: 16, lineHeight: 1.35 }}>{m.title}</b></div><Pill color={meta.color} wash={meta.wash}>{meta.label}</Pill></div>
            <p style={{ minHeight: 38, margin: '10px 0 12px', color: SHELL.sub, fontSize: 13, lineHeight: 1.55 }}>{m.description}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0', borderTop: `1px solid ${SHELL.line}`, borderBottom: `1px solid ${SHELL.line}` }}><Gate label="自检" value={m.gates.selfCheck} /><Gate label="复查" value={m.gates.review} /><Gate label="Owner" value={m.gates.owner} /><Pill color={m.gates.owner === 'not-required' ? SHELL.jade : SHELL.warn} wash={m.gates.owner === 'not-required' ? SHELL.jadeWash : SHELL.warnWash}>{m.gates.owner === 'not-required' ? 'Agent 自动收束' : 'Owner 人门'}</Pill></div>
            <div style={{ marginTop: 11, color: SHELL.sub, fontSize: 12.5 }}><b style={{ color: SHELL.jade }}>下一步</b> · {nextReason(m)}</div>
            {m.dependsOn.length > 0 && <div style={{ marginTop: 8, color: SHELL.dim, fontSize: 12 }}>依赖 · {m.dependsOn.map(dependency => <span key={dependency} style={{ marginLeft: 5, color: SHELL.sub }}>{dependency}</span>)}</div>}
            {m.evidence.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{m.evidence.map(e => { const href = evidenceHref(e.ref); return href ? <a key={`${e.kind}-${e.ref}`} href={href} target={href.startsWith('https://') ? '_blank' : undefined} rel={href.startsWith('https://') ? 'noreferrer' : undefined} style={{ color: SHELL.jade, fontSize: 12, textDecoration: 'none' }}>↗ {e.label}</a> : <span key={`${e.kind}-${e.ref}`} style={{ color: SHELL.dim, fontSize: 12 }}>{e.label}</span>; })}</div>}
            {m.status === 'review' && m.gates.owner !== 'not-required' && <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}><button style={button('solid')} onClick={() => ownerDecision(m.id, 'approve')}>Owner 通过</button><button style={button('soft')} onClick={() => ownerDecision(m.id, 'return')}>Owner 退回返修</button></div>}
            <details style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${SHELL.line}` }}><summary style={{ cursor: 'pointer', color: SHELL.sub, fontSize: 12.5, fontWeight: 700 }}>编辑里程碑</summary><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 13 }}><label style={label}>标题<input aria-label="里程碑标题" style={input} value={m.title} onChange={e => update(index, { ...m, title: e.target.value })} /></label><label style={label}>状态<select style={input} value={m.status} onChange={e => update(index, { ...m, status: e.target.value })}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label><label style={label}>ID<input aria-label="里程碑 id" style={input} value={m.id} onChange={e => update(index, { ...m, id: e.target.value })} /></label><label style={label}>轨道<input aria-label="里程碑轨道" style={input} value={m.track} onChange={e => update(index, { ...m, track: e.target.value })} /></label><label style={{ ...label, gridColumn: '1 / -1' }}>依赖（以逗号分隔）<input aria-label="里程碑依赖" style={input} value={m.dependsOn.join(',')} onChange={e => update(index, { ...m, dependsOn: e.target.value.split(',').map(item => item.trim()).filter(Boolean) })} /></label></div><div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}><button style={button('soft')} onClick={() => update(index, { ...m, evidence: [...m.evidence, { kind: 'document', ref: 'docs/design/README.md', label: '新证据' }] })}>＋ 追加证据</button></div></details>
          </article>;
        })}</div></section>)}
      </section>}
    </div>
  </main>;
}
