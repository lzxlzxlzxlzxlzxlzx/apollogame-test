from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import numpy as np,json,hashlib
B=Path(__file__).resolve().parents[1]/'background';ROOT=B.parents[3]
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def dump(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
spec=read(B/'specs/background-slot.json');files=read(B/'reports/files.json');run=read(B/'reports/runtime-1.json');run2=read(B/'reports/runtime-2.json')
images={'baseline':Image.open(B/'baseline/night-room-original.jpeg').convert('RGB')}|{k:Image.open(B/'derived'/f'{k}.png').convert('RGB') for k in 'ABC'}
metrics=[]
for k,im in images.items():
 for view in spec['quietZones']:
  for z in view['zones']:
   if z['consumer']=='3d-table-projection':continue
   r=z['sourceRect'];x=max(0,int(r['x']));y=max(0,int(r['y']));x2=min(im.width,int(r['x']+r['width']));y2=min(im.height,int(r['y']+r['height']));a=np.asarray(im.crop((x,y,x2,y2))).astype(float);lum=a@np.array([.2126,.7152,.0722]);dx=np.diff(lum,axis=1)[:-1,:];dy=np.diff(lum,axis=0)[:,:-1];g=np.sqrt(dx*dx+dy*dy)
   metrics.append({'candidate':k,'viewport':view['viewport'],'zone':z['consumer'],'sourceRectClipped':[x,y,x2,y2],'lumaStd':float(lum.std()),'meanGradient':float(g.mean()),'strongEdgeFraction':float((g>20).mean()),'lumaMean':float(lum.mean()),'meanRGB':a.mean(axis=(0,1)).tolist(),'method':'background only, rendered-source ROI proxy; not actual text contrast/attention test'})
dump(B/'reports/quietness.json',{'metrics':metrics,'threshold':'edge fraction <=0.10 diagnostic; rank relative to baseline, not an aesthetic approval'})
# Preserve raw imagery and output independently labelled programmatic crop previews.
(B/'derived/crops').mkdir(exist_ok=True)
for k,im in images.items():
 field=ImageOps.fit(im,(1280,720),method=Image.Resampling.LANCZOS,centering=(.5,.5))
 for view in spec['quietZones']:
  w,h=view['viewport'];r=view['sceneRect'];out=Image.new('RGB',(w,h),'#1c1728');size=(round(r['width']),round(r['height']));out.paste(field.resize(size,Image.Resampling.LANCZOS),(round(r['x']),round(r['y'])));out.save(B/'derived/crops'/f'{k}-{w}x{h}.png')
# Same-view side-by-side actual game captures; physical simulation continues between shots.
for w,h in [v['viewport'] for v in spec['quietZones']]:
 sheet=Image.new('RGB',(w*2,(h+26)*2),'#e9dfd8');d=ImageDraw.Draw(sheet)
 for i,k in enumerate(['baseline','A','B','C']):
  p=B/'screenshots/run-1'/f'{k}-{w}x{h}.png';im=Image.open(p);x=i%2*w;y=i//2*(h+26);sheet.paste(im,(x,y+26));d.text((x+8,y+6),k+' / live original layout; background only',fill='#352635')
 sheet.save(B/'comparisons'/f'live-{w}x{h}.png')
 for k in 'ABC':
  out=Image.new('RGB',(w*2,h+26),'#e9dfd8');d=ImageDraw.Draw(out)
  for i,n in enumerate(['baseline',k]):out.paste(Image.open(B/'screenshots/run-1'/f'{n}-{w}x{h}.png'),(i*w,26));d.text((i*w+8,6),n,fill='#352635')
  out.save(B/'comparisons'/f'baseline-vs-{k}-{w}x{h}.png')
sheet=Image.new('RGB',(1376*2,(768+28)*2),'#e9dfd8');d=ImageDraw.Draw(sheet)
for i,(k,im)in enumerate(images.items()):x=i%2*1376;y=i//2*796;sheet.paste(im,(x,y+28));d.text((x+8,y+6),k+' / background-only image',fill='#352635')
sheet.save(B/'comparisons/backgrounds-all.png')
comparisons=[];switches=[]
for rr in [run,run2]:
 for r in rr['records']:
  if 'switchTest' in r:switches.append({'run':rr['run'],**r['switchTest']});continue
  if r['selected']=='baseline':continue
  ref=next(x for x in rr['records'] if x.get('selected')=='baseline' and x.get('width')==r['width'] and x.get('height')==r['height'])
  same=r['ui']==ref['ui'];sceneFields=['rect','size','position','repeat','transform'];sceneSame=all(r['scene'][key]==ref['scene'][key] for key in sceneFields)
  stable=len(r['ui'])==len(ref['ui']) and all({key:value for key,value in a.items() if not(key=='text' and a['id']=='g105-ledger-detail')}=={key:value for key,value in b.items() if not(key=='text' and b['id']=='g105-ledger-detail')} for a,b in zip(r['ui'],ref['ui']))
  comparisons.append({'run':rr['run'],'candidate':r['selected'],'viewport':[r['width'],r['height']],'allUIGeometryTextColorsSkinsIdentical':same,'mechanicsEqualAllowingNaturalLootCounter':stable,'dynamicCounterNote':'only game-driven ledger loot count may increase as the detached block settles; no text was edited' if not same and stable else None,'sceneGeometryCropAndScaleIdentical':sceneSame,'selectedImageCorrect':f"/derived/{r['selected']}.png" in r['scene']['image'],'changedUIIds':[a['id'] for a,b in zip(r['ui'],ref['ui']) if a!=b]})
dump(B/'reports/runtime-checks.json',{'comparisons':comparisons,'switchWithoutRestart':switches,'browserErrors':run['errors']+run2['errors'],'slotMechanicsPass':all(x['mechanicsEqualAllowingNaturalLootCounter'] and x['sceneGeometryCropAndScaleIdentical'] and x['selectedImageCorrect'] for x in comparisons),'inPlaceRuntimeApproval':'pending planner; program verifies mechanics and captures evidence only','softKeyboard':'not tested in this background batch','fullLauncher':'not run; uses unmodified game105 direct mount with original Apollo global box-sizing/font CSS, same known boundary as stage4'})
before=read(B/'reports/formal-hashes-before.json');after={p:sha(ROOT/p) for p in before};dump(B/'reports/formal-hashes-after.json',{'algorithm':'SHA256','before':before,'after':after,'unchanged':before==after,'perFile':{p:before[p]==after[p] for p in before}});assert before==after
manifest={str(p.relative_to(B)):sha(p)for folder in ['derived','comparisons']for p in sorted((B/folder).rglob('*.png'))};dump(B/'reports/deterministic-hashes.json',manifest)
summary=[]
for k in 'ABC':
 summary.append({'candidate':k,'fileTechnicalPass':next(r['fileTechnicalPass']for r in files if r['candidate']==k),'slotMechanicsPass':all(x['mechanicsEqualAllowingNaturalLootCounter']and x['sceneGeometryCropAndScaleIdentical'] for x in comparisons if x['candidate']==k),'visualDirectionPass':None,'inPlaceRuntimePass':None,'formalAdmissionAllowed':False,'approvalOwner':'planner/owner; program does not approve last three','nextBatchStarted':False})
dump(B/'reports/batch-status.json',summary)
print(json.dumps({'files':summary,'protectedFiles':len(before),'formalUnchanged':before==after,'towerMetrics':[r for r in metrics if r['viewport']==[1280,720]and r['zone']=='main-tower-envelope'],'allUIMechanicsEqual':all(c['allUIGeometryTextColorsSkinsIdentical']for c in comparisons)},ensure_ascii=False))
