import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../platforms/douyin.mjs',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const normalize=value=>String(value).replace(/^#/,'').replace(/\s+/g,'').toLowerCase();
function functionSource(name){
  const start=source.indexOf(`async function ${name}(`);
  assert.notEqual(start,-1);
  const next=source.indexOf('\nasync function ',start+1);
  return source.slice(start,next<0?undefined:next);
}

async function addFixture({exact=true,commit=true,grouped=false}={}){
  let committed=false,query='';
  const clicked=[],keys=[];
  const element=text=>({innerText:text,textContent:text,id:'',getBoundingClientRect:()=>({left:10,top:20,width:300,height:40}),removeAttribute(){this.id='';}});
  const button=element('#添加话题');
  button.getBoundingClientRect=()=>({left:10,top:20,width:80,height:30});
  button.scrollIntoView=()=>{};
  const wrong=element('#M4Pro芯片 10万人参与');
  const expected=element('#M4Pro 100人参与');
  const rows=exact?[wrong,expected]:[wrong];
  const group=element('#M4Pro 100人参与 #M4Pro芯片 10万人参与');
  group.querySelectorAll=()=>rows;
  const allRows=grouped?[group,...rows]:rows;
  const document={querySelectorAll(selector){
    if(selector==='[class*="mention-suggest-item-container"]')return grouped?[group]:rows;
    if(selector==='.mention-suggest-mount-dom')return grouped?[group]:[];
    if(selector==='#vp2-douyin-exact-topic')return allRows.filter(row=>row.id==='vp2-douyin-exact-topic');
    if(selector==='button,[role="button"],div,span')return [button];
    throw Error(`unexpected selector ${selector}`);
  }};
  const run=new AsyncFunction('js','inspectDouyin','focusDouyinEditorEnd','cdp','wait','click','inspectDouyinTrailingPlainText','removeDouyinTrailingTopicQuery','normalizeDouyinTopic','pressKey',`${functionSource('addDouyinTopic')}\nreturn addDouyinTopic('M4Pro');`);
  const result=await run(
    async expression=>vm.runInNewContext(expression,{document,getComputedStyle:()=>({display:'block',visibility:'visible'})}),
    async()=>({gates:{description:{ok:true},tags:{evidence:{selected:committed?['M4Pro']:[]}}}}),
    async()=>({ok:true}),
    async(_method,{text})=>{query+=text;},
    async()=>{},
    async target=>{
      if(Array.isArray(target)){query='#';return;}
      const row=allRows.find(row=>row.id===String(target).slice(1));
      assert.ok(row,'native selector must identify the exact observed suggestion');
      clicked.push(row.innerText);
      if(commit&&row===expected){committed=true;query='';}
    },
    async()=>({trimmed:query.trim()}),
    async()=>{query='';return {ok:true};},
    normalize,
    async key=>{keys.push(key);assert.ok(!['ArrowDown','Enter'].includes(key),'must not commit an unobserved first suggestion');},
  );
  return {result,clicked,keys};
}

test('通过真实精确候选元素提交，忽略名称相似的首条推荐',async()=>{
  const {result,clicked}=await addFixture();
  assert.equal(result.ok,true);
  assert.deepEqual(clicked,['#M4Pro 100人参与']);
});

test('容器包含多个推荐时必须定位单个精确选项，不能点击整组',async()=>{
  const {result,clicked}=await addFixture({grouped:true});
  assert.equal(result.ok,true);
  assert.deepEqual(clicked,['#M4Pro 100人参与']);
});

test('精确候选缺失时停止，不使用方向键提交近似话题',async()=>{
  const {result,clicked,keys}=await addFixture({exact:false});
  assert.equal(result.ok,false);
  assert.equal(clicked.length,0);
  assert.deepEqual(keys,[]);
});

test('精确候选点击未提交时不回退到首条推荐',async()=>{
  const {result,clicked,keys}=await addFixture({commit:false});
  assert.equal(result.ok,false);
  assert.ok(clicked.every(text=>text==='#M4Pro 100人参与'));
  assert.deepEqual(keys,[]);
});

test('只在标题、正文与目标草稿均匹配时重建错误话题',async()=>{
  let cleared=0;
  const run=new AsyncFunction('before','clearAndFillDouyinBody','douyinTopics','normalizeDouyinTopic','removeDouyinTrailingTopicQuery',`${functionSource('recoverDouyinTopicPrefix')}\nreturn recoverDouyinTopicPrefix(before);`);
  const before={gates:{draftIdentity:{ok:true},title:{ok:true},description:{ok:true},tags:{evidence:{selected:['MacBook'],entities:['macbook','m4pro芯片'],unexpected:['m4pro芯片']}}}};
  const clear=async()=>{cleared++;return {ok:true};};
  const recovered=await run(before,clear,['MacBook','M4Pro'],normalize,async()=>({ok:true}));
  assert.equal(recovered.ok,true);
  assert.equal(recovered.nextIndex,0);
  assert.equal(cleared,1);
  before.gates.description.ok=false;
  const rejected=await run(before,clear,['MacBook','M4Pro'],normalize,async()=>({ok:true}));
  assert.equal(rejected.ok,false);
  assert.equal(cleared,1);
});

test('多段正文通过原生全选删除，避免只删掉末尾一个话题',async()=>{
  let body='视频标题 #MacBook\n#m4pro芯片\n#m4pro芯片',allSelected=false;
  const keys=[];
  const run=new AsyncFunction('locateDouyinEditor','click','js','pressKey','wait','douyinDescription','focusDouyinEditorEnd','cdp',`${functionSource('clearAndFillDouyinBody')}\nreturn clearAndFillDouyinBody();`);
  const result=await run(
    async()=>({ok:true,selector:'#vp2-douyin-editor',text:body}),
    async selector=>assert.equal(selector,'#vp2-douyin-editor'),
    async()=>({ok:true}),
    async()=>{throw new Error('清空正文不能走会丢失框架选区的旧键盘通道');},
    async()=>{},'视频标题',async()=>({ok:true}),async(method,event)=>{
      if(method==='Input.insertText'){body+=event.text;return;}
      assert.equal(method,'Input.dispatchKeyEvent');keys.push(event.type+':'+event.key);
      if(event.commands?.includes('selectAll'))allSelected=true;
      if(event.type==='keyDown'&&event.key==='Backspace')body=allSelected?'':body.slice(0,-1);
    },
  );
  assert.equal(result.ok,true);
  assert.equal(body,'视频标题');
  assert.deepEqual(keys,['keyDown:a','keyUp:a','keyDown:Backspace','keyUp:Backspace']);
});
