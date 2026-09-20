from pathlib import Path
from PIL import Image,ImageOps
import numpy as np,json,hashlib
B=Path(__file__).resolve().parents[1]/'background';reports=[]
for k in 'ABC':
 p=B/'originals'/f'{k}.png';im=Image.open(p);im.load();a=np.asarray(im.convert('RGBA'));w,h=im.size;s=max(1376/w,768/h);crop=[(w-1376/s)/2,(h-768/s)/2];opaque=bool(a[:,:,3].min()==255)
 out=ImageOps.fit(im,(1376,768),method=Image.Resampling.LANCZOS,centering=(.5,.5));out=out.convert('RGB') if opaque else out;dest=B/'derived'/f'{k}.png';out.save(dest,optimize=True)
 report={'candidate':k,'original':{'size':[w,h],'mode':im.mode,'format':im.format,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest().upper(),'alphaMin':int(a[:,:,3].min()),'alphaMax':int(a[:,:,3].max()),'postProcessing':False,'iccProfile':bool(im.info.get('icc_profile'))},'derived':{'size':list(out.size),'format':'PNG','mode':out.mode,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest().upper(),'operation':'uniform center-cover resize/crop using Pillow ImageOps.fit LANCZOS; remove alpha only if fully opaque; no repaint/no color grade/no object removal','scale':s,'symmetricSourceCropEachSideXY':crop,'originalAspectRelativeError':abs(w/h/(1376/768)-1)},'checks':{'parse':True,'originalExactRequestedSize':[w,h]==[1376,768],'aspectWithin2Percent':abs(w/h/(1376/768)-1)<=.02,'opaque':opaque,'derivedDimensions':out.size==(1376,768),'derivedWithin4MiB':dest.stat().st_size<=4194304,'colorSpace':'unprofiled sRGB browser assumption'},'semanticChecks':{'textLogoWatermarkPeople':'none observed in visual inspection; human confirmation pending','foregroundTable':'no complete foreground table observed; background side cabinets remain'},'fileTechnicalPass':opaque and dest.stat().st_size<=4194304 and abs(w/h/(1376/768)-1)<=.02}
 reports.append(report)
(B/'reports/files.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(reports))
