const bilibiliTitle = pkg.platformTitle.bilibili;
const bilibiliDescription = pkg.bilibiliDescription;
const bilibiliTags = pkg.bilibiliTags;
const bilibiliAllowedAutoTags = pkg.bilibiliAllowedAutoTags;
const bilibiliVideoName = videoPath.split('/').pop();
const bilibiliVideoStem = bilibiliVideoName.replace(/\.[^.]+$/,'');
const bilibiliCustomCover = pkg.cover?.uploadCustomCover === true;
const bilibiliCoverPath = String(pkg.cover?.horizontal4x3Path || '');

async function inspectBilibili() {
  const state=await js(String.raw`((expectedName,expectedStem,expectedTitle,expectedDescription,requestedTags,allowedAutoTags) => {
    const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden'};const text=compact(document.body.innerText||'');
    const title=String([...document.querySelectorAll('input')].find(el=>(el.placeholder||'').includes('稿件标题'))?.value||'').trim();
    const desc=compact([...document.querySelectorAll('.ql-editor[contenteditable="true"],[contenteditable="true"]')].find(el=>/ql-editor/.test(String(el.className||'')))?.innerText||'');
    const chips=[...document.querySelectorAll('#tag-container .tag-pre-wrp .label-item-v2-container')].map(el=>compact(el.querySelector('.label-item-v2-content')?.innerText||el.innerText||el.textContent||'')).filter(Boolean);
    const requestedLower=requestedTags.map(tag=>String(tag).toLowerCase());const allowedLower=allowedAutoTags.map(tag=>String(tag).toLowerCase());const missing=requestedTags.filter(tag=>!chips.some(chip=>chip.toLowerCase()===String(tag).toLowerCase()));const duplicates=chips.filter((v,i)=>chips.findIndex(x=>x.toLowerCase()===v.toLowerCase())!==i);const malformed=chips.filter(v=>requestedTags.some(tag=>v.toLowerCase()===String(tag+tag).toLowerCase()));const unexpected=chips.filter(tag=>!requestedLower.includes(tag.toLowerCase())&&!allowedLower.includes(tag.toLowerCase()));
    const creationInput=String([...document.querySelectorAll('input')].find(el=>(el.placeholder||'').includes('创作声明'))?.value||'');
    const selected=[...document.querySelectorAll('li,div,span,p')].map(el=>({text:compact(el.innerText||el.textContent||''),cls:String(el.className||''),aria:el.getAttribute('aria-selected')})).filter(item=>item.text&&(/selected/i.test(item.cls)||item.aria==='true'));
    const noMark=/内容无需标注/.test(creationInput)||selected.some(item=>item.text==='内容无需标注');const selfMade=/内容为自制|未经作者允许，禁止转载/.test(creationInput)||selected.some(item=>/^内容为自制/.test(item.text)||/未经作者允许，禁止转载/.test(item.text));
    const anyUploaded=/上传完成/.test(text);const filenameVisible=text.includes(expectedName)||text.includes(expectedStem);const uploaded=anyUploaded&&filenameVisible;const uploading=/上传中|转码中|上传进度|\d{1,3}%/.test(text)&&!anyUploaded;const failed=/上传失败|网络错误/.test(text);
    const loginRequired=/扫码登录|请登录|登录后|安全验证|验证码/.test(text)&&!/发布视频|内容管理/.test(text);
    const restoreBanner=/本地浏览器存在.*未提交的视频|继续编辑/.test(text);const identityMatches=!restoreBanner&&(!anyUploaded||filenameVisible||title===expectedTitle);
    const coverRoot=document.querySelector('.cover .cover-content,.cover-content');
    const urls=[...(coverRoot?.querySelectorAll('.cover-img,img,[style]')||[])].flatMap(el=>{const values=[];if(el.src)values.push(el.src);const bg=getComputedStyle(el).backgroundImage;const match=bg.match(/url\(["']?([^"')]+)/);if(match)values.push(match[1]);return values}).filter(src=>/blob:|biliimg|archive\.biliimg/.test(src));
    const dialogs=[...document.querySelectorAll('[role="dialog"],.bcc-dialog,.bcc-modal,[class*="modal-mask"],[class*="dialog-mask"]')].map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {text:compact(el.innerText||el.textContent||'').slice(0,500),cls:String(el.className||''),w:r.width,h:r.height,display:s.display,visibility:s.visibility,opacity:s.opacity}}).filter(item=>item.w>20&&item.h>20&&item.display!=='none'&&item.visibility!=='hidden'&&!(/leave-active/.test(item.cls)&&Number(item.opacity)===0));
    return {text:text.slice(0,3000),title,desc,chips,missing,duplicates:[...new Set(duplicates)],malformed:[...new Set(malformed)],unexpected:[...new Set(unexpected)],creationInput,noMark,selfMade,anyUploaded,uploaded,uploading,failed,filenameVisible,loginRequired,restoreBanner,identityMatches,coverUrls:[...new Set(urls)],dialogs}
  })(${JSON.stringify(bilibiliVideoName)},${JSON.stringify(bilibiliVideoStem)},${JSON.stringify(bilibiliTitle)},${JSON.stringify(bilibiliDescription)},${JSON.stringify(bilibiliTags)},${JSON.stringify(bilibiliAllowedAutoTags)})`);
  const buttons=await inspectFinalButtons(/^立即投稿$/);const finalButton=buttons.find(button=>button.buttonish)||buttons[0]||null;const receipt=expectedReceipts.cover||null;
  const customCoverOk=Boolean(bilibiliCustomCover&&receipt&&receipt.assetPath===bilibiliCoverPath&&receipt.ratio==='4:3'&&receipt.afterUrl&&state.coverUrls.includes(receipt.afterUrl));
  const defaultCoverOk=!bilibiliCustomCover&&(/封面设置|更换封面|封面/.test(state.text));
  return {gates:{
    authenticated:state.loginRequired?failedGate({loginRequired:true}):okGate({url:PLATFORM_URLS.bilibili}),
    draftIdentity:state.identityMatches?okGate({filenameVisible:state.filenameVisible,title:state.title}):failedGate({foreign:true,title:state.title,expectedName:bilibiliVideoName}),
    video:state.uploaded&&!state.uploading&&!state.failed?okGate({filename:bilibiliVideoName,stable:true}):failedGate({uploaded:state.uploaded,uploading:state.uploading,failed:state.failed,restoreBanner:state.restoreBanner}),
    title:state.title===bilibiliTitle?okGate({expected:bilibiliTitle,actual:state.title}):failedGate({expected:bilibiliTitle,actual:state.title}),
    description:state.desc===compactText(bilibiliDescription)?okGate({expected:bilibiliDescription,actual:state.desc}):failedGate({expected:bilibiliDescription,actual:state.desc}),
    tags:state.missing.length===0&&state.malformed.length===0&&state.duplicates.length===0&&state.unexpected.length===0?okGate({requested:bilibiliTags,chips:state.chips,allowedAuto:bilibiliAllowedAutoTags}):failedGate({requested:bilibiliTags,chips:state.chips,missing:state.missing,malformed:state.malformed,duplicates:state.duplicates,unexpected:state.unexpected,allowedAuto:bilibiliAllowedAutoTags}),
    original:state.noMark&&state.selfMade?okGate({noMark:true,selfMade:true,inputValue:state.creationInput}):failedGate({noMark:state.noMark,selfMade:state.selfMade,inputValue:state.creationInput}),
    cover:customCoverOk||defaultCoverOk?okGate({custom:bilibiliCustomCover,urls:state.coverUrls,receipt}):failedGate({custom:bilibiliCustomCover,urls:state.coverUrls,receipt,reason:bilibiliCustomCover&&!receipt?'custom cover receipt missing':'cover not verified'}),
    noBlockingDialog:state.dialogs.length===0?okGate({active:[]}):failedGate({active:state.dialogs}),
    finalButton:finalButton&&!finalButton.disabled?okGate(finalButton):failedGate({buttons}),
  },evidence:{pageSample:state.text}};
}

async function resumeBilibiliLocalDraftIfPresent(){return await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const button=[...document.querySelectorAll('button,[role="button"],div,span')].find(el=>c(el.innerText||el.textContent||'')==='继续编辑'&&el.getBoundingClientRect().width>10);if(!button)return {ok:true,skipped:true};button.click();return {ok:true,clicked:true}})()`)}

async function waitBilibiliUploadCompletion(mode){let stableSince=0;for(let i=0;i<180;i+=1){const current=await inspectBilibili();if(current.gates.video.ok){if(!stableSince)stableSince=Date.now();if(Date.now()-stableSince>=10000)return {...current,actions:{upload:{mode}}}}else stableSince=0;await wait(5)}const after=await inspectBilibili();return {...after,actions:{upload:{mode}},blocker:typedBlocker('UPLOAD_STALLED','B站视频没有在等待窗口内稳定完成',{retryable:true,evidence:after.gates.video.evidence})}}

async function uploadBilibili(){let before=await inspectBilibili();if(before.gates.video.ok)return {...before,actions:{upload:{mode:'already_ready'}}};if(before.gates.video.evidence?.restoreBanner){await resumeBilibiliLocalDraftIfPresent();await wait(3);before=await inspectBilibili();if(before.gates.video.ok)return {...before,actions:{upload:{mode:'already_ready'}}};}if(!before.gates.draftIdentity.ok)return {...before,blocker:typedBlocker('FOREIGN_DRAFT','B站当前编辑器属于其他视频草稿',{retryable:true,evidence:before.gates.draftIdentity.evidence})};if(before.gates.video.evidence?.uploading===true)return await waitBilibiliUploadCompletion('resume_existing');const exposed=await js(String.raw`(() => {const input=[...document.querySelectorAll('input[type=file]')].find(el=>/\.(mp4|flv|avi|wmv|mov|webm|mkv|m4v|ts|mpg|rmvb)\b/i.test(el.accept||''));if(!input)return {ok:false,reason:'bilibili video input missing'};input.id='vp2-bili-video';return {ok:true,selector:'#vp2-bili-video'}})()`);if(!exposed.ok)return {...before,blocker:typedBlocker('SELECTOR_DRIFT',exposed.reason)};try{await uploadFile(exposed.selector,videoPath)}catch(error){return {...before,blocker:typedBlocker('UPLOAD_NOT_STARTED',String(error?.message||error),{retryable:true})}}return await waitBilibiliUploadCompletion('injected')}

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

async function uploadBilibiliCoverV2(){
  if(!bilibiliCustomCover)return {ok:true,skipped:true};
  const before=(await inspectBilibili()).gates.cover.evidence?.urls||[];
  const opened=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const active=[...document.querySelectorAll('.bcc-dialog,.bcc-modal,[role="dialog"]')].find(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&/封面/.test(c(el.innerText||el.textContent||''))});if(active)return {ok:true,alreadyOpen:true};const target=[...document.querySelectorAll('button,[role="button"],div,span')].filter(el=>/^(更换封面|封面设置|上传封面)$/.test(c(el.innerText||el.textContent||''))&&el.getBoundingClientRect().width>8).sort((a,b)=>a.getBoundingClientRect().width*a.getBoundingClientRect().height-b.getBoundingClientRect().width*b.getBoundingClientRect().height)[0];if(!target)return {ok:false,reason:'bilibili cover entry missing'};target.click();return {ok:true}})()`);
  if(!opened.ok)return opened;
  await wait(2);
  const exposed=await js(String.raw`(() => {const input=[...document.querySelectorAll('.bcc-upload-wrapper input[type=file],input[type=file]')].find(el=>/image|png|jpe?g/i.test(el.accept||''));if(!input)return {ok:false,reason:'bilibili cover image input missing'};input.id='vp2-bili-cover';return {ok:true,selector:'#vp2-bili-cover'}})()`);
  if(!exposed.ok)return exposed;
  try{await uploadFile(exposed.selector,bilibiliCoverPath)}catch(error){return {ok:false,reason:String(error?.message||error)}}
  let confirmControl=null;
  for(let poll=0;poll<90&&!confirmControl;poll+=1){
    await wait(.5);
    confirmControl=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const active=[...document.querySelectorAll('.bcc-dialog,.bcc-modal,[role="dialog"]')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0});const candidates=active.flatMap(dialog=>[...dialog.querySelectorAll('.button.submit,button,[role="button"],div,span')]).filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return /^(完成|确定|保存|使用|应用)$/.test(c(el.innerText||el.textContent||''))&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&r.width>20&&r.height>15&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0}).map(el=>({el,r:el.getBoundingClientRect(),submit:/submit/.test(String(el.className||''))})).sort((a,b)=>Number(b.submit)-Number(a.submit)||(a.r.width*a.r.height-b.r.width*b.r.height));if(!candidates[0])return null;const el=candidates[0].el;el.id='vp2-bili-cover-confirm';return {selector:'#vp2-bili-cover-confirm',text:c(el.innerText||el.textContent||''),className:String(el.className||'')}})()`);
  }
  if(!confirmControl)return {ok:false,reason:'bilibili cover confirm missing'};
  let primaryClickError=null;
  let frameworkFallbackUsed=false;
  try{await click(confirmControl.selector,{label:'confirm bilibili cover'})}catch(error){
    primaryClickError=String(error?.message||error);
    const fallback=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const dialog=[...document.querySelectorAll('.bcc-dialog,.bcc-modal,[role="dialog"]')].find(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&/封面制作/.test(c(el.innerText||el.textContent||''))});const button=[...(dialog?.querySelectorAll('.button.submit')||[])].find(el=>c(el.innerText||el.textContent||'')==='完成'&&!el.disabled&&el.getAttribute('aria-disabled')!=='true');if(!button)return{ok:false};button.click();return{ok:true}})()`);
    if(!fallback.ok)return {ok:false,reason:`bilibili cover confirm click failed: ${primaryClickError}`,confirmControl};
    frameworkFallbackUsed=true;
  }
  let after=[];
  let dialogClosed=false;
  for(let poll=0;poll<60;poll+=1){
    await wait(.5);
    const state=await inspectBilibili();
    after=state.gates.cover.evidence?.urls||[];
    dialogClosed=state.gates.noBlockingDialog.ok;
    if(dialogClosed&&after.some(url=>/archive\.biliimg|biliimg/.test(url)))break;
    if(poll===10&&!dialogClosed){
      const fallback=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const dialog=[...document.querySelectorAll('.bcc-dialog,.bcc-modal,[role="dialog"]')].find(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&/封面制作/.test(c(el.innerText||el.textContent||''))});const button=[...(dialog?.querySelectorAll('.button.submit')||[])].find(el=>c(el.innerText||el.textContent||'')==='完成'&&!el.disabled&&el.getAttribute('aria-disabled')!=='true');if(!button)return{ok:false};button.click();return{ok:true}})()`);
      frameworkFallbackUsed=fallback.ok===true;
    }
  }
  const afterUrl=after.find(url=>!before.includes(url))||after.find(url=>/archive\.biliimg|biliimg/.test(url))||after[0];
  if(!dialogClosed)return {ok:false,reason:'bilibili cover editor did not close after confirmation',before,after,frameworkFallbackUsed};
  if(!afterUrl)return {ok:false,reason:'bilibili main cover did not expose CDN receipt',before,after};
  return {ok:true,frameworkFallbackUsed,primaryClickError,receipt:{assetPath:bilibiliCoverPath,ratio:'4:3',beforeUrls:before,afterUrl}};
}

async function mutateBilibili(){const before=await inspectBilibili();if(!before.gates.video.ok)return {...before,blocker:typedBlocker('STATE_AMBIGUOUS','B站没有可修复的已上传视频')};const actions={};if(!before.gates.title.ok)actions.title=await setNativeInputValue('input[placeholder*="稿件标题"]',bilibiliTitle);if(!before.gates.description.ok)actions.description=await setBilibiliDescriptionV2();if(actions.description&&!actions.description.ok)return {...(await inspectBilibili()),blocker:typedBlocker('ACTION_FAILED',actions.description.reason)};if(!before.gates.original.ok)actions.declaration=await ensureBilibiliDeclarationV2();if(actions.declaration&&!actions.declaration.ok)return {...(await inspectBilibili()),blocker:typedBlocker('ACTION_FAILED','B站创作声明没有持久化',{evidence:actions.declaration})};if(!before.gates.tags.ok){actions.tags=await rebuildBilibiliTagsV2();if(!actions.tags.ok)return {...(await inspectBilibili()),blocker:typedBlocker('PLATFORM_REJECTED_METADATA',actions.tags.reason,{retryable:true,evidence:actions.tags})}}const receipts={};if(bilibiliCustomCover){actions.cover=await uploadBilibiliCoverV2();if(!actions.cover.ok)return {...(await inspectBilibili()),blocker:typedBlocker('PLATFORM_REJECTED_ASSET',actions.cover.reason,{retryable:true,evidence:actions.cover})};receipts.cover=actions.cover.receipt;expectedReceipts.cover=receipts.cover}actions.receiptCheckpoint=checkpointReceipts(receipts);const after=await inspectBilibili();return {...after,actions,receipts}}

async function quarantineBilibili(){let before=await inspectBilibili();if(before.gates.video.evidence?.restoreBanner){const resumed=await resumeBilibiliLocalDraftIfPresent();if(!resumed.ok)return {...before,blocker:typedBlocker('ACTION_FAILED',resumed.reason)};await wait(4);before=await inspectBilibili();if(before.gates.draftIdentity.ok)return {...before,quarantine:{safeToUpload:true,resumedTarget:true}}}if(before.gates.draftIdentity.ok)return {...before,quarantine:{safeToUpload:!before.gates.video.ok,skipped:true}};const saved=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const button=[...document.querySelectorAll('button,[role="button"],div,span')].find(el=>c(el.innerText||el.textContent||'')==='存草稿'&&el.getBoundingClientRect().width>20);if(!button)return {ok:false,reason:'bilibili save-draft button missing'};button.click();return {ok:true}})()`);if(!saved.ok)return {...before,blocker:typedBlocker('ACTION_FAILED',saved.reason)};await wait(4);await gotoAndWait(PLATFORM_URLS.bilibili,{timeout:45,settle:2});await wait(3);const after=await inspectBilibili();const safe=!after.gates.video.ok&&after.gates.draftIdentity.ok;return {...after,quarantine:{safeToUpload:safe,saved:true},blocker:safe?null:typedBlocker('STATE_AMBIGUOUS','B站旧草稿保存后没有回到干净上传页',{retryable:true})}}

async function runPlatformPhase(){if(phase==='inspect'||phase==='verify')return await inspectBilibili();if(phase==='upload')return await uploadBilibili();if(phase==='mutate')return await mutateBilibili();if(phase==='quarantine')return await quarantineBilibili();return {...(await inspectBilibili()),blocker:typedBlocker('ACTION_FAILED',`unsupported Bilibili phase: ${phase}`)}}
