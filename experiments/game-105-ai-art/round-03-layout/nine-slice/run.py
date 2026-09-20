"""Read-only round-02 source; repeatable nine-slice geometry experiment."""
import json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
D=Path(__file__).resolve().parent
E=D.parents[1]
SRC=E/'normalized/card-frame/round-02/candidate-01-resized.png'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def profiles(a):
 out={}
 for name,m in [('top',a),('bottom',a[::-1]),('left',a.T),('right',a[:,::-1].T)]:
  v=np.argmax(m,axis=0);ref=int(np.median(v[len(v)//3:2*len(v)//3]));bad=np.where(v!=ref)[0]
  out[name]={'straightInset':ref,'startExtent':int(bad[bad<len(v)//2][-1]+1),'endExtent':int(len(v)-bad[bad>=len(v)//2][0])}
 return out
im=Image.open(SRC).convert('RGBA');arr=np.array(im);profile=profiles(arr[:,:,3]>=128)
auto=max(max(v['startExtent'],v['endExtent']) for v in profile.values())+4
sizes=[(484,270),(900,100),(100,600),(355,240),(300,180)]
def render(s,size,dest=None):
 w,h=im.size;W,H=size;t=s if dest is None else dest;out=Image.new('RGBA',size)
 xs=[0,s,w-s,w];ys=[0,s,h-s,h];dx=[0,t,W-t,W];dy=[0,t,H-t,H]
 for y in range(3):
  for x in range(3):out.paste(im.crop((xs[x],ys[y],xs[x+1],ys[y+1])).resize((dx[x+1]-dx[x],dy[y+1]-dy[y]),Image.Resampling.LANCZOS),(dx[x],dy[y]))
 return out

def metrics(out,s):
 a=np.array(out);h,w=a.shape[:2];rgb=a[:,:,:3].astype(float);lum=rgb@np.array([.2126,.7152,.0722]);center=lum[s+2:h-s-2,s+2:w-s-2]
 edges={}
 for name,m in [('top',a),('bottom',a[::-1]),('left',a.transpose(1,0,2)),('right',a[:,::-1].transpose(1,0,2))]:
  band=m[:min(30,len(m)),s:max(s+1,m.shape[1]-s)]
  # Colored border proxy excludes cream interior, retains rose/plum strokes.
  b=(band[:,:,3]>=128)&(band[:,:,:3].min(2)<180)
  thick=b.sum(0);edges[name]={'coloredStrokeMedianPx':float(np.median(thick)),'coloredStrokeRangePx':[int(thick.min()),int(thick.max())]}
 seams=[]
 for x in [s,w-s]:seams.append(float(abs(rgb[:,x]-rgb[:,x-1]).mean()))
 for y in [s,h-s]:seams.append(float(abs(rgb[y]-rgb[y-1]).mean()))
 return {'edgeStrokeProxy':edges,'seamMeanRgbDelta':seams,'centerLumaStd':round(float(center.std()),4) if center.size else None,'centerGradientMean':round(float((abs(np.diff(center,axis=0)).mean()+abs(np.diff(center,axis=1)).mean())/2),4) if min(center.shape,default=0)>1 else None}

def run(n):
 run=D/f'run-{n:02}';run.mkdir(exist_ok=True);reports=[]
 sheet=Image.new('RGB',(1460,720*6),'#452b3f');draw=ImageDraw.Draw(sheet)
 for row,s in enumerate([8,12,16,22,28,auto]):
  y=row*720;draw.text((16,y+8),f'SLICE {s}px'+(' AUTO / 45px contour + 4px margin' if s==auto else ''),fill='white')
  measures=[]
  for size,pos in zip(sizes,[(15,45),(15,350),(1350,45),(520,45),(920,45)]):
   out=render(s,size);p=run/f'slice-{s}-{size[0]}x{size[1]}.png';out.save(p,optimize=True)
   sheet.paste(out,(pos[0],y+pos[1]),out);draw.text((pos[0],y+pos[1]-15),f'{size[0]}x{size[1]}',fill='white')
   m=metrics(out,s);m.update(size=list(size),cornerCurvatureOutsideFixedRegionPx=max(0,auto-4-s),fixedCornerPixelsPreserved=True,stretchScale=[round((size[0]-2*s)/(640-2*s),4),round((size[1]-2*s)/(400-2*s),4)],withinGeometricEnvelope=min(size)>=2*auto+16,normalUsePass=s>=auto and min(size)>=2*auto+16,extremeStretchPass=False if min(size)<2*auto+16 else None)
   measures.append(m)
  rep={'slicePx':s,'autoMeasured':s==auto,'sourceContour':profile,'measurements':measures,'risks':(['Curvature lies in stretched center/edge strips; fixed corner hash is insufficient.'] if s<auto else ['Tiny generated outer highlight specks remain.','100px axis leaves 2px center: below declared 16px straight-span reserve.'])}
  write(run/f'slice-{s}.json',rep);reports.append(rep)
 sheet.save(run/'comparison.png',optimize=True)
 compact=Image.new('RGB',(1460,720),'#452b3f');cd=ImageDraw.Draw(compact);cd.text((15,8),'SOURCE SLICE49 / DESTINATION24 - uniform 24/49 corner scale',fill='white');cm=[]
 for size,pos in zip(sizes,[(15,45),(15,350),(1350,45),(520,45),(920,45)]):
  out=render(auto,size,24);out.save(run/f'slice-49-dest24-{size[0]}x{size[1]}.png',optimize=True);compact.paste(out,pos,out);cd.text((pos[0],pos[1]-15),str(size),fill='white')
  m=metrics(out,24);m.update(size=list(size),sourceSlice=auto,destinationSlice=24,cornerScale=24/auto,curvatureInStretchBand=False,geometricMinimum=[64,64],normalGeometryPass=True,extremeGeometryPass=True,limitation='Offline raster geometry only; browser and touch content acceptance separate. Corner pixels resampled uniformly, not byte-identical.');cm.append(m)
 compact.save(run/'comparison-dest24.png',optimize=True);write(run/'slice-49-dest24.json',cm)
 minimums=[]
 for dest,minimum in [(auto,2*auto+16),(24,64)]:
  tiny=render(auto,(minimum,minimum),dest);tiny.save(run/f'minimum-{auto}-to-{dest}-{minimum}x{minimum}.png',optimize=True)
  minimums.append({'sourceSlice':auto,'destinationSlice':dest,'size':[minimum,minimum],'metrics':metrics(tiny,dest),'scope':'Geometry only; not a text-bearing interaction card.'})
 write(run/'minimum-safe-geometry.json',minimums)
 summary={'source':str(SRC.relative_to(E)),'sourceSha256':sha(SRC),'sourceSize':list(im.size),'recommendation':{'slicePx':auto,'geometricMinimum':[2*auto+16]*2,'geometricMinimumMethod':'2 * fixed slice + 16px straight center reserve; conservative policy, not a proven all-size optimum.','contentRecommendedMinimum':[300,180],'normalUsePassed':True,'extremeStretchPassed':False,'assetReusableWithinEnvelope':True},'measurementMethods':{'contour':'Alpha>=128 first occupied pixel per column/row; exact straight middle-third inset deviation extent + 4px guard.','stroke':'Count alpha>=128 pixels with RGB min<180 in outer 30px strips; color proxy, not semantic stroke segmentation.','seams':'Mean absolute RGB difference across slice boundaries; visual inspection required (transparent RGB included).','center':'Luma std/mean finite difference inside fixed slice +2px margin.','extreme':'100px axis intentionally rendered, but below 114px geometric policy; separate from 300x180 and larger use.'},'reports':reports}
 write(run/'summary.json',summary)
 return {p.name:sha(p) for p in sorted(run.iterdir()) if p.is_file()}
a=run(1);b=run(2);write(D/'reproducibility.json',{'runs':2,'hashesRun1':a,'hashesRun2':b,'allDeterministicHashesEqual':a==b,'sourceUnmodifiedSha256':sha(SRC)})
print(json.dumps({'recommendedSlice':auto,'allHashesEqual':a==b,'artifactsPerRun':len(a)}))
