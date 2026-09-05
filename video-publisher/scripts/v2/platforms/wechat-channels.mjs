const wechatDescription = pkg.wechatDescription;
const wechatCustomCover = pkg.cover?.uploadCustomCover === true;
const wechatCoverAssets = [
  {slot:'vertical',ratio:'3:4',path:String(pkg.cover?.vertical3x4Path||''),wrap:'.vertical-cover-wrap',image:'img.vertical-img-size',dialogTitle:'编辑个人主页卡片'},
  {slot:'horizontal',ratio:'4:3',path:String(pkg.cover?.horizontal4x3Path||''),wrap:'.horizon-cover-wrap',image:'img.horizon-img-size',dialogTitle:'编辑分享卡片'},
];

async function inspectWechatChannels() {
  const uploadStartReceipt=expectedReceipts.uploadStart||null;
  const trustedVideoReceipt=Boolean(
    (expectedVideoReceipt?.fingerprint===jobFingerprint
      && Number(expectedVideoReceipt?.taskSpaceId)===Number(activeTaskSpace?.id)
      && ['injected','resume_existing'].includes(expectedVideoReceipt?.mode))
    || (uploadStartReceipt?.fingerprint===jobFingerprint
      && Number(uploadStartReceipt?.taskSpaceId)===Number(activeTaskSpace?.id)
      && ['injected','resume_existing'].includes(uploadStartReceipt?.mode))
  );
  const state=await js(String.raw`((expectedDescription, trustedVideoReceipt) => {
    const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden'};const text=compact(roots.map(root=>root.body?.innerText||root.host?.innerText||'').join('\n'));
    const descEditors=roots.flatMap(root=>[...root.querySelectorAll('[contenteditable="true"],[contenteditable=""],textarea')]).filter(visible).filter(el=>/input-editor|视频描述|editor/i.test(String(el.className||''))&&!/chatInput/.test(String(el.className||'')));
    const description=compact(descEditors[0]?.innerText||descEditors[0]?.value||descEditors[0]?.textContent||'');
    const shortInput=roots.flatMap(root=>[...root.querySelectorAll('input')]).find(el=>(el.placeholder||'').includes('短标题'));const shortTitle=String(shortInput?.value||'').trim();
    const initToast=/页面初始化中/.test(text);const coverCards=/封面预览/.test(text)&&/个人主页卡片|分享卡片/.test(text);const uploading=/上传中|正在上传|正在处理文件|处理中|生成中|剩余时间|上传进度|取消上传|(?:^|\s)\d{1,3}%(?:\s|$)/.test(text);const uploaded=coverCards&&!uploading;const failed=/上传失败|网络错误|文件格式不支持/.test(text);
    const loginRequired=/扫码登录|请登录|登录后|安全验证|验证码/.test(text)&&!/视频管理|发表动态/.test(text);const identityMatches=!uploaded||description===compact(expectedDescription)||trustedVideoReceipt;const identityAmbiguous=uploaded&&!description&&!trustedVideoReceipt;const identityForeign=uploaded&&!identityMatches&&!identityAmbiguous;
    const originalInput=roots.flatMap(root=>[...root.querySelectorAll('.declare-original-checkbox input[type="checkbox"],.form-item.post-with-link input.ant-checkbox-input')]).find(visible);const originalEnabled=Boolean(originalInput?.checked||/checked|active/.test(String(originalInput?.closest('.ant-checkbox')?.className||'')));
    const coverUrlsBySlot={vertical:roots.flatMap(root=>[...root.querySelectorAll('.vertical-cover-wrap img.vertical-img-size')]).map(el=>el.currentSrc||el.src||'').filter(Boolean),horizontal:roots.flatMap(root=>[...root.querySelectorAll('.horizon-cover-wrap img.horizon-img-size')]).map(el=>el.currentSrc||el.src||'').filter(Boolean)};const coverUrls=[...new Set([...coverUrlsBySlot.vertical,...coverUrlsBySlot.horizontal])];
    const dialogs=roots.flatMap(root=>[...root.querySelectorAll('[role="dialog"],[class*="modal"],.weui-desktop-dialog__wrp,[class*="dialog-mask"]')]).map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {text:compact(el.innerText||el.textContent||'').slice(0,500),cls:String(el.className||''),w:r.width,h:r.height,display:s.display,visibility:s.visibility,opacity:s.opacity}}).filter(item=>item.w>20&&item.h>20&&item.display!=='none'&&item.visibility!=='hidden'&&!/popover/i.test(item.cls)&&!(/leave-active/.test(item.cls)&&Number(item.opacity)===0));
    const videoInputs=roots.flatMap(root=>[...root.querySelectorAll('input[type=file]')]).filter(el=>/video/.test(el.accept||'')).map(el=>({accept:el.accept,files:el.files?.length||0}));
    const earlyMutation={ready:Boolean(visible(descEditors[0])&&visible(shortInput)),uploading,uploaded,controls:{description:visible(descEditors[0]),shortTitle:visible(shortInput)}};
    return {text:text.slice(0,3000),description,shortTitle,initToast,uploaded,uploading,failed,loginRequired,identityMatches,identityAmbiguous,identityForeign,trustedVideoReceipt,originalEnabled,originalFound:Boolean(originalInput),coverUrls,coverUrlsBySlot,dialogs,videoInputs,rootCount:roots.length,earlyMutation}
  })(${JSON.stringify(wechatDescription)}, ${JSON.stringify(trustedVideoReceipt)})`);
  const buttons=await inspectFinalButtons(/^发表$/);const finalButton=buttons.find(button=>button.buttonish)||buttons[0]||null;const receipt=expectedReceipts.cover||null;
  const customCoverOk=Boolean(wechatCustomCover&&receipt?.slots&&wechatCoverAssets.every(asset=>{const item=receipt.slots[asset.slot];return item?.assetPath===asset.path&&item?.ratio===asset.ratio&&item?.afterUrl&&(state.coverUrlsBySlot[asset.slot]||[]).includes(item.afterUrl)}));const defaultCoverOk=!wechatCustomCover&&state.uploaded;
  return {gates:{
    authenticated:state.loginRequired?failedGate({loginRequired:true}):okGate({url:PLATFORM_URLS.wechat_channels}),
    draftIdentity:state.identityMatches?okGate({description:state.description,trustedVideoReceipt:state.trustedVideoReceipt}):failedGate({foreign:state.identityForeign,ambiguous:state.identityAmbiguous,description:state.description,expected:wechatDescription}),
    video:state.uploaded&&!state.uploading&&!state.failed?okGate({stable:true,coverCards:true}):failedGate({uploaded:state.uploaded,uploading:state.uploading,failed:state.failed,initToast:state.initToast,videoInputs:state.videoInputs}),
    description:state.description===compactText(wechatDescription)?okGate({expected:wechatDescription,actual:state.description}):failedGate({expected:wechatDescription,actual:state.description}),
    shortTitle:state.shortTitle===''?okGate({actual:''}):failedGate({expected:'',actual:state.shortTitle}),
    original:state.originalEnabled?okGate({enabled:true}):failedGate({enabled:false,found:state.originalFound}),
    cover:customCoverOk||defaultCoverOk?okGate({custom:wechatCustomCover,urls:state.coverUrls,urlsBySlot:state.coverUrlsBySlot,receipt}):failedGate({custom:wechatCustomCover,urls:state.coverUrls,urlsBySlot:state.coverUrlsBySlot,receipt,reason:wechatCustomCover&&!receipt?'custom cover receipt missing':'cover not verified'}),
    noBlockingDialog:state.dialogs.length===0?okGate({active:[]}):failedGate({active:state.dialogs}),
    finalButton:finalButton&&!finalButton.disabled?okGate(finalButton):failedGate({buttons}),
  },evidence:{pageSample:state.text,initToast:state.initToast,rootCount:state.rootCount,earlyMutation:state.earlyMutation}};
}

async function getWechatUploadProbe(){return await js(String.raw`(() => {const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const text=compact(roots.map(root=>root.body?.innerText||root.host?.innerText||'').join('\n'));const input=roots.flatMap(root=>[...root.querySelectorAll('input[type=file]')]).find(el=>/video/.test(el.accept||''));const uploading=/上传中|正在上传|正在处理文件|处理中|生成中|剩余时间|上传进度|取消上传|(?:^|\s)\d{1,3}%(?:\s|$)/.test(text);const coverCards=/封面预览/.test(text)&&/个人主页卡片|分享卡片/.test(text);return {initToast:/页面初始化中/.test(text),hasInput:Boolean(input),uploading,uploaded:coverCards&&!uploading,sample:text.slice(0,1000)}})()`)}

async function activateWechatLifecycle(){await cdp('Page.bringToFront',{}).catch(()=>null);await cdp('Page.setWebLifecycleState',{state:'active'}).catch(()=>null);await cdp('Emulation.setFocusEmulationEnabled',{enabled:true}).catch(()=>null)}

async function waitWechatSdkReady(seconds){for(let i=0;i<seconds;i+=2){await activateWechatLifecycle();const probe=await getWechatUploadProbe();if(probe.uploaded||(!probe.initToast&&probe.hasInput))return {ok:true,probe};await wait(2)}return {ok:false,probe:await getWechatUploadProbe()}}

async function injectWechatVideo(){const evaluated=await cdp('Runtime.evaluate',{expression:String.raw`(() => {const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];return roots.flatMap(root=>[...root.querySelectorAll('input[type=file]')]).find(el=>/video/.test(el.accept||''))})()`,objectGroup:'video-publisher-v2-wechat',includeCommandLineAPI:true});const objectId=evaluated?.result?.objectId;if(!objectId)return {ok:false,reason:'wechat video input objectId missing'};await cdp('DOM.setFileInputFiles',{objectId,files:[videoPath]});return {ok:true,objectId}}

async function waitWechatUploadCompletion(){let stableSince=0;for(let i=0;i<180;i+=1){await activateWechatLifecycle();const current=await inspectWechatChannels();if(current.gates.video.ok){if(!stableSince)stableSince=Date.now();if(Date.now()-stableSince>=10000)return current}else stableSince=0;await wait(5)}const after=await inspectWechatChannels();return {...after,blocker:typedBlocker('UPLOAD_STALLED','视频号上传没有在等待窗口内稳定完成',{retryable:true,evidence:after.gates.video.evidence})}}

function trustedWechatUploadStartReceipt(){
  const receipt=expectedReceipts.uploadStart||null;
  return receipt?.fingerprint===jobFingerprint
    && Number(receipt?.taskSpaceId)===Number(activeTaskSpace?.id)
    && ['injected','resume_existing'].includes(receipt?.mode)
    ? receipt
    : null;
}

function createWechatUploadStartReceipt(mode){
  if(!jobFingerprint||activeTaskSpace?.id==null)return null;
  return {fingerprint:jobFingerprint,taskSpaceId:activeTaskSpace.id,mode,observedAt:new Date().toISOString()};
}

function completeWechatUploadStartObservation(current,mode,stage,receipt,fallbackDispatched=false){
  if(receipt)expectedReceipts.uploadStart=receipt;
  current.gates.draftIdentity=okGate({trustedUploadAction:true,mode,uploadStartReceipt:Boolean(receipt)});
  const receipts=receipt?{uploadStart:receipt}:{};
  const actions={upload:{mode,stage,earlyMutationReady:true,fallbackDispatched}};
  if(receipt)actions.receiptCheckpoint=checkpointReceipts(receipts);
  return {...current,actions,receipts};
}

async function dispatchWechatUploadChange(){
  return await js(String.raw`(() => {const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const input=roots.flatMap(root=>[...root.querySelectorAll('input[type=file]')]).find(el=>/video/.test(el.accept||''));if(input)input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));return {files:input?.files?.length||0}})()`);
}

async function waitWechatEarlyMutationReady(mode,receipt,allowFallback=false){
  if(receipt)expectedReceipts.uploadStart=receipt;
  let fallbackDispatched=false;
  for(let attempt=1;attempt<=30;attempt+=1){
    await activateWechatLifecycle();
    const current=await inspectWechatChannels();
    if(!current.gates.authenticated.ok)return {...current,blocker:typedBlocker('AUTH_REQUIRED','视频号登录状态失效',{requiresUser:true,evidence:current.gates.authenticated.evidence})};
    if(current.gates.video.ok)return completeWechatUploadStartObservation(current,mode,'complete',receipt,fallbackDispatched);
    if(current.gates.video.evidence?.failed===true)return {...current,blocker:typedBlocker('UPLOAD_NOT_STARTED','视频号上传失败',{retryable:true,evidence:current.gates.video.evidence})};
    if(current.gates.video.evidence?.uploading===true&&current.evidence?.earlyMutation?.ready===true){
      return completeWechatUploadStartObservation(current,mode,'editable_uploading',receipt,fallbackDispatched);
    }
    if(allowFallback&&attempt===4&&!fallbackDispatched){
      await dispatchWechatUploadChange();
      fallbackDispatched=true;
    }
    await wait(1);
  }
  const after=await inspectWechatChannels();
  return {...after,blocker:typedBlocker('UPLOAD_NOT_STARTED','视频号上传启动后描述与短标题控件未及时进入可编辑状态',{retryable:true,evidence:after.evidence?.earlyMutation})};
}

async function startWechatChannelsUpload(){
  const before=await inspectWechatChannels();
  if(!before.gates.draftIdentity.ok){
    const ambiguous=before.gates.draftIdentity.evidence?.ambiguous===true;
    return {...before,blocker:typedBlocker(ambiguous?'STATE_AMBIGUOUS':'FOREIGN_DRAFT',ambiguous?'视频号存在描述为空且来源无法证明的已上传草稿':'视频号当前编辑器属于其他视频草稿',{evidence:before.gates.draftIdentity.evidence})};
  }
  const existingReceipt=trustedWechatUploadStartReceipt();
  if(before.gates.video.ok){
    const mode=existingReceipt?.mode||'already_ready';
    return completeWechatUploadStartObservation(before,mode,'complete',existingReceipt,false);
  }
  if(before.gates.video.evidence?.uploading){
    const receipt=existingReceipt||createWechatUploadStartReceipt('resume_existing');
    return await waitWechatEarlyMutationReady('resume_existing',receipt,false);
  }
  let ready=await waitWechatSdkReady(30);
  if(!ready.ok){
    await gotoAndWait(PLATFORM_URLS.wechat_channels,{timeout:45,settle:2});
    const guard=await armFinalPublishGuard();
    if(!guard.ok||!guard.armed){
      const after=await inspectWechatChannels();
      return {...after,blocker:typedBlocker('INPUT_CHANNEL_BROKEN','视频号导航后无法重新挂载最终发布保护',{retryable:true,evidence:guard})};
    }
    ready=await waitWechatSdkReady(90);
  }
  if(!ready.ok){
    const after=await inspectWechatChannels();
    return {...after,blocker:typedBlocker('RISK_CONTROL','视频号 Wujie 上传 SDK 没有在激活页面生命周期后完成初始化',{retryable:true,evidence:ready.probe})};
  }
  const injected=await injectWechatVideo();
  if(!injected.ok)return {...before,blocker:typedBlocker('UPLOAD_NOT_STARTED',injected.reason,{retryable:true})};
  const receipt=createWechatUploadStartReceipt('injected');
  return await waitWechatEarlyMutationReady('injected',receipt,true);
}

async function uploadWechatChannels(){
  const started=await startWechatChannelsUpload();
  if(started.blocker)return started;
  const mode=started.actions?.upload?.mode||'already_ready';
  if(started.gates.video.ok)return {...started,actions:{...started.actions,upload:{mode}}};
  const current=await waitWechatUploadCompletion();
  if(current.gates.video.ok)current.gates.draftIdentity=okGate({trustedUploadAction:true,mode});
  return {...current,actions:{upload:{mode}},receipts:started.receipts||{}};
}

async function setWechatDescription(){return await js(String.raw`((value) => {const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const editor=roots.flatMap(root=>[...root.querySelectorAll('[contenteditable="true"],[contenteditable=""]')]).find(el=>/input-editor|视频描述|editor/i.test(String(el.className||''))&&!/chatInput/.test(String(el.className||'')));if(!editor)return {ok:false,reason:'wechat description editor missing'};editor.focus();const sel=window.getSelection(),range=document.createRange();range.selectNodeContents(editor);sel.removeAllRanges();sel.addRange(range);document.execCommand('delete',false);document.execCommand('insertText',false,value);editor.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:value}));editor.dispatchEvent(new Event('change',{bubbles:true,composed:true}));return {ok:compact(editor.innerText||editor.textContent||'')===compact(value),actual:editor.innerText||editor.textContent||''}})(${JSON.stringify(wechatDescription)})`)}

async function clearWechatShortTitle(){return await js(String.raw`(() => {const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const input=roots.flatMap(root=>[...root.querySelectorAll('input')]).find(el=>(el.placeholder||'').includes('短标题'));if(!input)return {ok:false,reason:'wechat short-title input missing'};const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter.call(input,'');input.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'deleteContentBackward'}));input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));return {ok:input.value===''}})()`)}

async function ensureWechatOriginal(){
  const result=await js(String.raw`(() => {const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden'};const input=roots.flatMap(root=>[...root.querySelectorAll('.declare-original-checkbox input[type="checkbox"],.form-item.post-with-link input.ant-checkbox-input')]).find(visible);if(!input)return {ok:false,reason:'wechat original checkbox missing'};if(!input.checked)(input.closest('label.ant-checkbox-wrapper')||input).click();return {ok:true,checked:input.checked}})()`);
  if(!result.ok)return result;
  await wait(1);
  const agreement=await js(String.raw`(() => {const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'};const dialog=roots.flatMap(root=>[...root.querySelectorAll('.weui-desktop-dialog__wrp,[role="dialog"],[class*="modal"]')]).find(el=>visible(el)&&/原创权益|原创声明须知/.test(el.innerText||el.textContent||''));if(!dialog)return {ok:true,modal:false};const input=[...dialog.querySelectorAll('input[type="checkbox"]')][0];if(input&&!input.checked)(input.closest('label')||input).click();return {ok:true,modal:true,agreementChecked:input?input.checked:true}})()`);
  if(!agreement.ok)return agreement;
  if(agreement.modal){
    await wait(1);
    const confirmed=await js(String.raw`(() => {const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'};const dialog=roots.flatMap(root=>[...root.querySelectorAll('.weui-desktop-dialog__wrp,[role="dialog"],[class*="modal"]')]).find(el=>visible(el)&&/原创权益|原创声明须知/.test(el.innerText||el.textContent||''));if(!dialog)return {ok:true,alreadyClosed:true};const button=[...dialog.querySelectorAll('button,[role="button"]')].find(el=>compact(el.innerText||el.textContent||'')==='声明原创'&&!el.disabled&&!/disabled/.test(String(el.className||'')));if(!button)return {ok:false,reason:'wechat original confirm missing or disabled'};button.click();return {ok:true,clicked:true}})()`);
    if(!confirmed.ok)return confirmed;
  }
  await wait(2);
  const after=await inspectWechatChannels();
  return {ok:after.gates.original.ok&&after.gates.noBlockingDialog.ok,evidence:{original:after.gates.original.evidence,dialogs:after.gates.noBlockingDialog.evidence}};
}

async function dismissWechatCoverEditor(){
  const dismissed=await js(String.raw`(() => {const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0};const coverDialog=el=>{const text=compact(el.innerText||el.textContent||'');return /编辑个人主页卡片|编辑分享卡片|编辑封面|裁剪封面图/.test(text)&&/上传封面|从视频中选择封面|裁剪封面图/.test(text)};const dialog=roots.flatMap(root=>[...root.querySelectorAll('.weui-desktop-dialog__wrp')]).find(el=>visible(el)&&coverDialog(el));if(!dialog)return {ok:true,dismissed:false};const button=[...dialog.querySelectorAll('button,[role="button"]')].find(el=>compact(el.innerText||el.textContent||'')==='取消'&&visible(el))||[...dialog.querySelectorAll('.weui-desktop-dialog__close-btn')].find(el=>el.getBoundingClientRect().width>0);if(!button)return {ok:false,reason:'wechat cover recovery button missing'};button.click();return {ok:true,dismissed:true}})()`);
  if(!dismissed.ok)return dismissed;
  for(let i=0;i<12;i+=1){await activateWechatLifecycle();const active=await js(String.raw`(() => {const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];return roots.flatMap(root=>[...root.querySelectorAll('.weui-desktop-dialog__wrp')]).some(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),text=compact(el.innerText||el.textContent||'');return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0&&/编辑个人主页卡片|编辑分享卡片|编辑封面|裁剪封面图/.test(text)&&/上传封面|从视频中选择封面|裁剪封面图/.test(text)})})()`);if(!active)return dismissed;await wait(1)}
  return {ok:false,reason:'wechat cover editor recovery did not close'};
}

async function uploadWechatCover(asset){
  if(!wechatCustomCover)return {ok:true,skipped:true};
  await activateWechatLifecycle();
  const before=(await inspectWechatChannels()).gates.cover.evidence?.urlsBySlot?.[asset.slot]||[];
  const opened=await js(String.raw`((selector) => {const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const entry=roots.flatMap(root=>[...root.querySelectorAll(selector+' .edit-btn')]).find(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden'});if(!entry)return {ok:false,reason:'wechat cover edit entry missing'};entry.click();return {ok:true}})(${JSON.stringify(asset.wrap)})`);
  if(!opened.ok)return opened;
  await wait(2);
  await activateWechatLifecycle();
  const evaluated=await cdp('Runtime.evaluate',{expression:String.raw`((title) => {const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0};const dialogs=roots.flatMap(root=>[...root.querySelectorAll('.weui-desktop-dialog__wrp')]).filter(visible);const dialog=dialogs.find(el=>String(el.innerText||el.textContent||'').includes(title))||dialogs.find(el=>{const text=compact(el.innerText||el.textContent||'');return /编辑封面/.test(text)&&/上传封面/.test(text)&&/取消/.test(text)&&/确认/.test(text)});return dialog?.querySelector('input[type=file][accept*="image"]')||roots.flatMap(root=>[...root.querySelectorAll('input[type=file]')]).find(el=>/image|png|jpe?g/i.test(el.accept||''))})(${JSON.stringify(asset.dialogTitle)})`,objectGroup:'video-publisher-v2-wechat-cover',includeCommandLineAPI:true});
  const objectId=evaluated?.result?.objectId;
  if(!objectId)return {ok:false,reason:'wechat cover image input objectId missing'};
  try{await cdp('DOM.setFileInputFiles',{objectId,files:[asset.path]})}catch(error){return {ok:false,reason:String(error?.message||error)}}
  let previewReady=false;
  for(let i=0;i<20;i+=1){await activateWechatLifecycle();previewReady=await js(String.raw`(() => {const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];return roots.flatMap(root=>[...root.querySelectorAll('.single-cover-uploader-wrap img')]).some(el=>/^(data:|blob:|https?:)/.test(el.currentSrc||el.src||''))})()`);if(previewReady)break;await wait(1)}
  if(!previewReady)return {ok:false,reason:'wechat custom cover preview did not become ready'};
  let confirmed={ok:false,reason:'wechat cover confirm missing or disabled'};
  for(let i=0;i<20;i+=1){await activateWechatLifecycle();confirmed=await js(String.raw`((title) => {const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const roots=[document,...[...document.querySelectorAll('*')].map(el=>el.shadowRoot).filter(Boolean)];const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0};const material=roots.flatMap(root=>[...root.querySelectorAll('button,[role="button"]')]).find(el=>compact(el.innerText||el.textContent||'')==='使用素材'&&visible(el)&&!el.disabled);if(material){material.click();return {ok:false,waiting:true,materialConfirmed:true}}const dialogs=roots.flatMap(root=>[...root.querySelectorAll('.weui-desktop-dialog__wrp')]).filter(visible);const crop=dialogs.find(el=>/裁剪封面图/.test(el.innerText||el.textContent||''));if(crop){const cropButton=[...crop.querySelectorAll('button,[role="button"]')].find(el=>compact(el.innerText||el.textContent||'')==='确定'&&visible(el)&&!el.disabled);if(cropButton){cropButton.click();return {ok:false,waiting:true,cropConfirmed:true}}}const dialog=dialogs.find(el=>String(el.innerText||el.textContent||'').includes(title))||dialogs.find(el=>{const text=compact(el.innerText||el.textContent||'');return /编辑封面/.test(text)&&/上传封面/.test(text)&&/取消/.test(text)&&/确认/.test(text)});const button=[...(dialog?.querySelectorAll('button,[role="button"]')||[])].find(el=>compact(el.innerText||el.textContent||'')==='确认'&&visible(el)&&!el.disabled&&!/disabled/.test(String(el.className||'')));if(!button)return {ok:false,waiting:true,reason:'wechat cover confirm not visible yet'};button.click();return {ok:true}})(${JSON.stringify(asset.dialogTitle)})`);if(confirmed.ok)break;await wait(1)}
  if(!confirmed.ok)return {ok:false,reason:confirmed.reason||'wechat cover confirm missing or disabled'};
  let after=[];let dialogClosed=false;
  for(let i=0;i<30;i+=1){await activateWechatLifecycle();const state=await inspectWechatChannels();after=state.gates.cover.evidence?.urlsBySlot?.[asset.slot]||[];dialogClosed=state.gates.noBlockingDialog.ok;if(after.some(url=>!before.includes(url))&&dialogClosed)break;await wait(1)}
  const afterUrl=after.find(url=>!before.includes(url));
  if(!afterUrl)return {ok:false,reason:`wechat ${asset.slot} cover card did not change`,before,after};
  if(!dialogClosed)return {ok:false,reason:'wechat vertical cover confirmation dialog did not close',before,after};
  return {ok:true,receipt:{assetPath:asset.path,ratio:asset.ratio,beforeUrls:before,afterUrl}};
}

async function ensureWechatEarlyMetadata(before){
  const actions={};
  if(!before.gates.description.ok)actions.description=await setWechatDescription();
  if(actions.description&&!actions.description.ok){
    const current=await inspectWechatChannels();
    return {ok:false,actions,current,blocker:typedBlocker('ACTION_FAILED',actions.description.reason)};
  }
  let current=await inspectWechatChannels();
  if(!current.gates.shortTitle.ok)actions.shortTitle=await clearWechatShortTitle();
  current=await inspectWechatChannels();
  if(!current.gates.description.ok||!current.gates.shortTitle.ok){
    return {ok:false,actions,current,blocker:typedBlocker('ACTION_FAILED','视频号描述或短标题没有持久化',{evidence:{description:current.gates.description.evidence,shortTitle:current.gates.shortTitle.evidence}})};
  }
  return {ok:true,actions,current};
}

async function prefillWechatChannels(){
  const before=await inspectWechatChannels();
  if(!before.gates.authenticated.ok)return {...before,blocker:typedBlocker('AUTH_REQUIRED','视频号登录状态失效',{requiresUser:true,evidence:before.gates.authenticated.evidence})};
  if(!before.gates.draftIdentity.ok)return {...before,blocker:typedBlocker(before.gates.draftIdentity.evidence?.ambiguous?'STATE_AMBIGUOUS':'FOREIGN_DRAFT','视频号无法证明当前草稿属于本任务',{evidence:before.gates.draftIdentity.evidence})};
  const uploading=before.gates.video.evidence?.uploading===true;
  if(!before.gates.video.ok&&(!uploading||before.evidence?.earlyMutation?.ready!==true)){
    return {...before,blocker:typedBlocker('STATE_AMBIGUOUS','视频号上传中的描述与短标题控件尚未完整就绪',{retryable:true,evidence:before.evidence?.earlyMutation})};
  }
  const metadata=await ensureWechatEarlyMetadata(before);
  if(!metadata.ok)return {...metadata.current,actions:metadata.actions,blocker:metadata.blocker};
  return {...metadata.current,actions:{...metadata.actions,prefill:{completedDuringUpload:uploading}}};
}

async function mutateWechatChannels(){let before=await inspectWechatChannels();if(!before.gates.draftIdentity.ok)return {...before,blocker:typedBlocker(before.gates.draftIdentity.evidence?.ambiguous?'STATE_AMBIGUOUS':'FOREIGN_DRAFT','视频号无法证明当前已上传草稿属于本任务',{evidence:before.gates.draftIdentity.evidence})};if(!before.gates.video.ok)return {...before,blocker:typedBlocker('STATE_AMBIGUOUS','视频号没有可修复的已上传视频')};const actions={};if(!before.gates.noBlockingDialog.ok&&before.gates.noBlockingDialog.evidence?.active?.some(item=>/编辑个人主页卡片|编辑分享卡片|裁剪封面图/.test(item.text||''))){actions.coverRecovery=await dismissWechatCoverEditor();if(!actions.coverRecovery.ok)return {...(await inspectWechatChannels()),blocker:typedBlocker('STATE_AMBIGUOUS',actions.coverRecovery.reason,{retryable:true,evidence:actions.coverRecovery})};before=await inspectWechatChannels()}if(!before.gates.noBlockingDialog.ok)return {...before,blocker:typedBlocker('STATE_AMBIGUOUS','视频号存在未识别的阻塞弹窗',{retryable:true,evidence:before.gates.noBlockingDialog.evidence})};const metadata=await ensureWechatEarlyMetadata(before);Object.assign(actions,metadata.actions);if(!metadata.ok)return {...metadata.current,actions,blocker:metadata.blocker};before=metadata.current;actions.original=await ensureWechatOriginal();if(!actions.original.ok)return {...(await inspectWechatChannels()),blocker:typedBlocker('ACTION_FAILED',actions.original.reason||'视频号原创声明没有完成',{evidence:actions.original})};const receipts={};if(wechatCustomCover){receipts.cover={slots:{}};for(const asset of wechatCoverAssets){const uploaded=await uploadWechatCover(asset);(actions.covers||=[]).push({asset,...uploaded});if(!uploaded.ok)return {...(await inspectWechatChannels()),blocker:typedBlocker('PLATFORM_REJECTED_ASSET',uploaded.reason,{retryable:true,evidence:uploaded})};receipts.cover.slots[asset.slot]=uploaded.receipt;actions.receiptCheckpoint=checkpointReceipts({...expectedReceipts,...receipts})}expectedReceipts.cover=receipts.cover}actions.receiptCheckpoint=checkpointReceipts({...expectedReceipts,...receipts});const after=await inspectWechatChannels();return {...after,actions,receipts}}

async function runPlatformPhase(){if(phase==='inspect'||phase==='verify')return await inspectWechatChannels();if(phase==='upload_start')return await startWechatChannelsUpload();if(phase==='prefill')return await prefillWechatChannels();if(phase==='upload')return await uploadWechatChannels();if(phase==='mutate')return await mutateWechatChannels();return {...(await inspectWechatChannels()),blocker:typedBlocker('ACTION_FAILED',`unsupported WeChat phase: ${phase}`)}}
