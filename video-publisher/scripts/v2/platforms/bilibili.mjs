const bilibiliTitle = pkg.platformTitle.bilibili;
const bilibiliDescription = pkg.bilibiliDescription;
const bilibiliTags = pkg.bilibiliTags;
const bilibiliAllowedAutoTags = pkg.bilibiliAllowedAutoTags;
const bilibiliVideoName = videoPath.split('/').pop();
const bilibiliVideoStem = bilibiliVideoName.replace(/\.[^.]+$/,'');
const bilibiliCustomCover = pkg.cover?.uploadCustomCover === true;
const bilibiliCoverAssets = [
  {slot:'homepage-master',ratio:'4:3',path:String(pkg.cover?.horizontal4x3Path||''),editor:'#editor_4_3',key:'extra'},
  {slot:'personal-space',ratio:'16:9',path:String(pkg.cover?.horizontal16x9Path||''),editor:'#editor_16_9',key:'main'},
];

function bilibiliCoverRatioMatches(image, ratio) {
  const [width,height]=ratio.split(':').map(Number);
  return image?.width>0&&image?.height>0&&Math.abs(image.width/image.height-width/height)<0.01;
}

function bilibiliCoverReceiptMatches(asset, receipt, images) {
  return receipt?.assetPath===asset.path&&receipt.ratio===asset.ratio
    &&receipt.selectedFile?.name===path.basename(asset.path)
    &&receipt.selectedFile?.size===fs.statSync(asset.path).size
    &&receipt.previewProof?.slot===asset.slot&&receipt.previewProof.active===true
    &&receipt.previewProof.loaded===true&&receipt.previewProof.changed===true&&bilibiliCoverRatioMatches(receipt.previewProof,asset.ratio)
    &&(images||[]).some(image=>image.url===receipt.afterUrl&&image.source==='upload'
      &&image.origin===receipt.previewProof.url&&image.loaded&&bilibiliCoverRatioMatches(image,asset.ratio));
}

async function readBilibiliCoverImages() {
  return await js(String.raw`(()=>{
    const root=document.querySelector('.cover .cover-content');
    const card=root?.querySelector('.cover-module-main .cover-img');
    const cardUrl=getComputedStyle(card||document.body).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1]||'';
    const list=root?.__vue__?.$attrs?.['cover-list'];
    // Bind both model outputs to the visible primary card, never a PK cover.
    const matches=Array.isArray(list)?list.filter(item=>item.extra?.edited===cardUrl):[];
    const item=matches.length===1?matches[0]:null;
    const cache=window.__VP2_BILI_IMAGES__||(window.__VP2_BILI_IMAGES__={});
    const image=(value)=>{if(!value?.edited||!/^https:\/\//.test(value.edited))return [];const url=value.edited;if(!cache[url]){const i=new Image();cache[url]=i;i.src=url}const i=cache[url];return [{url,origin:value.origin||'',source:value.source||'',loaded:i.complete&&i.naturalWidth>0,width:i.naturalWidth,height:i.naturalHeight}]};
    return {'homepage-master':image(item?.extra),'personal-space':image(item?.main)};
  })()`);
}


async function inspectBilibili() {
  const state=await js(String.raw`((expectedName,expectedStem,expectedTitle,expectedDescription,requestedTags,allowedAutoTags) => {
    const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden'};const text=compact(document.body?.innerText||'');
    const titleInput=[...document.querySelectorAll('input')].find(el=>(el.placeholder||'').includes('稿件标题'));const title=String(titleInput?.value||'').trim();
    const desc=compact([...document.querySelectorAll('.ql-editor[contenteditable="true"],[contenteditable="true"]')].find(el=>/ql-editor/.test(String(el.className||'')))?.innerText||'');
    const chips=[...document.querySelectorAll('#tag-container .tag-pre-wrp .label-item-v2-container')].map(el=>compact(el.querySelector('.label-item-v2-content')?.innerText||el.innerText||el.textContent||'')).filter(Boolean);
    const requestedLower=requestedTags.map(tag=>String(tag).toLowerCase());const allowedLower=allowedAutoTags.map(tag=>String(tag).toLowerCase());const missing=requestedTags.filter(tag=>!chips.some(chip=>chip.toLowerCase()===String(tag).toLowerCase()));const duplicates=chips.filter((v,i)=>chips.findIndex(x=>x.toLowerCase()===v.toLowerCase())!==i);const malformed=chips.filter(v=>requestedTags.some(tag=>v.toLowerCase()===String(tag+tag).toLowerCase()));const unexpected=chips.filter(tag=>!requestedLower.includes(tag.toLowerCase())&&!allowedLower.includes(tag.toLowerCase()));
    const creationInput=String([...document.querySelectorAll('input')].find(el=>(el.placeholder||'').includes('创作声明'))?.value||'');
    const tagInput=[...document.querySelectorAll('input')].find(el=>(el.placeholder||'').includes('按回车键Enter创建标签'));
    const selected=[...document.querySelectorAll('li,div,span,p')].map(el=>({text:compact(el.innerText||el.textContent||''),cls:String(el.className||''),aria:el.getAttribute('aria-selected')})).filter(item=>item.text&&(/selected/i.test(item.cls)||item.aria==='true'));
    const noMark=/内容无需标注/.test(creationInput)||selected.some(item=>item.text==='内容无需标注');const selfMade=/内容为自制|未经作者允许，禁止转载/.test(creationInput)||selected.some(item=>/^内容为自制/.test(item.text)||/未经作者允许，禁止转载/.test(item.text));
    const anyUploaded=/上传完成/.test(text);const filenameVisible=text.includes(expectedName)||text.includes(expectedStem);const uploaded=anyUploaded&&filenameVisible;const uploading=/上传中|转码中|上传进度|\d{1,3}%/.test(text)&&!anyUploaded;const failed=/上传失败|网络错误/.test(text);
    const loginRequired=/扫码登录|请登录|登录后|安全验证|验证码/.test(text)&&!/发布视频|内容管理/.test(text);
    const restoreBanner=/本地浏览器存在.*未提交的视频|继续编辑/.test(text);const identityMatches=!restoreBanner&&(!anyUploaded||filenameVisible||title===expectedTitle);
    const coverRoot=document.querySelector('.cover .cover-content,.cover-content');
    const urls=[...(coverRoot?.querySelectorAll('.cover-img,img,[style]')||[])].flatMap(el=>{const values=[];if(el.src)values.push(el.src);const bg=getComputedStyle(el).backgroundImage;const match=bg.match(/url\(["']?([^"')]+)/);if(match)values.push(match[1]);return values}).filter(src=>/blob:|biliimg|archive\.biliimg/.test(src));
    const dialogs=[...document.querySelectorAll('[role="dialog"],.bcc-dialog,.bcc-modal,[class*="modal-mask"],[class*="dialog-mask"]')].map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {text:compact(el.innerText||el.textContent||'').slice(0,500),cls:String(el.className||''),w:r.width,h:r.height,display:s.display,visibility:s.visibility,opacity:s.opacity}}).filter(item=>item.w>20&&item.h>20&&item.display!=='none'&&item.visibility!=='hidden'&&!(/leave-active/.test(item.cls)&&Number(item.opacity)===0));
    const earlyMutation={ready:Boolean(visible(titleInput)&&visible(tagInput)),uploading,uploaded,controls:{title:visible(titleInput),tags:visible(tagInput)}};
    return {text:text.slice(0,3000),title,desc,chips,missing,duplicates:[...new Set(duplicates)],malformed:[...new Set(malformed)],unexpected:[...new Set(unexpected)],creationInput,noMark,selfMade,anyUploaded,uploaded,uploading,failed,filenameVisible,loginRequired,restoreBanner,identityMatches,coverUrls:[...new Set(urls)],dialogs,earlyMutation}
  })(${JSON.stringify(bilibiliVideoName)},${JSON.stringify(bilibiliVideoStem)},${JSON.stringify(bilibiliTitle)},${JSON.stringify(bilibiliDescription)},${JSON.stringify(bilibiliTags)},${JSON.stringify(bilibiliAllowedAutoTags)})`);
  const buttons=await inspectFinalButtons(/^立即投稿$/);const finalButton=buttons.find(button=>button.buttonish)||buttons[0]||null;const receipt=expectedReceipts.cover||null;
  const imagesBySlot=await readBilibiliCoverImages();
  const customCoverOk=bilibiliCustomCover&&bilibiliCoverAssets.every(asset=>bilibiliCoverReceiptMatches(asset,receipt?.slots?.[asset.slot],imagesBySlot[asset.slot]));
  const defaultCoverOk=!bilibiliCustomCover&&(/封面设置|更换封面|封面/.test(state.text));
  return {gates:{
    authenticated:state.loginRequired?failedGate({loginRequired:true}):okGate({url:PLATFORM_URLS.bilibili}),
    draftIdentity:state.identityMatches?okGate({filenameVisible:state.filenameVisible,title:state.title}):failedGate({foreign:true,title:state.title,expectedName:bilibiliVideoName}),
    video:state.uploaded&&!state.uploading&&!state.failed?okGate({filename:bilibiliVideoName,stable:true,anyUploaded:state.anyUploaded,filenameVisible:state.filenameVisible}):failedGate({uploaded:state.uploaded,uploading:state.uploading,failed:state.failed,restoreBanner:state.restoreBanner,anyUploaded:state.anyUploaded,filenameVisible:state.filenameVisible}),
    title:state.title===bilibiliTitle?okGate({expected:bilibiliTitle,actual:state.title}):failedGate({expected:bilibiliTitle,actual:state.title}),
    description:state.desc===compactText(bilibiliDescription)?okGate({expected:bilibiliDescription,actual:state.desc}):failedGate({expected:bilibiliDescription,actual:state.desc}),
    tags:state.missing.length===0&&state.malformed.length===0&&state.duplicates.length===0&&state.unexpected.length===0?okGate({requested:bilibiliTags,chips:state.chips,allowedAuto:bilibiliAllowedAutoTags}):failedGate({requested:bilibiliTags,chips:state.chips,missing:state.missing,malformed:state.malformed,duplicates:state.duplicates,unexpected:state.unexpected,allowedAuto:bilibiliAllowedAutoTags}),
    original:state.noMark&&state.selfMade?okGate({noMark:true,selfMade:true,inputValue:state.creationInput}):failedGate({noMark:state.noMark,selfMade:state.selfMade,inputValue:state.creationInput}),
    cover:customCoverOk||defaultCoverOk?okGate({custom:bilibiliCustomCover,urls:state.coverUrls,imagesBySlot,receipt}):failedGate({custom:bilibiliCustomCover,urls:state.coverUrls,imagesBySlot,receipt,reason:bilibiliCustomCover&&!receipt?'custom cover receipt missing':'cover not verified'}),
    noBlockingDialog:state.dialogs.length===0?okGate({active:[]}):failedGate({active:state.dialogs}),
    finalButton:finalButton&&!finalButton.disabled?okGate(finalButton):failedGate({buttons}),
  },evidence:{pageSample:state.text,earlyMutation:state.earlyMutation}};
}

async function resumeBilibiliLocalDraftIfPresent(){return await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const button=[...document.querySelectorAll('button,[role="button"],div,span')].find(el=>c(el.innerText||el.textContent||'')==='继续编辑'&&el.getBoundingClientRect().width>10);if(!button)return {ok:true,skipped:true};button.click();return {ok:true,clicked:true}})()`)}

async function activateBilibiliUploadLifecycle(){
  await cdp('Page.bringToFront',{});
  await cdp('Page.setWebLifecycleState',{state:'active'});
  await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
  return await js(String.raw`(() => ({url:location.href,readyState:document.readyState,visibilityState:document.visibilityState,hasFocus:document.hasFocus()}))()`);
}

async function exposeBilibiliVideoInput(){
  return await js(String.raw`(() => {
    const compact=value=>String(value||'').replace(/\s+/g,' ').trim();
    const videoLike=el=>/\.(mp4|flv|avi|wmv|mov|webm|mkv|m4v|ts|mpg|rmvb)\b/i.test(el.accept||'');
    for(const stale of document.querySelectorAll('#vp2-bili-video'))stale.removeAttribute('id');
    const input=[...document.querySelectorAll('.bcc-upload-wrapper input[type=file]')].find(videoLike);
    const evidence={url:location.href,readyState:document.readyState,visibilityState:document.visibilityState,hasFocus:document.hasFocus(),bodySample:compact(document.body?.innerText||'').slice(0,280)};
    if(!input)return {ok:false,reason:'bilibili video input missing',...evidence};
    input.id='vp2-bili-video';
    const parentRect=input.parentElement?.getBoundingClientRect();
    return {ok:true,selector:'#vp2-bili-video',accept:input.accept||'',parentWidth:Math.round(parentRect?.width||0),parentHeight:Math.round(parentRect?.height||0),...evidence};
  })()`);
}

async function waitForBilibiliUploadEntry(){
  const probes=[];
  let navigationAttempts=0;
  let restoreAttempts=0;
  for(let attempt=1;attempt<=24;attempt+=1){
    if(attempt===1||attempt%4===0)await activateBilibiliUploadLifecycle();
    const current=await inspectBilibili();
    const videoEvidence=current.gates.video.evidence||{};
    if(!current.gates.authenticated.ok){
      return {kind:'blocked',current,blocker:typedBlocker('AUTH_REQUIRED','B站登录状态失效',{requiresUser:true,evidence:current.gates.authenticated.evidence}),recovery:{attempt,navigationAttempts,restoreAttempts,probes:probes.slice(-8)}};
    }
    if(current.gates.video.ok)return {kind:'ready',current,recovery:{attempt,navigationAttempts,restoreAttempts,probes:probes.slice(-8)}};
    if(videoEvidence.restoreBanner){
      if(restoreAttempts<2){
        const resumed=await resumeBilibiliLocalDraftIfPresent();
        restoreAttempts+=1;
        probes.push({attempt,action:'resume_local_draft',ok:resumed.ok,clicked:resumed.clicked===true});
        if(!resumed.ok)return {kind:'blocked',current,blocker:typedBlocker('ACTION_FAILED',resumed.reason||'B站本地草稿恢复失败',{retryable:true,evidence:resumed}),recovery:{attempt,navigationAttempts,restoreAttempts,probes:probes.slice(-8)}};
      }
      await wait(2);
      continue;
    }
    if(!current.gates.draftIdentity.ok){
      return {kind:'blocked',current,blocker:typedBlocker('FOREIGN_DRAFT','B站当前编辑器属于其他视频草稿',{retryable:true,evidence:current.gates.draftIdentity.evidence}),recovery:{attempt,navigationAttempts,restoreAttempts,probes:probes.slice(-8)}};
    }
    if(videoEvidence.uploading===true)return {kind:'uploading',current,recovery:{attempt,navigationAttempts,restoreAttempts,probes:probes.slice(-8)}};
    let exposed=await exposeBilibiliVideoInput();
    if(exposed.ok&&(exposed.visibilityState!=='visible'||exposed.hasFocus!==true)){
      await activateBilibiliUploadLifecycle();
      exposed=await exposeBilibiliVideoInput();
    }
    probes.push({attempt,ok:exposed.ok,url:exposed.url,readyState:exposed.readyState,visibilityState:exposed.visibilityState,hasFocus:exposed.hasFocus,reason:exposed.reason||null});
    if(exposed.ok)return {kind:'input',current,exposed,recovery:{attempt,navigationAttempts,restoreAttempts,probes:probes.slice(-8)}};
    if(attempt===6&&navigationAttempts===0&&videoEvidence.anyUploaded!==true){
      navigationAttempts+=1;
      probes.push({attempt,action:'navigate_upload_url',url:PLATFORM_URLS.bilibili});
      await gotoAndWait(PLATFORM_URLS.bilibili,{timeout:45,settle:2});
      const guard=await armFinalPublishGuard();
      if(!guard.ok||!guard.armed){
        const currentAfterNavigation=await inspectBilibili();
        return {kind:'blocked',current:currentAfterNavigation,blocker:typedBlocker('INPUT_CHANNEL_BROKEN','B站定向恢复后无法重新挂载最终发布保护',{retryable:true,evidence:guard}),recovery:{attempt,navigationAttempts,restoreAttempts,probes:probes.slice(-8)}};
      }
      await activateBilibiliUploadLifecycle();
      await wait(2);
      continue;
    }
    await wait(2);
  }
  const current=await inspectBilibili();
  const recovery={attempt:24,navigationAttempts,restoreAttempts,probes:probes.slice(-8)};
  return {kind:'blocked',current,blocker:typedBlocker('SELECTOR_DRIFT','B站上传页在等待和一次定向恢复后仍未出现真实视频输入框',{retryable:true,evidence:recovery}),recovery};
}

async function waitBilibiliUploadCompletion(mode,entryRecovery=null){let stableSince=0;for(let i=0;i<180;i+=1){const current=await inspectBilibili();if(current.gates.video.ok){if(!stableSince)stableSince=Date.now();if(Date.now()-stableSince>=10000)return {...current,actions:{upload:{mode,entryRecovery}}}}else stableSince=0;await wait(5)}const after=await inspectBilibili();return {...after,actions:{upload:{mode,entryRecovery}},blocker:typedBlocker('UPLOAD_STALLED','B站视频没有在等待窗口内稳定完成',{retryable:true,evidence:after.gates.video.evidence})}}

async function waitForBilibiliUploadStart(){
  for(let attempt=1;attempt<=20;attempt+=1){
    const current=await inspectBilibili();
    if(current.gates.video.ok||current.gates.video.evidence?.uploading===true)return {ok:true,current,attempt};
    if(current.gates.video.evidence?.failed===true)return {ok:false,current,attempt,reason:'B站在文件注入后报告上传失败'};
    await wait(1);
  }
  const current=await inspectBilibili();
  return {ok:false,current,attempt:20,reason:'B站在文件注入后 20 秒内没有进入上传状态'};
}

async function uploadBilibili(){
  const entry=await waitForBilibiliUploadEntry();
  if(entry.kind==='blocked')return {...entry.current,uploadEntryRecovery:entry.recovery,blocker:entry.blocker};
  if(entry.kind==='ready')return {...entry.current,actions:{upload:{mode:'already_ready',entryRecovery:entry.recovery}}};
  if(entry.kind==='uploading')return await waitBilibiliUploadCompletion('resume_existing',entry.recovery);
  await activateBilibiliUploadLifecycle();
  const liveExposed=await exposeBilibiliVideoInput();
  if(!liveExposed.ok)return {...entry.current,uploadEntryRecovery:entry.recovery,blocker:typedBlocker('UPLOAD_NOT_STARTED',liveExposed.reason,{retryable:true,evidence:liveExposed})};
  try{await uploadFile(liveExposed.selector,videoPath)}catch(error){return {...entry.current,uploadEntryRecovery:entry.recovery,blocker:typedBlocker('UPLOAD_NOT_STARTED',String(error?.message||error),{retryable:true,evidence:liveExposed})}}
  const started=await waitForBilibiliUploadStart();
  if(!started.ok)return {...started.current,actions:{upload:{mode:'injected',entryRecovery:entry.recovery}},blocker:typedBlocker('UPLOAD_NOT_STARTED',started.reason,{retryable:true,evidence:{attempt:started.attempt,video:started.current.gates.video.evidence,liveExposed}})};
  return await waitBilibiliUploadCompletion('injected',entry.recovery);
}

async function waitBilibiliEarlyMutationReady(mode,entryRecovery=null){
  for(let attempt=1;attempt<=30;attempt+=1){
    const current=await inspectBilibili();
    if(!current.gates.authenticated.ok)return {...current,blocker:typedBlocker('AUTH_REQUIRED','B站登录状态失效',{requiresUser:true,evidence:current.gates.authenticated.evidence})};
    if(current.gates.video.ok)return {...current,actions:{upload:{mode,stage:'complete',earlyMutationReady:true,entryRecovery}}};
    if(current.gates.video.evidence?.failed===true)return {...current,blocker:typedBlocker('UPLOAD_NOT_STARTED','B站上传失败',{retryable:true,evidence:current.gates.video.evidence})};
    if(current.gates.video.evidence?.uploading===true&&current.evidence?.earlyMutation?.ready===true){
      return {...current,actions:{upload:{mode,stage:'editable_uploading',earlyMutationReady:true,entryRecovery}}};
    }
    await wait(1);
  }
  const after=await inspectBilibili();
  return {...after,blocker:typedBlocker('UPLOAD_NOT_STARTED','B站上传启动后标题与标签控件未及时就绪',{retryable:true,evidence:after.evidence?.earlyMutation})};
}

async function startBilibiliUpload(){
  const entry=await waitForBilibiliUploadEntry();
  if(entry.kind==='blocked')return {...entry.current,uploadEntryRecovery:entry.recovery,blocker:entry.blocker};
  if(entry.kind==='ready')return {...entry.current,actions:{upload:{mode:'already_ready',stage:'complete',earlyMutationReady:true,entryRecovery:entry.recovery}}};
  if(entry.kind==='uploading')return await waitBilibiliEarlyMutationReady('resume_existing',entry.recovery);
  await activateBilibiliUploadLifecycle();
  const liveExposed=await exposeBilibiliVideoInput();
  if(!liveExposed.ok)return {...entry.current,uploadEntryRecovery:entry.recovery,blocker:typedBlocker('UPLOAD_NOT_STARTED',liveExposed.reason,{retryable:true,evidence:liveExposed})};
  try{await uploadFile(liveExposed.selector,videoPath)}catch(error){return {...entry.current,uploadEntryRecovery:entry.recovery,blocker:typedBlocker('UPLOAD_NOT_STARTED',String(error?.message||error),{retryable:true,evidence:liveExposed})}}
  const started=await waitForBilibiliUploadStart();
  if(!started.ok)return {...started.current,actions:{upload:{mode:'injected',entryRecovery:entry.recovery}},blocker:typedBlocker('UPLOAD_NOT_STARTED',started.reason,{retryable:true,evidence:{attempt:started.attempt,video:started.current.gates.video.evidence,liveExposed}})};
  return await waitBilibiliEarlyMutationReady('injected',entry.recovery);
}

async function setBilibiliDescriptionV2(){return await js(String.raw`((value) => {const editor=[...document.querySelectorAll('.ql-editor[contenteditable="true"]')].find(el=>/ql-editor/.test(String(el.className||'')));if(!editor)return {ok:false,reason:'bilibili description editor missing'};editor.focus();const sel=window.getSelection(),range=document.createRange();range.selectNodeContents(editor);sel.removeAllRanges();sel.addRange(range);document.execCommand('delete',false);document.execCommand('insertText',false,value);editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));editor.dispatchEvent(new Event('change',{bubbles:true}));return {ok:String(editor.innerText||editor.textContent||'').replace(/\s+/g,' ').trim()===String(value).replace(/\s+/g,' ').trim(),actual:editor.innerText||''}})(${JSON.stringify(bilibiliDescription)})`)}

async function ensureBilibiliDeclarationV2(){const result=await js(String.raw`(() => {const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const input=[...document.querySelectorAll('input')].find(el=>(el.placeholder||'').includes('创作声明'));const select=input?.closest('.bcc-select');let noMark=false;const option=[...(select?.querySelectorAll('.bcc-option')||[])].find(el=>compact(el.innerText||el.textContent||'')==='内容无需标注');if(/内容无需标注/.test(input?.value||''))noMark=true;else if(select?.__vue__&&option?.__vue__?.selectOptionClick){option.__vue__.selectOptionClick();noMark=/内容无需标注/.test(input?.value||select.__vue__.selectedLabel||'')}else{(input?.closest('.bcc-select-input-wrap')||select||input)?.click();const visible=[...document.querySelectorAll('.bcc-option')].find(el=>compact(el.innerText||el.textContent||'')==='内容无需标注');visible?.click();noMark=/内容无需标注/.test(input?.value||'')}
const container=[...document.querySelectorAll('.creation-statement-container')].find(el=>compact(el.innerText||el.textContent||'').includes('内容为自制'));let selfMade=Boolean(container?.__vue__?.isAuthChecked);if(!selfMade&&typeof container?.__vue__?.handleAuthCheckboxClick==='function'){container.__vue__.handleAuthCheckboxClick({stopPropagation(){},preventDefault(){},target:container});selfMade=Boolean(container.__vue__.isAuthChecked)}if(!selfMade){const target=[...document.querySelectorAll('.auth-content,.option-text,label,span,div')].find(el=>compact(el.innerText||el.textContent||'').startsWith('内容为自制'));(target?.closest('label,[class*="radio"],[class*="check"],.auth-content')||target)?.click()}
return {ok:noMark&&(selfMade||Boolean(container?.__vue__?.isAuthChecked)),noMark,selfMade:Boolean(selfMade||container?.__vue__?.isAuthChecked)}})()`);await wait(1);const after=await inspectBilibili();return {...result,ok:after.gates.original.ok,evidence:after.gates.original.evidence}}

async function rebuildBilibiliTagsV2(){
  const removed=[];
  for(let pass=0;pass<12;pass+=1){const current=await inspectBilibili();const unexpected=current.gates.tags.evidence?.unexpected||[];if(!unexpected.length)break;const target=unexpected[0];const result=await js(String.raw`((target) => {const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const el=[...document.querySelectorAll('#tag-container .tag-pre-wrp .label-item-v2-container')].find(el=>compact(el.querySelector('.label-item-v2-content')?.innerText||el.innerText||el.textContent||'').toLowerCase()===String(target).toLowerCase());if(!el)return {ok:false,reason:'unexpected bilibili tag chip missing',target};if(typeof el.__vue__?.close==='function')el.__vue__.close();else{const close=el.querySelector('.close,[class*="close"],svg');if(!close)return {ok:false,reason:'bilibili tag close control missing',target};close.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}))}return {ok:true,target}})(${JSON.stringify(target)})`);if(!result.ok)return {ok:false,reason:result.reason,removed,evidence:current.gates.tags.evidence};removed.push(target);await wait(.8)}
  const attempts=[];
  for(const tag of bilibiliTags){
    let current=await inspectBilibili();
    if(current.gates.tags.evidence?.chips?.some(chip=>chip.toLowerCase()===tag.toLowerCase()))continue;
    let committed=false;
    for(let attempt=1;attempt<=2&&!committed;attempt+=1){
      const located=await js(String.raw`(() => {const input=[...document.querySelectorAll('input')].find(el=>(el.placeholder||'').includes('按回车键Enter创建标签'));if(!input)return {ok:false,reason:'bilibili tag input missing'};input.scrollIntoView({block:'center'});const r=input.getBoundingClientRect();return {ok:true,point:{x:r.left+r.width/2,y:r.top+r.height/2}}})()`);
      if(!located.ok){attempts.push({tag,attempt,...located});break}
      await click([located.point.x,located.point.y],{label:`focus bilibili tag ${tag}`}).catch(()=>{});
      const selection=await js(String.raw`(() => {const input=[...document.querySelectorAll('input')].find(el=>(el.placeholder||'').includes('按回车键Enter创建标签'));if(!input)return {ok:false};input.focus();const hadValue=Boolean(input.value);if(hadValue)input.select();return {ok:true,hadValue}})()`);
      if(selection.hadValue)await pressKey('Backspace').catch(()=>{});
      await cdp('Input.insertText',{text:tag}).catch(()=>{});
      await wait(.3);
      await pressKey('Enter').catch(()=>{});
      for(let poll=0;poll<20;poll+=1){
        await wait(.5);
        current=await inspectBilibili();
        committed=Boolean(current.gates.tags.evidence?.chips?.some(chip=>chip.toLowerCase()===tag.toLowerCase()));
        if(committed)break;
        const checking=await js(String.raw`(() => /标签正在请求校验中/.test(document.body.innerText||''))()`);
        if(!checking&&poll>=4)break;
      }
      attempts.push({tag,attempt,committed});
    }
    if(!committed)return {ok:false,reason:`bilibili tag did not persist: ${tag}`,removed,attempts,evidence:current.gates.tags.evidence};
  }
  const after=await inspectBilibili();
  return after.gates.tags.ok?{ok:true,removed,attempts}:{ok:false,reason:'bilibili tag set is not exact',removed,attempts,evidence:after.gates.tags.evidence};
}

async function uploadBilibiliCoverSlot(asset) {
  await activateBilibiliUploadLifecycle();
  const recovery=await js(String.raw`(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0};const dialogs=[...document.querySelectorAll('.bcc-dialog')].filter(e=>visible(e)&&/^检测到个人空间封面/.test(e.innerText.trim()));if(!dialogs.length)return {ok:true};if(dialogs.length!==1)return {ok:false,reason:'bilibili cover sync prompt ambiguous'};const buttons=[...dialogs[0].querySelectorAll('button')].filter(e=>e.textContent.trim()==='不同步，手动编辑'&&!e.disabled);if(buttons.length!==1)return {ok:false,reason:'bilibili manual cover edit control missing'};buttons[0].click();return {ok:true,recovered:true}})()`);
  if(!recovery.ok)return recovery;
  if(recovery.recovered)await wait(0.5);
  const opened=await js(String.raw`(()=>{
    const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'};
    const dialogs=[...document.querySelectorAll('.bcc-dialog')].filter(e=>visible(e)&&/封面制作/.test(e.innerText||''));
    if(dialogs.length===1)return {ok:true,alreadyOpen:true};
    const entries=[...document.querySelectorAll('.cover-module-main .cover-img,.cover-module-main .cover-empty')].filter(visible);
    if(entries.length!==1)return {ok:false,reason:'bilibili primary cover entry missing or ambiguous'};
    const target=entries[0].querySelector('.edit-text')||entries[0];target.click();return {ok:true};
  })()`);
  if(!opened.ok)return opened;
  let exposed=null;
  for(let i=0;i<20;i+=1){
    exposed=await js(String.raw`(()=>{
      const dialog=[...document.querySelectorAll('.bcc-dialog')].find(e=>e.getBoundingClientRect().width>20&&/封面制作/.test(e.innerText||''));
      const inputs=[...(dialog?.querySelectorAll('.cover-upload input[type=file]')||[])].filter(e=>/image/i.test(e.accept));
      if(inputs.length!==1)return {ok:false,reason:'bilibili scoped cover input missing or ambiguous'};
      inputs[0].id='vp2-bili-cover';return {ok:true,selector:'#vp2-bili-cover'};
    })()`);if(exposed.ok)break;await wait(0.5);
  }
  if(!exposed?.ok)return exposed;
  const sync=await js(String.raw`(()=>{const dialog=[...document.querySelectorAll('.bcc-dialog')].find(e=>e.getBoundingClientRect().width>20&&/封面制作/.test(e.innerText||''));const inputs=[...(dialog?.querySelectorAll('.sync-checkbox input[type=checkbox]')||[])];for(const input of inputs)if(input.checked)(input.closest('label')||input).click();return {ok:inputs.length===2&&inputs.every(i=>!i.checked)}})()`);
  if(!sync.ok)return {ok:false,reason:'bilibili dual-ratio sync could not be disabled'};
  await click(asset.editor,{label:'select bilibili cover slot'});
  let active=false;
  for(let i=0;i<12;i+=1){active=await js(`(()=>{const e=document.querySelector(${JSON.stringify(asset.editor)});return !!e?.parentElement.classList.contains('active')})()`);if(active)break;await wait(0.25)}
  if(!active)return {ok:false,reason:'bilibili requested cover slot did not become active',slot:asset.slot};
  const previousPreviewUrl=await js(String.raw`(()=>getComputedStyle(document.querySelector('.bcc-dialog .cover-upload .upload-area')).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1]||'')()`);
  await js(String.raw`(()=>{const input=document.querySelector('#vp2-bili-cover');input.value='';window.__VP2_BILI_SELECTED_FILE__=null;input.addEventListener('change',()=>{const f=input.files?.[0];window.__VP2_BILI_SELECTED_FILE__=f?{name:f.name,size:f.size,type:f.type}:null},{capture:true,once:true});return true})()`);
  try{await uploadFile(exposed.selector,asset.path)}catch(error){return {ok:false,reason:String(error?.message||error)}}
  const selectedFile=await js('window.__VP2_BILI_SELECTED_FILE__');
  if(selectedFile?.name!==path.basename(asset.path)||selectedFile?.size!==fs.statSync(asset.path).size)return {ok:false,reason:'bilibili requested cover file was not proven',selectedFile};
  let previewProof=null;
  for(let i=0;i<30;i+=1){
    previewProof=await js(String.raw`((selector,slot,previousUrl)=>{
      const e=document.querySelector(selector),dialog=e?.closest('.bcc-dialog');
      const url=getComputedStyle(dialog?.querySelector('.cover-upload .upload-area')||document.body).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1]||'';
      if(!url)return null;const cache=window.__VP2_BILI_IMAGES__||(window.__VP2_BILI_IMAGES__={});
      if(!cache[url]){const image=new Image();cache[url]=image;image.src=url};const image=cache[url];
      return {slot,changed:url!==previousUrl,active:!!e?.parentElement.classList.contains('active'),url,loaded:image.complete&&image.naturalWidth>0,width:image.naturalWidth,height:image.naturalHeight};
    })(${JSON.stringify(asset.editor)},${JSON.stringify(asset.slot)},${JSON.stringify(previousPreviewUrl)})`);
    if(previewProof?.changed&&previewProof.active&&previewProof.loaded&&bilibiliCoverRatioMatches(previewProof,asset.ratio))break;await wait(0.5);
  }
  if(!previewProof?.changed||!previewProof.active||!previewProof.loaded||!bilibiliCoverRatioMatches(previewProof,asset.ratio))return {ok:false,reason:'bilibili requested slot preview did not load at the expected ratio',previewProof};
  return {ok:true,receipt:{assetPath:asset.path,ratio:asset.ratio,selectedFile,previewProof}};
}

async function finishBilibiliCoverEditor(receipt) {
  const confirm=await js(String.raw`(()=>{const dialogs=[...document.querySelectorAll('.bcc-dialog')].filter(e=>e.getBoundingClientRect().width>20&&/封面制作/.test(e.innerText||''));const buttons=dialogs.flatMap(d=>[...d.querySelectorAll('.button.submit')]).filter(e=>e.textContent.trim()==='完成'&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');if(buttons.length!==1)return {ok:false,reason:'bilibili cover completion control missing'};buttons[0].id='vp2-bili-cover-confirm';return {ok:true}})()`);
  if(!confirm.ok)return confirm;
  let frameworkFallbackUsed=false;
  const frameworkConfirm=async()=>await js(String.raw`(()=>{const e=document.querySelector('.bcc-dialog #vp2-bili-cover-confirm');if(!e||e.textContent.trim()!=='完成'||e.disabled||e.getAttribute('aria-disabled')==='true'||e.getBoundingClientRect().width<20)return {ok:false};e.click();return {ok:true}})()`);
  try{await click('#vp2-bili-cover-confirm',{label:'confirm bilibili cover'})}catch(error){const result=await frameworkConfirm();frameworkFallbackUsed=result.ok;if(!result.ok)return {ok:false,reason:'bilibili scoped completion click failed'}}
  let images=null,closed=false;
  for(let i=0;i<60;i+=1){
    const current=await inspectBilibili();closed=current.gates.noBlockingDialog.ok;
    images=current.gates.cover.evidence?.imagesBySlot||{};
    const accepted=bilibiliCoverAssets.every(asset=>bilibiliCoverReceiptMatches(asset,{...receipt.slots[asset.slot],afterUrl:images[asset.slot]?.[0]?.url},images[asset.slot]));
    if(closed&&accepted){for(const asset of bilibiliCoverAssets){const image=images[asset.slot][0];receipt.slots[asset.slot].afterUrl=image.url;receipt.slots[asset.slot].acceptedImage=image}return {ok:true,frameworkFallbackUsed,receipt}}
    if(i===10&&!closed&&!frameworkFallbackUsed){const fallback=await frameworkConfirm();frameworkFallbackUsed=fallback.ok}
    await wait(0.5);
  }
  return {ok:false,reason:'bilibili cover editor or accepted dual-slot images did not settle',closed,images,receipt};
}

async function uploadBilibiliCoverV2() {
  if(!bilibiliCustomCover)return {ok:true,skipped:true};
  const receipt={slots:{...(!Array.isArray(expectedReceipts.cover?.slots)?expectedReceipts.cover?.slots||{}:{})}},actions=[];
  for(const asset of bilibiliCoverAssets){
    const images=await readBilibiliCoverImages();
    if(bilibiliCoverReceiptMatches(asset,receipt.slots[asset.slot],images[asset.slot]))continue;
    const result=await uploadBilibiliCoverSlot(asset);actions.push({slot:asset.slot,...result});
    if(!result.ok)return {...result,actions,receipt};
    receipt.slots[asset.slot]=result.receipt;expectedReceipts.cover=receipt;
    checkpointReceipts({...expectedReceipts,cover:receipt});
  }
  if(!actions.length)return {ok:true,actions,receipt};
  const confirmed=await finishBilibiliCoverEditor(receipt);
  return {...confirmed,actions};
}

async function ensureBilibiliEarlyMetadata(before){
  const actions={};
  if(!before.gates.title.ok)actions.title=await setNativeInputValue('input[placeholder*="稿件标题"]',bilibiliTitle);
  let current=await inspectBilibili();
  if(!current.gates.title.ok)return {ok:false,actions,current,blocker:typedBlocker('ACTION_FAILED','B站标题没有持久化',{evidence:current.gates.title.evidence})};
  if(!current.gates.tags.ok)actions.tags=await rebuildBilibiliTagsV2();
  if(actions.tags&&!actions.tags.ok){
    current=await inspectBilibili();
    return {ok:false,actions,current,blocker:typedBlocker('PLATFORM_REJECTED_METADATA',actions.tags.reason,{retryable:true,evidence:actions.tags})};
  }
  current=await inspectBilibili();
  return {ok:current.gates.title.ok&&current.gates.tags.ok,actions,current};
}

async function prefillBilibili(){
  const before=await inspectBilibili();
  if(!before.gates.authenticated.ok)return {...before,blocker:typedBlocker('AUTH_REQUIRED','B站登录状态失效',{requiresUser:true,evidence:before.gates.authenticated.evidence})};
  if(!before.gates.draftIdentity.ok)return {...before,blocker:typedBlocker('FOREIGN_DRAFT','B站当前编辑器属于其他视频草稿',{evidence:before.gates.draftIdentity.evidence})};
  const uploading=before.gates.video.evidence?.uploading===true;
  if(!before.gates.video.ok&&(!uploading||before.evidence?.earlyMutation?.ready!==true)){
    return {...before,blocker:typedBlocker('STATE_AMBIGUOUS','B站上传中的标题与标签控件尚未完整就绪',{retryable:true,evidence:before.evidence?.earlyMutation})};
  }
  const metadata=await ensureBilibiliEarlyMetadata(before);
  if(!metadata.ok)return {...metadata.current,actions:metadata.actions,blocker:metadata.blocker};
  return {...metadata.current,actions:{...metadata.actions,prefill:{completedDuringUpload:uploading}}};
}

async function mutateBilibili(){
  const before=await inspectBilibili();
  if(!before.gates.video.ok)return {...before,blocker:typedBlocker('STATE_AMBIGUOUS','B站没有可修复的已上传视频')};
  const actions={};
  const mutationBlockers=[];
  if(!before.gates.title.ok)actions.title=await setNativeInputValue('input[placeholder*="稿件标题"]',bilibiliTitle);
  if(!before.gates.description.ok)actions.description=await setBilibiliDescriptionV2();
  if(actions.description&&!actions.description.ok)return {...(await inspectBilibili()),blocker:typedBlocker('ACTION_FAILED',actions.description.reason)};
  if(!before.gates.original.ok)actions.declaration=await ensureBilibiliDeclarationV2();
  if(actions.declaration&&!actions.declaration.ok)return {...(await inspectBilibili()),blocker:typedBlocker('ACTION_FAILED','B站创作声明没有持久化',{evidence:actions.declaration})};
  if(!before.gates.tags.ok){
    actions.tags=await rebuildBilibiliTagsV2();
    if(!actions.tags.ok)mutationBlockers.push(typedBlocker('PLATFORM_REJECTED_METADATA',actions.tags.reason,{retryable:true,evidence:actions.tags}));
  }
  const receipts={};
  if(bilibiliCustomCover&&!before.gates.cover.ok){
    actions.cover=await uploadBilibiliCoverV2();
    if(actions.cover.receipt){receipts.cover=actions.cover.receipt;expectedReceipts.cover=receipts.cover}
    if(!actions.cover.ok)mutationBlockers.push(typedBlocker('PLATFORM_REJECTED_ASSET',actions.cover.reason,{retryable:true,evidence:actions.cover}));
    else{receipts.cover=actions.cover.receipt;expectedReceipts.cover=receipts.cover}
  }else if(bilibiliCustomCover){
    actions.cover={ok:true,skipped:true,reason:'already_verified'};
  }
  actions.receiptCheckpoint=checkpointReceipts(receipts);
  const after=await inspectBilibili();
  return {...after,actions,receipts,mutationBlockers,blocker:mutationBlockers[0]||null};
}

async function quarantineBilibili(){let before=await inspectBilibili();if(before.gates.video.evidence?.restoreBanner){const resumed=await resumeBilibiliLocalDraftIfPresent();if(!resumed.ok)return {...before,blocker:typedBlocker('ACTION_FAILED',resumed.reason)};await wait(4);before=await inspectBilibili();if(before.gates.draftIdentity.ok)return {...before,quarantine:{safeToUpload:true,resumedTarget:true}}}if(before.gates.draftIdentity.ok)return {...before,quarantine:{safeToUpload:!before.gates.video.ok,skipped:true}};const saved=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const button=[...document.querySelectorAll('button,[role="button"],div,span')].find(el=>c(el.innerText||el.textContent||'')==='存草稿'&&el.getBoundingClientRect().width>20);if(!button)return {ok:false,reason:'bilibili save-draft button missing'};button.click();return {ok:true}})()`);if(!saved.ok)return {...before,blocker:typedBlocker('ACTION_FAILED',saved.reason)};await wait(4);await gotoAndWait(PLATFORM_URLS.bilibili,{timeout:45,settle:2});await wait(3);const after=await inspectBilibili();const safe=!after.gates.video.ok&&after.gates.draftIdentity.ok;return {...after,quarantine:{safeToUpload:safe,saved:true},blocker:safe?null:typedBlocker('STATE_AMBIGUOUS','B站旧草稿保存后没有回到干净上传页',{retryable:true})}}

async function runPlatformPhase(){if(phase==='inspect'||phase==='verify')return await inspectBilibili();if(phase==='upload_start')return await startBilibiliUpload();if(phase==='prefill')return await prefillBilibili();if(phase==='upload')return await uploadBilibili();if(phase==='mutate')return await mutateBilibili();if(phase==='quarantine')return await quarantineBilibili();return {...(await inspectBilibili()),blocker:typedBlocker('ACTION_FAILED',`unsupported Bilibili phase: ${phase}`)}}
