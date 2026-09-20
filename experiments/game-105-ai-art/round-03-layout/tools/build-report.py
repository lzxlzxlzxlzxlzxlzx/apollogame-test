"""Rebuild frozen-layout composites twice; report dynamic images independently."""
import json,hashlib,subprocess,sys,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import numpy as np
D=Path(__file__).resolve().parents[1];E=D.parent;ROOT=E.parents[1]
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
cfg=read(D/'theme-round-03.json');runs=[read(D/f'measurements/run-{n}.json') for n in [1,2]]
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',18)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k!='screenshot'}
 if isinstance(x,list):return [clean(v) for v in x]
 if isinstance(x,float):return round(x,3)
 return x
def passes(r):
 labels=r['labels'];body=next((l['font'] for l in labels if l['id']=='g105-card-text'),0);aux=[l['font'] for l in labels if l['id'] in ['g105-card-kicker','g105-card-safety']]
 return r['areaPass'] and r['towerPass'] and r['statusPass'] and not r['outsideScreen'] and r['allControlsInside'] and r['allLabelsInside'] and body>=14 and all(f>=11 for f in aux) and (r['inputHeight'] is None or r['inputHeight']>=39.95) and r['minButtonWidth']>=43.95 and r['minButtonHeight']>=39.95 and not r['validation']
subprocess.run([sys.executable,str(D/'nine-slice/run.py')],check=True,capture_output=True)
builds=[]
for run in [1,2]:
 target=D/f'layouts/run-{run}';target.mkdir(exist_ok=True)
 for r in runs[0]['results']:
  if r.get('comparison'):continue
  name=f"{r['layout']}-{'expanded' if r['expanded'] else 'default'}-{r['width']}x{r['height']}"
  bg=Image.open(D/f'layouts/frozen-inputs/{name}-backdrop.png').convert('RGBA');card=Image.open(D/f'layouts/frozen-inputs/{name}-card.png').convert('RGBA')
  bg.alpha_composite(card,(math.floor(r['card']['x']),math.floor(r['card']['y'])));bg.convert('RGB').save(target/f'{name}.png')
 for w,h in [[1280,720],[1024,576],[800,450],[667,375],[390,844]]:
  sheet=Image.new('RGB',(w*2,(h+28)*2),'#302134');draw=ImageDraw.Draw(sheet)
  for i,name in enumerate(['A-default','B-default','C-default','C-expanded']):
   x=(i%2)*w;y=(i//2)*(h+28);draw.text((x+8,y+2),name,fill='white',font=font);sheet.paste(Image.open(target/f'{name}-{w}x{h}.png'),(x,y+28))
  sheet.save(target/f'comparison-{w}x{h}.png')
 hashes={p.name:sha(p) for p in sorted(target.glob('*.png'))};hashes['theme-round-03.json']=sha(D/'theme-round-03.json');builds.append(hashes);write(D/f'measurements/build-hashes-{run}.json',hashes)
comparisons=[]
for r in runs[0]['results']:
 if r.get('comparison'):continue
 comparisons.append({k:r[k] for k in ['layout','expanded','width','height','card','cardAreaRatio','towerOverlapArea','towerOverlapRatio','statusOverlapArea','minTextFont','inputHeight','minButtonWidth','minButtonHeight','visibleGameAreaRatio','gameViewportShare','allControlsInside','allLabelsInside','outsideScreen']}|{'passesProvisionalStandards':passes(r),'screenshot':r['screenshot']})
write(D/'reports/layout-comparison-round-03.json',{'recommended':'C','reason':'C collapsed and expanded meet all requested geometry/type/touch limits across the five sizes. Compact landscape form replaces three quick buttons with an existing Dropdown containing all three replies. A fails 667; B exceeds area budgets at 1024/800/667.','cases':comparisons,'limitsAssessment':{'reasonable':'No overflow, no status overlap, >=14px body, >=11px auxiliary and >=40px controls are useful baselines.','tradeoff':'Area limits alone can reward shrinking the game viewport. C expanded landscape reserves an observation viewport: game canvas occupies 42.68% at800 and34.09% at667. The tower is unobscured but smaller. Human evaluation must judge minimum acceptable tower size.','portrait':'Card uses screen pixels below the centered 16:9 scene, not a scaled desktop card. Native keyboard is unverified.','measurement':'Tower is a conservative calibrated default-camera envelope mapped through actual canvas rect; excludes detached blocks and arbitrary camera orbit. Zero overlap is not a guarantee for every dynamic tower pose.','visibleGameAreaRatio':'Fraction of actual canvas unobscured by card. gameViewportShare is actual canvas area / full screen, separately reported to expose viewport shrinkage.'}})
source=Image.open(E/'normalized/card-frame/round-02/candidate-01-resized.png').convert('RGB');pixels=np.array(source.crop((88,72,552,328)));paper=tuple(int(x) for x in np.median(pixels,axis=(0,1)))
def rgb(s):return [int(s[i:i+2],16) for i in (1,3,5)]
def luma(c):
 c=np.array(c)/255;c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4);return float(c@np.array([.2126,.7152,.0722]))
def contrast(a,b):
 x,y=sorted([luma(a),luma(b)]);return round((y+.05)/(x+.05),3)
themes={name:{'titleOnPaper':contrast(rgb(t['title']),paper),'bodyOnPaper':contrast(rgb(t['body']),paper),'auxOnPaper':contrast(rgb(t['aux']),paper),'placeholderOnInput':contrast(rgb(t['placeholder']),rgb(t['inputBg'])),'primaryTextOnButton':contrast(rgb(t['primaryText']),rgb(t['primaryBg'])),'secondaryTextOnButton':contrast(rgb(t['secondaryText']),rgb(t['secondaryBg'])),'disabledTextOnButton':contrast(rgb(t['disabledText']),rgb(t['disabledBg'])),'focusOnPaper':contrast(rgb(t['focus']),paper)} for name,t in cfg['themes'].items()}
write(D/'reports/readability-round-03.json',{'paperMedianRGB':paper,'method':'sRGB relative luminance contrast; median quiet-center paper sample, not per-glyph anti-aliased contrast; shadow excluded. Body/text threshold4.5, focus threshold3.','themes':themes,'recommended':'plum','plumPass':all(v>=4.5 for k,v in themes['plum'].items() if k!='focusOnPaper') and themes['plum']['focusOnPaper']>=3,'disabledDistinction':'Changed label + disabled state + dashed border + separate neutral color; not color alone.','softKeyboard':'not verified: no native mobile IME in headless desktop Chromium.'})
ns=read(D/'nine-slice/run-01/summary.json');write(D/'reports/technical-round-03.json',{'sourceUnchanged':sha(E/'normalized/card-frame/round-02/candidate-01-resized.png')==ns['sourceSha256'].upper(),'sourceSlice':49,'destinationFixedCornerWidth':24,'cornerUniformScale':24/49,'imageEdited':False,'normalUsePassed':True,'extremeGeometryPassed':True,'measurementReport':'nine-slice/run-01/summary.json','destination24Report':'nine-slice/run-01/slice-49-dest24.json','minimumSafeImageSize':{'oneToOne49':[114,114],'dest24':[64,64],'meaning':'conservative 16px center-span reserve, not experimentally proven mathematical minimum. All requested sizes were rendered. Full response UI needs larger sizes (desktop350x220,compact460x108,portrait366x220).'},'distinction':'At49→49, 100px short axis is below the conservative114px envelope, although the observed outline looks intact; do not call it a validated general-use size. At49→24, all five specified normal/extreme geometries pass visual and structure screening.','visualInspection':{'curves':'49 contains the45px alpha-contour transition;8/12/16/22/28 stretch part of the curve.','stroke':'dest24 colored-stroke proxy2–3px; slight source asymmetry remains.','highlight':'Long edges look continuous; small irregular bright fringes inherited from generation remain, especially in49→49.','seams':'No obvious breaks in49→24; RGB seam delta is heuristic and includes transparent RGB.','center':'Quiet flat cream, no visible stretched center pattern.'},'assetReusableForExperiment':True,'newGenerationRecommended':False,'formalApproval':False})
dynamic={p.name:{'run1':sha(p),'run2':sha(D/'screenshots/run-2'/p.name),'identical':sha(p)==sha(D/'screenshots/run-2'/p.name)} for p in sorted((D/'screenshots/run-1').glob('*.png')) if (D/'screenshots/run-2'/p.name).exists()}
rawMeasureHashes=[sha(D/f'measurements/run-{n}.json') for n in [1,2]]
write(D/'reports/reproducibility-round-03.json',{'completeRuntimeRuns':2,'nineSlice':read(D/'nine-slice/reproducibility.json'),'layoutAndThemeHashesRun1':builds[0],'layoutAndThemeHashesRun2':builds[1],'deterministicHashesStable':builds[0]==builds[1],'layoutMeasurementsEqualTo001px':clean(runs[0]['results'])==clean(runs[1]['results']),'rawMeasurementHashes':rawMeasureHashes,'dynamicScreenshots':dynamic,'interpretation':'Different dynamic screenshot hashes are expected evidence of real physics/animation and do not fail deterministic builds. Frozen-input layout composites reuse preserved run1 card/backdrop captures; they test reproducible composition, not a deterministic live simulation.'})
attempts=[read(D/f'measurements/collapse-{n}.json') if (D/f'measurements/collapse-{n}.json').exists() else [] for n in [1,2]]
write(D/'reports/runtime-round-03.json',{'runs':[{'run':n+1,'states':r['states'],'errors':r['errors']} for n,r in enumerate(runs)],'collapseSupplement':attempts,'softKeyboard':'not-verified','focusGeometry':'Focused input measured at all five C-expanded sizes without native software keyboard.','experimentalCardSchemaErrors':sum(len(r['validation']) for r in runs[0]['results']),'inheritedValidationNote':'Whole formal HUD yields5 existing Label custom-color enum complaints from catalog validator. Card subtree validates with0; production validator/source not changed.','notVerified':['Native mobile keyboard and viewport panning','Arbitrary camera orbit/dynamic lean overlap','Full-content card-pool wrapping and localization variants','Production integration and independent planning acceptance']})
before=read(D/'reports/formal-hashes-round-03-before.json');after={p:sha(ROOT/p) for p in before};write(D/'reports/formal-hashes-round-03-after.json',{'algorithm':'SHA256','before':before,'after':after,'unchanged':before==after,'perFileUnchanged':{p:before[p]==after[p] for p in before}})
assert before==after,'FORMAL FILE MUTATION';assert builds[0]==builds[1],'NONDETERMINISTIC COMPOSITES'
assert all(passes(r) for r in runs[0]['results'] if r['layout']=='C' and not r.get('comparison')),'RECOMMENDED LAYOUT REGRESSION'
print(json.dumps({'formalUnchanged':before==after,'compositesStable':builds[0]==builds[1],'measurementsStable':clean(runs[0]['results'])==clean(runs[1]['results']),'recommendedCPassesAll5Sizes':True,'contrast':themes},ensure_ascii=False))
