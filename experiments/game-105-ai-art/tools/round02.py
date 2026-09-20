"""Isolated round 02 checks; never removes backgrounds or writes production files."""
import json, hashlib, argparse, shutil
from pathlib import Path
from PIL import Image, ImageStat, ImageFilter, ImageDraw
import numpy as np
E=Path(__file__).resolve().parents[1]
R=E.parents[1]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def write(p,x):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def check(p,raw=False):
 try:
  with Image.open(p) as i:i.verify()
  i=Image.open(p);a=np.array(i.convert('RGBA'));w,h=i.size
 except Exception as e:return dict(path=str(p.relative_to(E)),passed=False,issues=['parse:'+str(e)])
 alpha=a[:,:,3];rgb=a[:,:,:3].astype(float); luma=rgb@np.array([.299,.587,.114])
 yy,xx=np.indices((h,w));band=max(1,int(min(w,h)*.01));outer=(xx<band)|(xx>=w-band)|(yy<band)|(yy>=h-band)
 edge=(xx<1)|(xx==w-1)|(yy<1)|(yy==h-1)
 ring=(xx<w*.08)|(xx>=w*.92)|(yy<h*.08)|(yy>=h*.92)
 vis=ring&(alpha>=32); gray=(rgb.max(2)-rgb.min(2)<16)&(luma>=65)&(luma<=225)
 risk=float((gray&vis).sum()/max(1,vis.sum()))
 safe=luma[round(h*72/400):round(h*328/400),round(w*88/640):round(w*552/640)]
 grad=float((np.abs(np.diff(safe,axis=0)).mean()+np.abs(np.diff(safe,axis=1)).mean())/2)
 m=dict(mode=i.mode,width=w,height=h,aspectRatio=round(w/h,6),exactTargetSize=(w,h)==(640,400),realAlpha='A' in i.mode and int(alpha.min())==0 and int(alpha.max())==255,alphaRange=[int(alpha.min()),int(alpha.max())],canvasEdgeTransparent=bool((alpha[edge]==0).all()),opaqueOuterEdgeRatio=round(float((alpha[outer]>32).mean()),6),checkerRisk=round(risk,6),safeAreaLumaStdDev=round(float(safe.std()),6),safeAreaEdgeMean=round(grad,6),fileBytes=p.stat().st_size)
 issues=[]
 for key,ok in [('aspect',1.25<=w/h<=1.8),('size',w>=640 and h>=400 if raw else (w,h)==(640,400)),('alpha',m['realAlpha']),('outer',m['opaqueOuterEdgeRatio']<=.04),('checker',risk<=.16),('safe-texture',safe.std()<=28 and grad<=10),('bytes',m['fileBytes']<=5000000)]:
  if not ok:issues.append(key)
 # Automated semantic vision is recorded separately, never inferred from color metrics.
 return dict(path=str(p.relative_to(E)),sha256=sha(p),passed=not issues,metrics=m,issues=issues,forbiddenSymbolRisk=dict(status='vision-inspected-low-risk',method='Assistant visual inspection of original; no moon/star/text/number/icon/person observed. Not OCR or an exhaustive detector.',requiresHumanReview=True))
def nine(im,size,s=22):
 out=Image.new('RGBA',size);w,h=im.size;W,H=size
 xs=[0,s,w-s,w];ys=[0,s,h-s,h];dx=[0,s,W-s,W];dy=[0,s,H-s,H]
 for y in range(3):
  for x in range(3):out.paste(im.crop((xs[x],ys[y],xs[x+1],ys[y+1])).resize((dx[x+1]-dx[x],dy[y+1]-dy[y]),Image.Resampling.LANCZOS),(dx[x],dy[y]))
 return out
def run():
 raw=E/'candidates/card-frame/round-02/candidate-01.png'; dst=E/'normalized/card-frame/round-02/candidate-01-resized.png'
 dst.parent.mkdir(parents=True,exist_ok=True)
 Image.open(raw).resize((640,400),Image.Resampling.LANCZOS).save(dst,optimize=True)
 report=dict(schemaVersion=2,rawSizePolicy='Raw >=640x400 and allowed aspect; exact target required for derived runtime asset',method=dict(checker='Heuristic gray visible pixels in outer 8%; not proof of absence',safeArea='Proportional safe area; interior luminance std and finite difference mean (no artificial crop-edge)',symbols='Semantic vision screening, human review required'),candidates=[check(raw,True),check(dst)],normalization=dict(operation='resize only; preserve generated alpha; NO background removal, masks, recolor or cleanup',sourceHash=sha(raw),outputHash=sha(dst)),approval=dict(technicalPassed=False,visualDirectionPassed=None,runtimeFitPassed=None,eligibleForProduction=False))
 report['approval']['rasterChecksPassed']=all(c['passed'] for c in report['candidates'])
 report['approval']['technicalPassed']=False
 report['approval']['technicalBlocker']='Visual nine-slice inspection: corner curvature extends beyond slice 22 and deforms under extreme stretch.'
 write(E/'reports/technical-check-round-02.json',report)
 if report['approval']['rasterChecksPassed']:
  im=Image.open(dst);sheet=Image.new('RGB',(1250,800),'#54283e');d=ImageDraw.Draw(sheet)
  sizes=[(484,270),(900,100),(100,600)];positions=[(20,40),(20,350),(1000,40)]
  corners=[]
  for size,pos in zip(sizes,positions):
   frame=nine(im,size);sheet.paste(frame,pos,frame);d.text((pos[0],pos[1]-20),str(size)+' / slice 22',fill='white')
   corners.append(all(frame.crop(b).tobytes()==im.crop(a).tobytes() for a,b in [((0,0,22,22),(0,0,22,22)),((618,0,640,22),(size[0]-22,0,size[0],22)),((0,378,22,400),(0,size[1]-22,22,size[1])),((618,378,640,400),(size[0]-22,size[1]-22,size[0],size[1]))]))
  sheet.save(E/'composites/nine-slice-round-02.png')
  write(E/'reports/nine-slice-round-02.json',dict(slice=22,sizes=sizes,cornersByteIdentical=corners,limitation='Fixed corner pixels do not prove all curvature fits inside slice; inspect seams visually.'))
 print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--import-original');args=p.parse_args()
 if args.import_original:
  target=E/'candidates/card-frame/round-02/candidate-01.png'
  if target.exists():raise SystemExit('Refusing to overwrite preserved original')
  shutil.copy2(args.import_original,target)
 run()
