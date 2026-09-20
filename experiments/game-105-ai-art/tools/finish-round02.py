"""Repeat deterministic artifact build twice and compare all four production hashes."""
import json, subprocess,sys
from pathlib import Path
from PIL import Image
from round02 import E,R,sha,write
P=E/'runtime-preview/round-02'
def composite():
 measurements=json.loads((P/'runtime-check-run-1.json').read_text(encoding='utf-8'))
 for item in measurements:
  if 'size' not in item:continue
  name=f"{item['mode']}-{item['size']['width']}x{item['size']['height']}"
  bg=Image.open(P/f'{name}-backdrop.png').convert('RGBA')
  card=Image.open(P/f'{name}-card-run-1.png').convert('RGBA')
  # Frozen browser-rendered real controls and a clean live-scene backdrop.
  # No synthetic text or omission of controls. This is OFFLINE, not a runtime shot.
  box=item['box'];bg.alpha_composite(card,(int(box['x']),int(box['y'])))
  bg.convert('RGB').save(E/f'composites/round-02-{name}.png')
def artifacts():
 paths=[E/'candidates/card-frame/round-02/candidate-01.png',E/'normalized/card-frame/round-02/candidate-01-resized.png',E/'reports/technical-check-round-02.json',E/'reports/nine-slice-round-02.json',E/'composites/nine-slice-round-02.png',*sorted((E/'composites').glob('round-02-*.png'))]
 return {str(p.relative_to(E)).replace('\\','/'):sha(p) for p in paths}
runs=[]
for n in [1,2]:
 result=subprocess.run([sys.executable,str(E/'tools/round02.py')],capture_output=True,text=True,check=True)
 composite();runs.append(artifacts())
 write(E/f'reports/artifact-hashes-round-02-run-{n}.json',runs[-1])
one=json.loads((P/'runtime-check-run-1.json').read_text(encoding='utf-8'));two=json.loads((P/'runtime-check-run-2.json').read_text(encoding='utf-8'))
screens={p.name:dict(run1=sha(p),run2=sha(P/p.name.replace('-run-1','-run-2')),stable=sha(p)==sha(P/p.name.replace('-run-1','-run-2'))) for p in sorted(P.glob('*-run-1.png')) if (P/p.name.replace('-run-1','-run-2')).exists()}
write(E/'reports/reproducibility-round-02.json',dict(deterministicArtifactHashesStable=runs[0]==runs[1],artifactCount=len(runs[0]),runtimeMeasurementsExactlyStable=one==two,runtimeScreenshots=screens,scope='Two deterministic builds use the same preserved generated original and frozen browser evidence. Image generation is not rerun and is not deterministic. Live physics screenshots are checked separately; unequal hashes are reported, never hidden.'))
before=json.loads((E/'reports/formal-hashes-round-02-before.json').read_text(encoding='utf-8-sig'))
after={p:sha(R/p) for p in before}
write(E/'reports/formal-hashes-round-02-after.json',dict(algorithm='SHA256',before=before,after=after,unchanged=before==after,perFileUnchanged={p:before[p]==after[p] for p in before}))
print(json.dumps(dict(deterministicHashesStable=runs[0]==runs[1],runtimeMeasurementsStable=one==two,formalUnchanged=before==after)))
