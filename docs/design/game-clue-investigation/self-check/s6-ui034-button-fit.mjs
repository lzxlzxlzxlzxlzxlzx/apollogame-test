// Authoring correction after real YaHei screenshot; no runtime imports.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const path='library/game-clue-investigation/manifest.json',bytes=readFileSync(path);
assert.equal(createHash('sha256').update(bytes).digest('hex'),'d3edf41aad60af2deea76a3a525b4be70dbe95dee876dcd4906547a00057986d');
const m=JSON.parse(bytes);
const visit=n=>{if(n.type==='Button')n.layout.padding=n.id==='ledger-title'?0:/^(lock|prints|letter)-(collect|return)$/.test(n.id)?{top:11,right:20,bottom:11,left:20}:{top:9,right:13,bottom:9,left:13};n.children?.forEach(visit);};visit(m.presentation.ui);
writeFileSync(path,JSON.stringify(m,null,2)+'\n');
