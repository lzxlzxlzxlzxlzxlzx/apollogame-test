from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib,re
B=Path(__file__).resolve().parents[1];ROOT=B.parents[2]
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def dump(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
idx=read(ROOT/'public/games/game-105/art/index.json');baseline=read(B/'reports/runtime-baseline.json');tech=read(B/'reports/technical-all.json');materials=read(B/'reports/materials.json');fixture=read(B/'reports/fixture.json')
selected=['ui/card-frame','ui/panel-s','ui/panel-m','ui/panel-l','ui/button-primary','ui/button-secondary','block/wood-grain','table/oak','scene/night-room','ai/portrait-think','ai/portrait-expect','ai/portrait-laugh','ai/portrait-shy']
specs=[]
for suffix in selected:
 asset=next(a for a in idx['assets'] if a['id']=='game-105/'+suffix);p=ROOT/'public'/asset['path'].lstrip('/');isvec=p.suffix=='.svg';isnormal='wood-grain' in suffix;is3d=isnormal or suffix=='table/oak';isportrait=suffix.startswith('ai/');isbg=suffix.startswith('scene/');iscard=suffix=='ui/card-frame';ispanel='panel-' in suffix;isbutton='button-' in suffix
 if isvec:
  txt=p.read_text();size=[int(re.search(r'width="(\d+)"',txt)[1]),int(re.search(r'height="(\d+)"',txt)[1])];mode='SVG';alpha='opaque base rect';palette=list(dict.fromkeys(re.findall('#[a-fA-F0-9]{6}',txt)))[:8];profile=False
 else:
  im=Image.open(p);size=list(im.size);mode=im.mode;ar=np.asarray(im.convert('RGBA'));alpha={'min':int(ar[:,:,3].min()),'max':int(ar[:,:,3].max()),'transparentFraction':float((ar[:,:,3]==0).mean())};profile=bool(im.info.get('icc_profile'));pal=im.convert('RGB').quantize(colors=6).getpalette();palette=['#%02x%02x%02x'%tuple(pal[i:i+3]) for i in range(0,18,3)]
 observations=[]
 for r in baseline['records']:
  if not r['name'].startswith('interaction-'):continue
  for e in r['elements']:
   if any(asset['path'] in str(e.get(k,'')) for k in ['src','background','borderImage']):observations.append({'state':r['name'],'viewport':[r['width'],r['height']],**e})
 if isportrait and not observations:
  # Geometry is shared titleIcon; do not claim this phase was actually observed.
  for r in baseline['records']:
   if not r['name'].startswith('interaction-'):continue
   for e in r['elements']:
    if '/art/ai/portrait-' in str(e.get('src')):observations.append({'state':'shared-titleIcon geometry; requested portrait phase NOT observed','viewport':[r['width'],r['height']],**e})
 if suffix=='ui/button-secondary':
  for r in baseline['records']:
   if not r['name'].startswith('interaction-'):continue
   for e in r['elements']:
    if e['id'] in ['g105-interaction-swap','g105-interaction-skip','g105-restart']:observations.append({'state':r['name'],'viewport':[r['width'],r['height']],'visibilityNote':'declared skin is overridden by production !important gradient; bitmap NOT visibly consumed in these states',**e})
 if iscard:
  for r in fixture['records']:
   if r['candidate']!='baseline':continue
   for e in r['data']:
    if e['id'] in ['g105-interaction-card','g105-ai-interaction-card']:
     observations.append({'state':'static original-HUD fixture '+r['state']+'; not physically reached baseline state','viewport':[r['width'],r['height']],'id':e['id'],'rect':dict(zip(['x','y','width','height'],e['rect']))})
 if is3d:
  for r in materials['records']:
   for e in r['materials']:
    if e['skinKey']==asset['id']:observations.append({'state':'actual player-ready render','viewport':[r['width'],r['height']],**e})
 if isbg:
  for r in baseline['records']:
   if r['name'].startswith('interaction-'):
    canvas=next(e for e in r['elements'] if e['tag']=='CANVAS');observations.append({'state':r['name'],'viewport':[r['width'],r['height']],'rect':canvas['rect'],'backgroundSize':'cover','crop':'center cover from1376x768 to1280x720; about5.333 source px per horizontal side; scene then letterboxed'})
 rects=[o['rect'] for o in observations];bounds={'min':[min(r['width'] for r in rects),min(r['height'] for r in rects)],'max':[max(r['width'] for r in rects),max(r['height'] for r in rects)]} if rects else None
 sliceval=22 if iscard else 28 if ispanel else None
 safety=({'fixedCorners':[22,22],'stretchCenterSource':[22,22,239,222],'quietInterior':'at least source[32,32,229,212], support existing light copy','curveLimit':22} if iscard else {'fixedCorners':[28,28],'center':'reserve all title/label rectangles in observations'} if ispanel else {'faceAndHair':'preserve existing head/pose/silhouette; entire figure must fit contain; readable at10.5 logical px icon'} if isportrait else {'center':'text center, crop margins according to observed cover ratio; no baked text'} if isbutton else {'tile':'opposite edges continuous; no motif or lighting discontinuity'} if is3d else {'composition':'preserve window left, sofa right, lamp center-right, central tower/table space; no new foreground obstruction'})
 specs.append({'requestedId':'game-105/ui/button-quiet' if suffix=='ui/button-secondary' else asset['id'],'actualId':asset['id'],'aliasNote':'requested button-quiet DOES NOT EXIST; actual quiet skinKey is buttonSecondary / game-105/ui/button-secondary; do not add formal alias' if suffix=='ui/button-secondary' else None,'path':asset['path'],'skinKey':asset['id'],'consumer':asset['provenance']['consumerSlot'],'status':asset['status'],'file':{'dimensions':size,'format':'SVG' if isvec else Image.open(p).format,'mode':mode,'sha256':sha(p),'alpha':alpha,'iccProfilePresent':profile},'alphaRequirement':'opaque tangent-space normal, no transparency' if isnormal else 'opaque albedo, no transparency' if suffix=='table/oak' else 'opaque RGB' if isbg else 'real RGBA; preserve silhouette/outside transparent and antialias; never bake checkerboard','colorSpace':'linear data (Three NoColorSpace)' if isnormal else 'sRGB; no custom wide-gamut profile; browser CSS imagery or albedo sRGB','cropStretch':'UV repeat2 on each block face; camera projected; no 9slice' if isnormal else 'UV repeat5 on table faces; camera projected; no 9slice' if is3d else 'center/cover' if isbg or isbutton else 'contain in1.05em titleIcon' if isportrait else 'border-image stretch fill; source slice equals CSS target border width; no aspect preservation of center','nineSlice':sliceval,'safeArea':safety,'observedDisplayRange':bounds,'rangeScope':'five declared viewport sizes and captured states only; no global maximum claim; height changes with content; projected3D bound includes hidden faces','observations':observations,'paletteObserved':palette,'style':['月灯奶油夜','柔和手绘','奶油纸','玫瑰金','低饱和梅子紫'] if not isnormal else ['subtle tangent-space wood normal','neutral128,128,255','preserve four channel albedo colors'],'forbiddenPatterns':['baked text','numbers','watermarks','checkerboards','extra UI controls']+(['moon','star','heart','icons','people','symbols'] if iscard or ispanel or isbutton or is3d else ['new characters','identity drift'] if isportrait else ['new foreground clutter']),'compositionInvariant':safety,'technicalThresholds':{'parse':True,'dimensionsMatchOriginal':True,'maxBytes':262144 if iscard else 2097152,'aspectErrorMax':.01,'outerAlpha0Required':not(is3d or isbg),'maxCornerCurvePx':sliceval,'centralLumaStdMax':2 if iscard else 'inspect material-specific','centralGradientMax':1 if iscard else 'not applicable','edgeCrossSectionStdMax':6 if iscard else 'inspect slice/tile boundary','textContrastMin':4.5 if not(is3d or isbg or isportrait) else 'not applicable','normalMapEdgeRGBDeltaMax':4 if isnormal else None,'semanticPass':'human required'},'verifyStates':['opening','player interaction','input','quick','submit','swap enabled/disabled','skip','longest-main','summary','ai-response','collapse portrait if applicable'],'generationThisStage':iscard})
dump(B/'specs/asset-slots.json',{'version':1,'layoutImmutable':True,'baselineEvidence':'reports/runtime-baseline.json','materialEvidence':'reports/materials.json','assets':specs})
# Human-readable slot index, leave structured geometry authoritative.
lines=['# 原版素材槽位索引','', '完整逐状态矩形、裁切、消费者和阈值见 asset-slots.json。最小最大值只覆盖本轮五尺寸，不表示所有未来状态。','', '|请求槽位|实际文件尺寸|九宫格|屏上尺寸范围（本轮）|','|---|---|---|---|']
for s in specs:
 rng=s['observedDisplayRange'];desc='未观测' if not rng else f"{rng['min'][0]:.2f}×{rng['min'][1]:.2f} 至 {rng['max'][0]:.2f}×{rng['max'][1]:.2f}"
 lines.append(f"|{s['requestedId']}|{s['file']['dimensions']} {s['file']['format']}|{s['nineSlice']}|{desc}|")
lines+=['','button-quiet不是现有资源ID，实际为button-secondary。立绘目前消费者只是10.5逻辑像素的标题图标，并非大立绘；部分情绪的矩形来自共用槽位而非已触发该状态。','', 'wood-grain是线性法线贴图，不能把普通棕色木纹当替换图。table/oak是sRGB反照率，重复次数分别2与5。三维矩形使用实际渲染网格八角投影，包括被遮住的面，不是可见像素面积。']
(B/'specs/README.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
# Controlled side-by-side evidence. Actual physics differs between captures and is not changed for comparison.
for k in 'ABCD':
 for size in ['1280x720','800x450']:
  left=Image.open(B/'baseline'/f'interaction-{size}.png').convert('RGB');right=Image.open(B/'screenshots'/k/f'interaction-{size}.png').convert('RGB');w,h=left.size;out=Image.new('RGB',(w*2,h+26),'#eee3d8');out.paste(left,(0,26));out.paste(right,(w,26));d=ImageDraw.Draw(out);d.text((10,6),'FORMAL / original layout',fill='black');d.text((w+10,6),f'{k} / only card-frame image replaced',fill='black');out.save(B/'comparisons'/f'formal-vs-{k}-{size}.png')
for size in ['1280x720','800x450']:
 imgs=[Image.open(B/'baseline'/f'interaction-{size}.png')]+[Image.open(B/'screenshots'/k/f'interaction-{size}.png') for k in 'ABCD'];w,h=imgs[0].size;out=Image.new('RGB',(w*2,(h+26)*3),'#eee3d8');d=ImageDraw.Draw(out)
 for i,im in enumerate(imgs):x=i%2*w;y=i//2*(h+26);out.paste(im,(x,y+26));d.text((x+10,y+6),['FORMAL','A','B','C','D'][i],fill='black')
 out.save(B/'comparisons'/f'all-{size}.png')
rawsheet=Image.new('RGB',(4*290,280),'#a69da4');d=ImageDraw.Draw(rawsheet)
for i,k in enumerate('ABCD'):
 im=Image.open(B/'derived'/f'{k}.png');rawsheet.paste(im,(i*290+14,25),im);d.text((i*290+14,6),k,fill='black')
rawsheet.save(B/'comparisons/candidate-assets.png')
def luminance(rgb):
 a=np.asarray(rgb)/255; a=np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4);return a@np.array([.2126,.7152,.0722])
contrast=[]
for k in 'ABCD':
 a=np.asarray(Image.open(B/'derived'/f'{k}.png').convert('RGBA'));bg=a[61:183,65:196,:3].mean(axis=(0,1));l=luminance(bg);row={'candidate':k,'sampleMeanRGB':bg.tolist(),'method':'asset center color vs unchanged production text; excludes existing animated sheen and text shadow'}
 for name,col in [('titleBody',[255,248,233]),('helper',[241,207,141])]:row[name+'Contrast']=float((luminance(col)+.05)/(l+.05))
 row['passesColorContrast']=row['titleBodyContrast']>=4.5 and row['helperContrast']>=4.5;contrast.append(row)
dump(B/'reports/readability.json',{'results':contrast,'limitations':'small original fonts and portrait scaling unchanged; numeric contrast is not full accessibility approval; production sheen may locally reduce contrast'})
# Compare identical main question records; other physics states may have different text/height legitimately.
geometry=[];states=[]
for k in 'ABCD':
 run=read(B/'reports'/f'runtime-{k}.json')
 for r in run['records']:
  states.append({'candidate':k,'name':r['name'],'status':r['status'],'heart':r['heart']})
  if not r['name'].startswith('interaction-'):continue
  frame=next(e for e in r['elements'] if e['id']=='g105-interaction-card')
  assert f'/derived/{k}.png' in frame['borderImage'] and frame['slice']=='22 fill'
  ref=next(b for b in baseline['records'] if b['name']==r['name']);ids=['g105-interaction-card','g105-card-title','g105-card-text','g105-card-kicker','g105-card-safety','g105-response-input','g105-quick-one','g105-quick-two','g105-quick-three','g105-interaction-complete','g105-interaction-swap','g105-interaction-skip'];diff=[]
  for id in ids:
   a=next(e for e in ref['elements'] if e['id']==id);b=next(e for e in r['elements'] if e['id']==id)
   for field in ['rect','fontSize','padding','gap','transform','color','text']:
    if a[field]!=b[field]:diff.append({'id':id,'field':field,'baseline':a[field],'candidate':b[field]})
  def negligible(d):
   if d['field'] not in ['fontSize','padding']:return False
   nums=lambda v:[float(x) for x in re.findall(r'[0-9.]+',v)]
   a=nums(d['baseline']);b=nums(d['candidate']);return len(a)==len(b) and all(abs(x-y)<=.001 for x,y in zip(a,b))
  geometry.append({'candidate':k,'viewport':[r['width'],r['height']],'exactMatch':not diff,'within001pxTolerance':all(negligible(d) for d in diff),'differences':diff})
dump(B/'reports/layout-compatibility.json',{'realRuntime':geometry,'controlledFixtureComparisons':fixture['comparisons'],'layoutModified':False,'productionSkinSlice':22,'note':'comparison checks card and controls; physical tower and dynamic top status vary between live runs; known original overlap and tiny portrait type retained'})
dump(B/'reports/state-evidence.json',{'actualStates':states,'longestTextEvidence':'screenshots/{candidate}/fixture explicitly static original HUD','historicalAttempts':[{'candidate':'C','attempt':1,'result':'early diagnostic real pull did not reach interaction within30s while concurrent captures active; no success claimed','retry':'sequential attempt succeeded'},{'baseline':'early diagnostic submit advanced to another real queued card; this is historical, final actual statuses are in runtime-baseline.json and capture-run-log.json'}]})
before=read(B/'reports/formal-hashes-before.json');after={f:sha(ROOT/f) for f in before};dump(B/'reports/formal-hashes-after.json',{'before':before,'after':after,'unchanged':before==after,'perFileUnchanged':{f:before[f]==after[f] for f in before}});assert before==after
currentNine=[B/'nine-slice'/f'{k}-{w}x{h}.png' for k in ['formal','A','B','C','D'] for w,h in [(261,244),(484,324),(484,420),(484,438),(484,278)]]
currentOutputs=sorted((B/'derived').glob('*.png'))+currentNine+sorted((B/'comparisons').glob('*.png'))
manifest={str(p.relative_to(B)):sha(p) for p in currentOutputs};dump(B/'reports/deterministic-hashes.json',manifest)
print(json.dumps({'slots':len(specs),'layoutExact':all(r['exactMatch'] for r in geometry),'fixtureExact':all(r['identicalGeometryTypographyAndText'] for r in fixture['comparisons']),'contrast':contrast,'formalUnchanged':before==after},ensure_ascii=False))
assert all(r['within001pxTolerance'] for r in geometry)
assert len(fixture['comparisons'])==24 and all(r['identicalGeometryTypographyAndText'] for r in fixture['comparisons'])
