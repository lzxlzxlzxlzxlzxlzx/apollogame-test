from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib
B=Path(__file__).resolve().parents[1]/'background'
def dump(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
data=json.loads((B/'reports/baseline.json').read_text());im=Image.open(B/'baseline/night-room-original.jpeg');w,h=im.size
sourceScale=max(1280/w,720/h);cropX=(w-1280/sourceScale)/2;cropY=(h-720/sourceScale)/2
coverage=[]
for r in data['records']:
 scene=r['scene']['rect'];scale=scene['width']/1280
 def source(rect):return{x:(rect[x]-scene[x])/scale/sourceScale+(cropX if x=='x' else cropY) for x in ['x','y']}|{x:rect[x]/scale/sourceScale for x in ['width','height']}
 zones=[]
 for e in r['ui']:
  if e['id'] in ['g105-companion-card','g105-ledger','g105-interaction-card','g105-controls']:zones.append({'consumer':e['id'],'viewportRect':e['rect'],'sourceRect':source(e['rect']),'requirement':'quiet low-detail imagery behind unchanged opaque/partly-transparent original UI'})
 table=[m for m in r['materials'] if m['skinKey']=='game-105/table/oak'];blocks=[m for m in r['materials'] if m['skinKey']=='game-105/block/wood-grain']
 # Exclude detached/off-center blocks only for main-tower attention envelope; retain all raw measured boxes in baseline report.
 central=[m for m in blocks if scene['x']+scene['width']*.35 < m['rect']['x']+m['rect']['width']/2 < scene['x']+scene['width']*.65 and m['rect']['y']<scene['y']+scene['height']*.8]
 if central:
  rect={'x':min(m['rect']['x'] for m in central),'y':min(m['rect']['y'] for m in central)};rect['width']=max(m['rect']['x']+m['rect']['width'] for m in central)-rect['x'];rect['height']=max(m['rect']['y']+m['rect']['height'] for m in central)-rect['y'];zones.append({'consumer':'main-tower-envelope','viewportRect':rect,'sourceRect':source(rect),'method':'union of current projected block boxes with centers in35–65% scene and top above80%; conservative, not visible pixels'})
 for m in table:zones.append({'consumer':'3d-table-projection','viewportRect':m['rect'],'sourceRect':source(m['rect']),'method':m['method']})
 coverage.append({'viewport':[r['width'],r['height']],'sceneRect':scene,'scale':scale,'sourceVisibleRect':[cropX,cropY,1280/sourceScale,720/sourceScale],'zones':zones})
 out=Image.open(B/r['screenshot'].replace('background/','',1)).convert('RGB');d=ImageDraw.Draw(out)
 colors=['#e9a4d5','#71e4fa','#fdd671','#b8ff96','#ff5555','#88aaff']
 for i,z in enumerate(zones):rr=z['viewportRect'];x,y=rr['x'],rr['y'];d.rectangle((x,y,x+rr['width'],y+rr['height']),outline=colors[i%len(colors)],width=2);d.text((max(0,x),max(0,y)),z['consumer'],fill=colors[i%len(colors)])
 out.save(B/'specs'/f"coverage-{r['width']}x{r['height']}.png")
spec={'assetId':'game-105/scene/night-room','path':'/games/game-105/art/scene/night-room.jpeg','original':{'size':[w,h],'aspect':w/h,'format':im.format,'mode':im.mode,'alpha':'opaque; background needs no transparency','iccProfile':bool(im.info.get('icc_profile')),'sha256':hashlib.sha256((B/'baseline/night-room-original.jpeg').read_bytes()).hexdigest()},'render':{'consumer':'mountHost.sceneBackground set by original game art load','size':'center / cover no-repeat on fixed1280x720 scene','sceneFit':'uniform min(viewportWidth/1280,viewportHeight/720), centered letterbox; no portrait recompose','sourceCropPixels':[cropX,cropY,cropX,cropY],'nineSlice':None,'colorSpace':'browser sRGB assumed when no ICC; no environment-map/lighting changes'},'sourceCompositionObservations':{'window':[175,0,737,547],'sofa':[805,310,1376,717],'lamp':[806,229,903,354],'existingPaintedForegroundTable':[565,500,919,704],'visualFoci':['bright moon/window upper left-center','warm lamp right-center','many star/moon decorations and window mullions','painted foreground coffee table conflicts with real3D table'],'provenance':'manual source-image inspection; approximate source-pixel boxes, not automatic object recognition'},'fixed3DReference':{'cameraYaw':.7,'cameraPitch':.52,'distance':15,'pivot':[0,3.6,0],'tableGeometry':[12,.7,12],'unchanged':True,'perspectiveGoal':'leave lower center for real table; no painted foreground tabletop or table edge; subdued sparse floor lines consistent with oblique elevated view'},'quietZones':coverage,'generationConstraints':{'sourceTarget':[1376,768],'onlyBackground':True,'no':['text','logo','watermark','people','painted complete foreground table','bright source behind tower','dense lines behind tower','clutter behind upper UI and lower-left card'],'framing':'retain window-left, sofa-right, lamp-right spatial anchors; can simplify or shift details away from protected zones','palette':['warm cream','muted dusty rose','desaturated plum','soft amber','quiet blue night'],'thresholds':{'rawAspectErrorMax':.02,'derivedDimensions':[1376,768],'derivedBytesMax':4194304,'allOpaque':True,'protectedROIEdgeRateThreshold':.10,'edgeDefinition':'luma finite-difference gradient>20/255 at normalized1376x768 source resolution','quietnessNote':'relative proxy, not a semantic/visual pass or text-contrast guarantee'}},'baselineLimit':'unmodified game direct mount with original Apollo global styles; full launcher imports missing unrelated games in this standalone tree, as documented last phase'}
dump(B/'specs/background-slot.json',spec);print(json.dumps({'original':[w,h],'crop':[cropX,cropY],'viewports':len(coverage)}))
