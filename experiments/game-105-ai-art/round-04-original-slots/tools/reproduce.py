from pathlib import Path
import subprocess,sys,json,hashlib
B=Path(__file__).resolve().parents[1];runs=[]
for n in [1,2]:
 for script in ['analyze.py','deliver.py']:
  p=subprocess.run([sys.executable,str(B/'tools'/script)],capture_output=True,text=True,encoding='utf-8');assert p.returncode==0,p.stderr
 runs.append(json.loads((B/'reports/deterministic-hashes.json').read_text()))
dynamic={str(p.relative_to(B)):hashlib.sha256(p.read_bytes()).hexdigest().upper() for p in (B/'screenshots').rglob('*.png')}
result={'deterministicRuns':runs,'identical':runs[0]==runs[1],'filesPerRun':len(runs[0]),'dynamicScreenshotsCurrentHashes':dynamic,'dynamicNote':'actual game captures include live physics and animations; not asserted equal between separate gameplay sessions','generationNote':'AI generation is not deterministic; original files archived, not regenerated during builds'}
(B/'reports/reproducibility.json').write_text(json.dumps(result,indent=2)+'\n');assert result['identical'];print(json.dumps({'stable':result['identical'],'deterministicFiles':len(runs[0]),'dynamicEvidenceFiles':len(dynamic)}))
