import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../platforms/wechat-channels.mjs', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const pkg = {wechatDescription:'封面测试', cover:{uploadCustomCover:true, vertical3x4Path:'/fixture/portrait.png', horizontal4x3Path:'/fixture/landscape.png'}};
const helpers = new Function('pkg', `${source}\nreturn {wechatCoverEditorDom,wechatCoverSelectionReady};`)(pkg);
const asset = {slot:'horizontal', ratio:'4:3', path:'/fixture/landscape.png', dialogTitle:'编辑分享卡片'};
const valid = {ok:true,previewUrl:'data:new',sourceWidth:1280,sourceHeight:960,cropWidth:400,cropHeight:300,sourceMatchesPreview:true,fullImageVisible:true};

test('旧预览、未选中的新图、错误比例和裁切溢出都不能确认', () => {
  assert.equal(Boolean(helpers.wechatCoverSelectionReady(valid,asset,'data:old')),true);
  for (const change of [
    {previewUrl:'data:old'}, {sourceWidth:960,sourceHeight:1280},
    {sourceMatchesPreview:false}, {fullImageVisible:false},
    {cropWidth:300,cropHeight:400}, {pending:'crop'},
  ]) assert.equal(Boolean(helpers.wechatCoverSelectionReady({...valid,...change},asset,'data:old')),false);
});

function fixture({hiddenOnly=false,missingInput=false,duplicate=false,crop=false,images=false,wrongPixels=false}={}) {
  const clicks=[];
  const element=(text,show=true)=>({textContent:text,innerText:text,disabled:false,className:'',getBoundingClientRect:()=>({width:show?400:0,height:show?300:0,left:0,top:0})});
  const dialog=element('编辑分享卡片 上传封面 取消 确认',!hiddenOnly);
  const input={accept:'image/png',closest:()=>dialog};
  const confirm={...element('确认'),closest:()=>dialog,click:()=>clicks.push('parent')};
  const cropDialog=element('裁剪封面图');
  const cropConfirm={...element('确定'),closest:()=>cropDialog,click:()=>clicks.push('crop')};
  cropDialog.querySelector=()=>({textContent:'裁剪封面图'});
  cropDialog.querySelectorAll=selector=>selector==='button,[role="button"]'?[cropConfirm]:[];
  dialog.contains=el=>el===cropDialog;
  dialog.querySelector=()=>({textContent:'编辑分享卡片'});
  const image={...element(''),closest:()=>dialog,complete:true,naturalWidth:960,naturalHeight:1280,src:'data:new',mockPixel:128};
  const canvas={...element(''),closest:()=>dialog,width:810,height:1080,mockPixel:wrongPixels?200:128};
  const viewport={...element(''),closest:()=>dialog};
  dialog.querySelectorAll=selector=>images&&selector==='.single-cover-uploader-wrap img'?[image]:images&&selector==='.crop-image-container canvas.cr-image'?[canvas]:images&&selector==='.crop-image-container .cr-viewport'?[viewport]:selector==='input[type=file]'?(missingInput?[]:[input]):selector==='button,[role="button"]'?[confirm]:[];
  const stale=element('编辑个人主页卡片 上传封面 取消 确认',false);
  stale.querySelector=()=>({textContent:'编辑个人主页卡片'});
  stale.querySelectorAll=()=>[{accept:'image/png',stale:true}];
  const dialogs=[stale,dialog,...(duplicate?[dialog]:[]),...(crop?[cropDialog]:[])];
  const document={createElement:()=>({getContext:()=>{let pixel;return {drawImage:source=>{pixel=source.mockPixel},getImageData:()=>({data:new Uint8ClampedArray([pixel,pixel,pixel,255])})}}}),querySelectorAll:selector=>selector==='.weui-desktop-dialog__wrp'?dialogs:selector==='input[type=file]'?[{stale:true}]:[]};
  const run=action=>vm.runInNewContext(`(${helpers.wechatCoverEditorDom.toString()})(${JSON.stringify({title:'编辑分享卡片',action})})`,{document,getComputedStyle:()=>({display:'block',visibility:'visible',opacity:1})});
  return {run,input,clicks};
}

test('只向当前可见编辑器的唯一 input 上传，禁止全页兜底',()=>{
  const active=fixture();assert.equal(active.run('input'),active.input);
  for(const options of [{hiddenOnly:true},{missingInput:true},{duplicate:true}])assert.equal(fixture(options).run('input'),null);
});

test('允许平台等比缩小裁剪源，但同画幅错误图片仍被像素检查拒绝',()=>{
  assert.equal(fixture({images:true}).run('inspect').sourceMatchesPreview,true);
  assert.equal(fixture({images:true,wrongPixels:true}).run('inspect').sourceMatchesPreview,false);
});

test('同图重试只有精确匹配本地文件字节才接受未变化的 data URL',()=>{
  const same={...valid,previewUrl:'data:image/png;base64,YQ=='};
  assert.equal(Boolean(helpers.wechatCoverSelectionReady(same,asset,same.previewUrl,'YQ==')),true);
  assert.equal(Boolean(helpers.wechatCoverSelectionReady(same,asset,same.previewUrl,'Yg==')),false);
});

test('裁剪弹窗出现时不能提前确认父编辑器',()=>{
  const f=fixture({crop:true});
  assert.equal(f.run('confirm').pending,'crop');assert.deepEqual(f.clicks,[]);
  assert.equal(f.run('advance').intermediate,'crop');assert.deepEqual(f.clicks,['crop']);
});

async function uploadFixture(states,{closed=true}={}) {
  const calls=[];
  const upload=new AsyncFunction('pkg','js','cdp','wait','read','inspect','fs',`${source}
    activateWechatLifecycle=async()=>{};
    readWechatCoverEditor=read;
    inspectWechatChannels=inspect;
    return await uploadWechatCover(wechatCoverAssets[1]);`);
  let reads=0,inspections=0;
  const result=await upload(pkg,async()=>({ok:true}),async(method,args)=>{
    if(method==='Runtime.evaluate')return {result:{objectId:'horizontal-input'}};
    calls.push({method,files:args.files});return {};
  },async()=>calls.push('wait'),async(_asset,action='inspect')=>{
    calls.push(action);
    if(action==='confirm')return {ok:true};
    if(action==='advance')return {ok:true,intermediate:'crop'};
    return states[Math.min(reads++,states.length-1)];
  },async()=>({gates:{cover:{evidence:{urlsBySlot:{horizontal:[inspections++?'https://server/new':'https://server/old']}}},noBlockingDialog:{ok:closed}}}),{readFileSync:()=>Buffer.from('local fixture')});
  return {result,calls};
}

test('生产上传流程等待当前新图选中后才确认，并传递横版精确路径',async()=>{
  const {result,calls}=await uploadFixture([{...valid,previewUrl:'data:old'},{...valid,previewUrl:'data:old'},{ok:true,pending:'crop'},valid]);
  assert.equal(result.ok,true);assert.equal(result.receipt.selectionVerified,true);
  assert.equal(result.receipt.ratio,'4:3');
  assert.deepEqual(calls.find(c=>c.method==='DOM.setFileInputFiles').files,['/fixture/landscape.png']);
  assert.ok(calls.indexOf('confirm')>calls.indexOf('advance'));
});

test('旧竖版预览持续存在时有限停止，不确认、不产生接受回执',async()=>{
  const {result,calls}=await uploadFixture([{...valid,previewUrl:'data:old'}]);
  assert.equal(result.ok,false);assert.equal(result.receipt,undefined);
  assert.equal(calls.includes('confirm'),false);assert.ok(calls.filter(c=>c==='wait').length<=40);
});

test('主卡片 URL 变化但编辑器未关闭时不产生回执',async()=>{
  const {result}=await uploadFixture([{...valid,previewUrl:'data:old'},valid],{closed:false});
  assert.equal(result.ok,false);assert.equal(result.receipt,undefined);
});

test('独立验证拒绝旧版 URL 回执和缺少任一画幅的选择证明',async()=>{
  const inspect=new AsyncFunction('pkg','expectedReceipts','expectedVideoReceipt','jobFingerprint','activeTaskSpace','js','inspectFinalButtons','PLATFORM_URLS','okGate','failedGate','compactText',`${source}\nreturn await inspectWechatChannels();`);
  const slots={vertical:{assetPath:pkg.cover.vertical3x4Path,ratio:'3:4',afterUrl:'https://server/v'},horizontal:{assetPath:pkg.cover.horizontal4x3Path,ratio:'4:3',afterUrl:'https://server/h'}};
  const state={identityMatches:true,uploaded:true,description:pkg.wechatDescription,shortTitle:'',originalEnabled:true,coverUrlsBySlot:{vertical:['https://server/v'],horizontal:['https://server/h']},coverUrls:[],dialogs:[]};
  const run=()=>inspect(pkg,{cover:{slots}},null,'test',{id:44},async()=>state,async()=>[{buttonish:true,disabled:false}],{wechat_channels:'https://example.test'},evidence=>({ok:true,evidence}),evidence=>({ok:false,evidence}),s=>s.trim());
  assert.equal((await run()).gates.cover.ok,false);
  Object.assign(slots.vertical,{selectionVerified:true,sourceWidth:960,sourceHeight:1280});
  assert.equal((await run()).gates.cover.ok,false);
  Object.assign(slots.horizontal,{selectionVerified:true,sourceWidth:1280,sourceHeight:960});
  assert.equal((await run()).gates.cover.ok,true);
  slots.horizontal.sourceWidth=960;
  assert.equal((await run()).gates.cover.ok,false);
});
