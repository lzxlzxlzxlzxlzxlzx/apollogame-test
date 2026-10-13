"""Project roadmap v1: strict file-backed control plane (no database)."""
import json
import os
import re
import tempfile
from copy import deepcopy
from pathlib import Path

from .sysutil import ROOT

SCHEMA = 'zerocraft.project-roadmap.v1'
ID = re.compile(r'^[a-z0-9][a-z0-9-]{0,63}$')
MILESTONE = re.compile(r'^[a-z0-9][a-z0-9-]{0,63}$')
PROJECT_STATUS = {'active', 'blocked', 'archived'}
STATUS = {'planned', 'active', 'blocked', 'review', 'done'}
CHECK = {'pending', 'pass', 'fail'}
OWNER = {'not-required', 'pending', 'approved', 'changes-requested', 'required'}
EVIDENCE = {'document', 'test', 'artifact', 'review', 'issue'}

def _safe_evidence_ref(ref: object) -> bool:
    """Permit repository-relative paths and HTTPS references only.

    This is deliberately shared with the API boundary: the Studio must never
    receive a URL that can turn an evidence link into executable navigation.
    """
    if not isinstance(ref, str) or not ref.strip():
        return False
    value = ref.strip().replace('\\', '/')
    if value.startswith('/') or '..' in value.split('/'):
        return False
    if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', value):
        return value.startswith('https://')
    return True

def _path(project_id: str) -> Path:
    if not isinstance(project_id, str) or not ID.fullmatch(project_id): raise ValueError('非法 project id（只允许小写 kebab-case）')
    return ROOT / 'docs' / 'projects' / project_id / 'project-roadmap.json'

def empty(project_id: str, title: str | None = None) -> dict:
    return {'schemaVersion': SCHEMA, 'project': {'id': project_id, 'title': title or project_id, 'summary': '', 'status': 'active'}, 'milestones': []}

def _err(msg): return {'success': False, 'diagnostics': [{'path': '$', 'message': msg}]}

def _gate_ready(milestone: dict, byid: dict) -> bool:
    """Shared close gate; never infer completion from a client supplied status."""
    gates = milestone.get('gates', {})
    return (
        all(byid.get(dep, {}).get('status') == 'done' for dep in milestone.get('dependsOn', []))
        and bool(milestone.get('evidence'))
        and gates.get('selfCheck') == 'pass'
        and gates.get('review') == 'pass'
    )

def _by_id(data: dict) -> dict:
    return {m['id']: m for m in data.get('milestones', []) if isinstance(m, dict) and isinstance(m.get('id'), str)}

def normalize_auto_closure(data: dict) -> tuple[dict, list[str]]:
    """Close only review-passed items that explicitly have no Owner gate.

    Iterating in declaration order to a fixed point also permits a later
    automatic item to unlock after its earlier dependency closes in this same
    atomic save. Owner-gated rows are deliberately excluded.
    """
    result = deepcopy(data)
    byid = _by_id(result)
    closed: list[str] = []
    changed = True
    while changed:
        changed = False
        for milestone in result.get('milestones', []):
            if milestone.get('status') != 'review' or milestone.get('gates', {}).get('owner') != 'not-required':
                continue
            if _gate_ready(milestone, byid):
                milestone['status'] = 'done'
                closed.append(milestone['id'])
                changed = True
    return result, closed

def validate(data: object, previous: dict | None = None) -> list[dict]:
    issues=[]
    def bad(path, msg): issues.append({'path': path, 'message': msg})
    if not isinstance(data, dict): return [{'path': '$', 'message': '路线图必须是对象'}]
    if set(data) != {'schemaVersion','project','milestones'}: bad('$', '根字段必须且只能为 schemaVersion/project/milestones')
    if data.get('schemaVersion') != SCHEMA: bad('schemaVersion', f'必须为 {SCHEMA}')
    p=data.get('project')
    if not isinstance(p,dict) or set(p) != {'id','title','summary','status'}: bad('project','必须且只能为 id/title/summary/status'); p={}
    if not isinstance(p.get('id'),str) or not ID.fullmatch(p.get('id','')): bad('project.id','非法 project id')
    for k in ('title',):
        if not isinstance(p.get(k),str) or not p.get(k).strip(): bad(f'project.{k}','必须是非空字符串')
    if not isinstance(p.get('summary'), str): bad('project.summary','必须是字符串')
    if p.get('status') not in PROJECT_STATUS: bad('project.status','非法状态')
    rows=data.get('milestones')
    if not isinstance(rows,list): return issues+[{'path':'milestones','message':'必须是数组'}]
    ids=set(); graph={}
    for i,m in enumerate(rows):
        q=f'milestones[{i}]'
        if not isinstance(m,dict): bad(q,'必须是对象'); continue
        allowed={'id','title','track','description','status','dependsOn','acceptance','evidence','gates'}
        if set(m)!=allowed: bad(q,'字段必须闭集'); continue
        mid=m.get('id'); valid_mid=isinstance(mid,str) and bool(MILESTONE.fullmatch(mid))
        if not valid_mid: bad(q+'.id','非法 id')
        elif mid in ids: bad(q+'.id','重复 id')
        else: ids.add(mid)
        for k in ('title','track','description'):
            if not isinstance(m.get(k),str) or not m[k].strip(): bad(q+'.'+k,'必须是非空字符串')
        if m.get('status') not in STATUS: bad(q+'.status','非法状态')
        deps=m.get('dependsOn')
        # Never use untrusted values as dictionary keys. Invalid ids already
        # have a diagnostic and cannot participate in graph validation.
        if valid_mid and mid not in graph:
            graph[mid]=deps if isinstance(deps,list) else []
        if not isinstance(deps,list) or any(not isinstance(x,str) or x==mid for x in deps): bad(q+'.dependsOn','必须是非自引用 id 数组')
        if not isinstance(m.get('acceptance'),list) or any(not isinstance(x,str) or not x.strip() for x in m['acceptance']): bad(q+'.acceptance','必须是非空字符串数组')
        ev=m.get('evidence')
        if not isinstance(ev,list): bad(q+'.evidence','必须是数组')
        else:
            for j,e in enumerate(ev):
                if not isinstance(e,dict) or set(e)!={'kind','ref','label'} or e.get('kind') not in EVIDENCE or not all(isinstance(e.get(k),str) and e[k].strip() for k in ('ref','label')) or not _safe_evidence_ref(e.get('ref')):
                    bad(f'{q}.evidence[{j}]','证据必须是安全的 kind/ref/label')
        g=m.get('gates')
        if not isinstance(g,dict) or set(g)!={'selfCheck','review','owner'} or g.get('selfCheck') not in CHECK or g.get('review') not in CHECK or g.get('owner') not in OWNER: bad(q+'.gates','门禁字段或值非法')
    for mid,deps in graph.items():
        if isinstance(deps,list):
            for d in deps:
                if d not in ids: bad(f'milestone:{mid}.dependsOn',f'未知依赖 {d}')
    seen=set(); stack=set()
    def visit(x):
        if x in stack: bad('milestones','依赖图存在环'); return
        if x in seen:return
        seen.add(x); stack.add(x)
        for d in graph.get(x,[]): visit(d)
        stack.remove(x)
    for x in graph: visit(x)
    byid={m['id']:m for m in rows if isinstance(m,dict) and isinstance(m.get('id'),str) and MILESTONE.fullmatch(m['id'])}
    for mid,m in byid.items():
        if m.get('status')=='done':
            g=m.get('gates',{}); ok=_gate_ready(m, byid) and g.get('owner') in {'not-required','approved'}
            if not ok: bad(f'milestone:{mid}','done 需要已完成依赖、证据、自检/复查 pass 与 owner 批准')
    if previous:
        old={m['id']:m for m in previous.get('milestones',[]) if isinstance(m,dict) and 'id' in m}
        for mid,m in byid.items():
            if old.get(mid,{}).get('status')=='done' and m.get('status')!='done': bad(f'milestone:{mid}.status','done 不可回退')
            if m.get('status') == 'done' and old.get(mid,{}).get('status') != 'done':
                bad(f'milestone:{mid}.status','done 只能由服务端自动收束或 Owner 终审写入')
    return issues

def next_actionable(data: dict) -> list[dict]:
    byid={m['id']:m for m in data['milestones']}
    return [m for m in data['milestones'] if m['status'] in {'planned','active'} and all(byid[d]['status']=='done' for d in m['dependsOn'])]

def ensure(project_id: str, title: str | None = None) -> tuple[dict,bool]:
    p=_path(project_id)
    if p.exists(): return load(project_id),False
    p.parent.mkdir(parents=True,exist_ok=True); data=empty(project_id,title); _atomic(p,data); return data,True
def load(project_id: str) -> dict:
    p=_path(project_id)
    if not p.exists(): raise FileNotFoundError(project_id)
    data=json.loads(p.read_text(encoding='utf-8')); issues=validate(data)
    if issues: raise ValueError('损坏路线图: '+issues[0]['message'])
    return data
def save(project_id: str, data: dict) -> dict:
    old=load(project_id); issues=validate(data,old)
    if issues: return {'success':False,'diagnostics':issues}
    if data['project']['id']!=project_id: return _err('project.id 与 URL 不一致')
    normalized, auto_closed = normalize_auto_closure(data)
    issues=validate(normalized)
    if issues: return {'success':False,'diagnostics':issues}
    _atomic(_path(project_id),normalized); return {'success':True,'roadmap':normalized,'nextActionable':next_actionable(normalized),'autoClosed':auto_closed}

def owner_decide(project_id: str, milestone_id: str, decision: str) -> dict:
    """Apply an Owner's terminal approval/return atomically, never via PUT."""
    if not isinstance(milestone_id, str) or not MILESTONE.fullmatch(milestone_id):
        return {'success': False, 'diagnostics': [{'path': 'milestoneId', 'message': '非法里程碑 id'}]}
    if decision not in {'approve', 'return'}:
        return _err('decision 必须为 approve 或 return')
    data = load(project_id)
    byid = _by_id(data)
    milestone = byid.get(milestone_id)
    if not milestone:
        return {'success': False, 'diagnostics': [{'path': 'milestoneId', 'message': '里程碑不存在'}]}
    if milestone.get('status') == 'done':
        return {'success': False, 'diagnostics': [{'path': f'milestone:{milestone_id}', 'message': 'done 不可回退或重复终审'}]}
    if milestone.get('status') != 'review':
        return {'success': False, 'diagnostics': [{'path': f'milestone:{milestone_id}.status', 'message': 'Owner 终审只接受 review 状态'}]}
    if milestone.get('gates', {}).get('owner') == 'not-required':
        return {'success': False, 'diagnostics': [{'path': f'milestone:{milestone_id}.gates.owner', 'message': '自动闭环项不需要 Owner 终审'}]}
    result = deepcopy(data)
    target = _by_id(result)[milestone_id]
    if decision == 'return':
        target['gates']['owner'] = 'changes-requested'
        target['status'] = 'active'
        issues = validate(result, data)
        if issues: return {'success': False, 'diagnostics': issues}
        _atomic(_path(project_id), result)
        return {'success': True, 'roadmap': result, 'nextActionable': next_actionable(result), 'ownerDecision': 'returned'}
    if not _gate_ready(target, _by_id(result)):
        return {'success': False, 'diagnostics': [{'path': f'milestone:{milestone_id}', 'message': 'Owner 通过前需要完成依赖、证据、自检 pass 与独立复查 pass'}]}
    target['gates']['owner'] = 'approved'
    target['status'] = 'done'
    issues = validate(result)
    if issues: return {'success': False, 'diagnostics': issues}
    _atomic(_path(project_id), result)
    return {'success': True, 'roadmap': result, 'nextActionable': next_actionable(result), 'ownerDecision': 'approved'}
def _atomic(path:Path,data:dict):
    fd,tmp=tempfile.mkstemp(prefix='.roadmap-',suffix='.json',dir=path.parent); os.close(fd)
    try: Path(tmp).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); os.replace(tmp,path)
    finally:
        if Path(tmp).exists(): Path(tmp).unlink()
def list_projects() -> list[dict]:
    base=ROOT/'docs'/'projects'
    if not base.exists(): return []
    out=[]
    for f in base.glob('*/project-roadmap.json'):
        try:
            d=load(f.parent.name); out.append({'project':d['project'],'completed':sum(m['status']=='done' for m in d['milestones']),'total':len(d['milestones']),'nextActionable':next_actionable(d)[:1]})
        except (ValueError,json.JSONDecodeError): continue
    return out
