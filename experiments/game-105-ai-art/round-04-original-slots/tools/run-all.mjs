import{spawnSync}from'node:child_process';import{writeFileSync}from'node:fs';
const base='experiments/game-105-ai-art/round-04-original-slots';const logs=[];
for(const variant of ['baseline','A','B','C','D']){
 let ok=false;
 for(let attempt=1;attempt<=2;attempt++){const p=spawnSync(process.execPath,[`${base}/tools/capture.mjs`,variant],{encoding:'utf8',timeout:150000});logs.push({variant,attempt,status:p.status,stdout:p.stdout,stderr:p.stderr});writeFileSync(`${base}/reports/capture-run-log.json`,JSON.stringify(logs,null,2));if(p.status===0){ok=true;break;}}
 console.log(JSON.stringify({variant,success:ok}));if(!ok)process.exit(1);
}
