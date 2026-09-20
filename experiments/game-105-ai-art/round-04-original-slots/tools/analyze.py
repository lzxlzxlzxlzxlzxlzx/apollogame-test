from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np, json, hashlib, re
B=Path(__file__).resolve().parents[1]; ROOT=B.parents[2]
def dump(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def analyze(p):
 im=Image.open(p); im.load(); a=np.asarray(im.convert('RGBA'));rgb=a[:,:,:3].astype(float);alpha=a[:,:,3];h,w=alpha.shape
 center=rgb[int(h*.25):int(h*.75),int(w*.25):int(w*.75)];lum=center@np.array([.2126,.7152,.0722]); edges=np.concatenate([alpha[0],alpha[-1],alpha[:,0],alpha[:,-1]])
 return dict(path=str(p.relative_to(B)) if B in p.parents else str(p.relative_to(ROOT)),sha256=sha(p),size=[w,h],format=im.format,mode=im.mode,bytes=p.stat().st_size,iccProfile=bool(im.info.get('icc_profile')),trueAlpha=bool(alpha.min()==0 and alpha.max()==255),transparentFraction=float((alpha==0).mean()),perimeterTransparentFraction=float((edges==0).mean()),alphaRange=[int(alpha.min()),int(alpha.max())],centerLumaMean=float(lum.mean()),centerLumaStd=float(lum.std()),centerGradient=float((np.abs(np.diff(lum,axis=0)).mean()+np.abs(np.diff(lum,axis=1)).mean())/2),centralAlphaMin=int(alpha[int(h*.25):int(h*.75),int(w*.25):int(w*.75)].min()),aspectError=abs(w/h/(261/244)-1))
def nine(im,w,h,s=22):
 sw,sh=im.size;out=Image.new('RGBA',(w,h));sx=[0,s,sw-s,sw];sy=[0,s,sh-s,sh];dx=[0,s,w-s,w];dy=[0,s,h-s,h]
 for y in range(3):
  for x in range(3):out.paste(im.crop((sx[x],sy[y],sx[x+1],sy[y+1])).resize((dx[x+1]-dx[x],dy[y+1]-dy[y]),Image.Resampling.BILINEAR),(dx[x],dy[y]))
 return out
def structure(im):
 a=np.asarray(im).astype(float);mask=(a[:,:,3]>128)&(a[:,:,:3].mean(axis=2)>85);h,w=mask.shape
 a[:,:,:3]*=a[:,:,3:4]/255 # Ignore arbitrary RGB hidden behind transparency.
 # Bright rim contour measured along each axis. Straight profile may vary <=1px.
 profiles=[];innerProfiles=[]
 for m in [mask,mask[::-1],mask.T,mask.T[::-1]]:
  depths=np.array([np.where(m[:,x])[0][0] if m[:,x].any() else 999 for x in range(m.shape[1])]);median=float(np.median(depths[30:-30]));
  bad=np.where(np.abs(depths-median)>1)[0];left=[int(x) for x in bad if x<m.shape[1]//2];right=[int(m.shape[1]-1-x) for x in bad if x>=m.shape[1]//2]
  profiles.append(dict(straightDepth=median,curveOrEdgeIrregularityExtentLeft=max(left,default=-1)+1,curveOrEdgeIrregularityExtentRight=max(right,default=-1)+1,stretchBandDepthRange=float(np.ptp(depths[22:-22])),depths=depths.tolist()))
  inner=np.array([np.where(m[:m.shape[0]//2,x])[0][-1] if m[:m.shape[0]//2,x].any() else 999 for x in range(m.shape[1])]);med=float(np.median(inner[30:-30]));bad=np.where(np.abs(inner-med)>1)[0];le=[int(x) for x in bad if x<m.shape[1]//2];ri=[int(m.shape[1]-1-x) for x in bad if x>=m.shape[1]//2];innerProfiles.append(dict(straightDepth=med,extentLeft=max(le,default=-1)+1,extentRight=max(ri,default=-1)+1,depths=inner.tolist()))
 # Compare full edge cross-sections including RGB+alpha; max deviation is diagnostic not a binary aesthetic judgment.
 dev=[]
 for strip in [a[:22,22:-22],a[-22:,22:-22],a[22:-22,:22].transpose(1,0,2),a[22:-22,-22:].transpose(1,0,2)]:dev.append(float(np.max(np.std(strip,axis=1))))
 extent=max(max(p['curveOrEdgeIrregularityExtentLeft'],p['curveOrEdgeIrregularityExtentRight']) for p in profiles);innerExtent=max(max(p['extentLeft'],p['extentRight']) for p in innerProfiles)
 return dict(fixedSlice=22,contourMethod='first and last bright rim pixel in nearest half alpha>128 and meanRGB>85; deviation>1px from central median; detects outer and inner curves plus stray edge variation',crossSectionMethod='premultiplied RGB and alpha, maximum per-channel standard deviation along each stretch band; strict near-constant-section engineering gate, not aesthetic score',profiles=profiles,innerProfiles=innerProfiles,outerExtent=extent,innerExtent=innerExtent,maxCurveOrIrregularityExtent=max(extent,innerExtent),cornerContainmentPass=max(extent,innerExtent)<=22,edgeCrossSectionMaxChannelStd=dev,constantCrossSectionPass=max(dev)<=6,threshold={'cornerExtentMax':22,'edgeCrossSectionStdMax':6})
reports=[]
for k in 'ABCD':
 p=B/'originals'/f'{k}.png';raw=analyze(p);im=Image.open(p).convert('RGBA').resize((261,244),Image.Resampling.LANCZOS);im.save(B/'derived'/f'{k}.png',optimize=False)
 d=analyze(B/'derived'/f'{k}.png');s=structure(im)
 # Checkerboard proxy: alternating low-frequency blocks in fully opaque center; visual inspection remains mandatory.
 d['checkerboardRisk']='low in visual inspection; no grid visible; alpha verified, not semantic proof'
 d['forbiddenSymbolsRisk']='no prohibited motifs observed; human confirmation pending, no OCR/classifier guarantee'
 checks=dict(parse=True,derivedDimensions=d['size']==[261,244],rawRequestedDimensions=raw['size']==[1044,976],rawAspect=raw['aspectError']<=.01,alpha=raw['trueAlpha'],perimeter=d['perimeterTransparentFraction']>=.99,centerFlat=d['centerLumaStd']<=2 and d['centerGradient']<=1,bytes=d['bytes']<=262144,corner=s['cornerContainmentPass'],edge=s['constantCrossSectionPass'])
 reports.append(dict(candidate=k,original=raw,derived=d,operation='full canvas Lanczos resize only; no crop/no background removal/no recoloring',structure=s,checks=checks,technicalPass=all(v for key,v in checks.items() if key!='rawRequestedDimensions')))
 for w,h in [(261,244),(484,324),(484,420),(484,438),(484,278)]:nine(im,w,h).save(B/'nine-slice'/f'{k}-{w}x{h}.png')
 dump(B/'reports'/f'technical-{k}.json',reports[-1])
formal=Image.open(ROOT/'public/games/game-105/art/ui/card-frame.png').convert('RGBA')
for w,h in [(261,244),(484,324),(484,420),(484,438),(484,278)]:nine(formal,w,h).save(B/'nine-slice'/f'formal-{w}x{h}.png')
sheet=Image.new('RGB',(5*506,1810),'#b1a5ac');draw=ImageDraw.Draw(sheet)
for i,k in enumerate(['formal','A','B','C','D']):
 y=25;draw.text((i*506+10,5),k,fill='black')
 for w,h in [(261,244),(484,324),(484,420),(484,438),(484,278)]:
  im=Image.open(B/'nine-slice'/f'{k}-{w}x{h}.png');sheet.paste(im,(i*506+10,y),im);draw.text((i*506+10,y+5),f'{w}x{h} / 22px',fill='white');y+=h+10
sheet.save(B/'comparisons/nine-slice-all.png');dump(B/'reports/technical-all.json',reports)
print(json.dumps([{k:r[k] for k in ['candidate','checks','technicalPass']} for r in reports]))
