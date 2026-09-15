import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../platforms/douyin.mjs', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const pkg = {platformTitle:{douyin:'视频标题'},douyinDescription:'视频标题',douyinTopics:['AI工具'],cover:{uploadCustomCover:false}};

async function inspectFixture({uploading=true,topicVisible=true}={}) {
  const rect=()=>({width:400,height:50});
  const title={placeholder:'填写作品标题',value:'视频标题',getBoundingClientRect:rect};
  const topic={innerText:'#添加话题',getBoundingClientRect:()=>({width:topicVisible?80:0,height:30})};
  const editor={innerText:'视频标题 #AI工具',className:'editor',getBoundingClientRect:rect,
    querySelectorAll:()=>[{innerText:'#AI工具'}],
    cloneNode:()=>({innerText:'视频标题',querySelectorAll:()=>[]})};
  const document={body:{innerText:uploading?'基础信息 上传过程中':'基础信息 上传成功'},querySelectorAll(selector){
    if(selector==='input')return [title];
    if(selector==='[contenteditable="true"], [contenteditable=""]')return [editor];
    if(selector==='button,[role="button"],div,span')return [topic];
    if(selector==='label'||selector==='div,span')throw new Error('不应查询同步控件');
    return [];
  }};
  const run=new AsyncFunction('pkg','js','expectedReceipts','inspectFinalButtons','okGate','failedGate',`const PLATFORM_URLS={douyin:'https://creator.douyin.com/'};\n${source}\nreturn await inspectDouyin();`);
  return run(pkg,async expression=>vm.runInNewContext(expression,{document,getComputedStyle:()=>({display:'block',visibility:'visible',backgroundImage:'none'})}),{},async()=>[{buttonish:true,disabled:false}],evidence=>({ok:true,evidence}),evidence=>({ok:false,evidence}));
}

test('没有同步控件时仍可进入上传中预填，但实际话题控件必须可用',async()=>{
  const result=await inspectFixture();
  assert.equal(result.evidence.earlyMutation.ready,true);
  assert.equal(result.gates.video.ok,false);
  assert.equal(result.gates.settings,undefined);
  assert.equal((await inspectFixture({topicVisible:false})).evidence.earlyMutation.ready,false);
});

test('上传完成的独立观察不再读取或报告同步设置状态',async()=>{
  const result=await inspectFixture({uploading:false});
  assert.equal(result.gates.video.ok,true);
  assert.equal(result.gates.title.ok,true);
  assert.equal(result.gates.tags.ok,true);
  assert.equal(result.gates.settings,undefined);
});
