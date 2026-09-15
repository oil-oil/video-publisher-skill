import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../platforms/douyin.mjs',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
test('不依赖同步设置即可完成封面，复跑复用已验收回执',async()=>{
  const pkg={platformTitle:{douyin:'标题'},douyinDescription:'标题',douyinTopics:['AI工具'],cover:{uploadCustomCover:true,vertical3x4Path:'/v.png',horizontal4x3Path:'/h.png'}};
  const expected={};const calls=[];let complete=false;
  const run=new AsyncFunction('pkg','expectedReceipts','checkpointReceipts','typedBlocker','wait','probe','upload','repair',`${source}
    inspectDouyin=probe;uploadDouyinCoverSlot=upload;repairDelayedDouyinCoverReceipt=repair;
    return await mutateDouyin();`);
  const probe=async()=>({gates:{...Object.fromEntries(['draftIdentity','video','title','description','tags','noBlockingDialog'].map(k=>[k,{ok:true}])),settings:{ok:false},cover:{ok:complete,evidence:{urls:{portrait:[complete?'https://server/v':'https://server/default'],landscape:[complete?'https://server/h':'https://server/default']}}}}});
  const execute=()=>run(pkg,expected,()=>({ok:true}),(code,message)=>({code,message}),async()=>{},probe,async asset=>{calls.push(asset.slot);if(asset.slot==='landscape')complete=true;return {ok:true}},async()=>expected.cover?{ok:true,receipt:expected.cover}:{ok:false});
  for(let i=0;i<2;i++){const result=await execute();assert.equal(result.blocker,undefined);assert.equal(result.actions.settings,undefined);assert.equal(result.gates.cover.ok,true);assert.ok(result.receipts.cover.slots.portrait.afterUrl!==result.receipts.cover.slots.landscape.afterUrl);}
  assert.deepEqual(calls,['portrait','landscape']);
});
