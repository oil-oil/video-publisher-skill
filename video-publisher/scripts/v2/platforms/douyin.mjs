const douyinTitle = pkg.platformTitle.douyin;
const douyinDescription = pkg.douyinDescription;
const douyinTopics = pkg.douyinTopics;
const douyinCustomCover = pkg.cover?.uploadCustomCover === true;
const douyinCoverAssets = [
  { slot: 'portrait', ratio: '3:4', path: String(pkg.cover?.vertical3x4Path || '') },
  { slot: 'landscape', ratio: '4:3', path: String(pkg.cover?.horizontal4x3Path || '') },
];

async function inspectDouyin() {
  const state = await js(String.raw`((expectedTitle, expectedDescription, requestedTopics) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const visible = el => { const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden' }
    const text = compact(document.body.innerText || '')
    const title = String([...document.querySelectorAll('input')].find(el => (el.placeholder || '').includes('作品标题'))?.value || '').trim()
    const editables = [...document.querySelectorAll('[contenteditable="true"], [contenteditable=""]')]
      .filter(visible)
      .map(el => {
        let context=''; let parent=el.parentElement
        for(let i=0;parent&&i<5;i+=1){context+=' '+compact(parent.innerText||parent.textContent||'');parent=parent.parentElement}
        const r=el.getBoundingClientRect(); return {el,context,area:r.width*r.height,cls:String(el.className||'')}
      })
      .sort((a,b)=>Number(/作品描述|#添加话题|@好友/.test(b.context))-Number(/作品描述|#添加话题|@好友/.test(a.context))||b.area-a.area)
    const editor = editables[0]?.el || null
    const editorText = compact(editor?.innerText || editor?.textContent || '').replace(/\u200b/g,'').trim()
    const scope = editor || document
    const requestedSet = new Set(requestedTopics.map(tag=>String(tag).toLowerCase()))
    const nodes = [...scope.querySelectorAll('[data-mention], [data-fake-text], span, a, div')]
      .map(el => { const r=el.getBoundingClientRect(),s=getComputedStyle(el),value=compact(el.innerText||el.textContent||''); const normalized=value.replace(/^#/,'').toLowerCase(); const cls=String(el.className||''); const mention=el.getAttribute('data-mention')||''; const fake=el.getAttribute('data-fake-text')||''; const entityLike=mention==='#'||mention==='activity'||fake.includes('#')||/mention|hash|topic|tag/i.test(cls)||/rgb\(1, 118, 247\)/.test(s.color)||/rgb\(255, 232, 233\)/.test(s.backgroundColor); return {value,normalized,cls,mention,fake,entityLike,w:r.width,h:r.height} })
      .filter(item=>item.w>4&&item.h>4&&item.entityLike&&requestedSet.has(item.normalized))
    const escapeRegExp=value=>String(value).replace(/[.*+?^$(){}|[\]\\]/g,'\\$&')
    const tokenCounts=Object.fromEntries(requestedTopics.map(tag=>{const re=new RegExp('(?:^|[\\s\\u200b])#'+escapeRegExp(tag)+'(?=$|[\\s\\u200b])','gi');return [tag,[...String(editor?.innerText||editor?.textContent||'').matchAll(re)].length]}))
    const selected = requestedTopics.filter(tag=>nodes.some(node=>node.normalized===String(tag).toLowerCase())||tokenCounts[tag]===1)
    const duplicates = requestedTopics.filter(tag=>tokenCounts[tag]>1)
    const clone = editor?.cloneNode(true)
    clone?.querySelectorAll('[data-mention], [data-fake-text], [class*="mention"], [class*="topic"], [class*="hash"]').forEach(el=>el.remove())
    let proseRaw=String(clone?.innerText||clone?.textContent||'').replace(/\u200b/g,' ')
    for(const tag of requestedTopics)proseRaw=proseRaw.replace(new RegExp('(?:^|\\s)#'+escapeRegExp(tag)+'(?=$|\\s)','gi'),' ')
    const prose = compact(proseRaw)
    const plainResidue = requestedTopics.filter(tag=>new RegExp('(?:^|\\s)'+escapeRegExp(tag)+'(?=$|\\s)','i').test(prose))
    const uploadSucceeded = /上传成功|重新上传/.test(text) && /作品描述|基础信息/.test(text)
    const uploading = /上传过程中|取消上传|上传剩余时间|已上传：|上传速度|当前速度/.test(text) && !/上传成功/.test(text)
    const uploadFailed = /上传失败|网络错误|重新上传失败/.test(text)
    const loginRequired = /扫码登录|请登录|登录后|安全验证|验证码/.test(text) && !/创作中心|内容管理/.test(text)
    const resumeDialog = /你还有上次未发布的视频|是否继续编辑/.test(text)
    const identityEmpty = !title && !editorText
    const identityMatches = title === expectedTitle || editorText.includes(expectedDescription) || identityEmpty
    const toutiaoLabel = [...document.querySelectorAll('div,span')]
      .map(el=>({el,text:compact(el.innerText||el.textContent||''),r:el.getBoundingClientRect()}))
      .filter(item=>item.text==='今日头条'&&item.r.width>20&&item.r.height>12)
      .sort((a,b)=>(a.r.width*a.r.height)-(b.r.width*b.r.height))[0]?.el
    let syncRow=toutiaoLabel
    while(syncRow&&!syncRow.querySelector('[role="switch"],input[type="checkbox"],[class*="semi-switch"]'))syncRow=syncRow.parentElement
    const sync=syncRow?.querySelector('input[role="switch"],input[type="checkbox"],[role="switch"],[class*="semi-switch"]')
    const syncOn=Boolean(sync&&(sync.checked===true||sync.getAttribute('aria-checked')==='true'||/checked|active|open|\bon\b/i.test(String(sync.className||''))))
    const syncRadios=[...document.querySelectorAll('label')].map(el=>({text:compact(el.innerText||el.textContent||''),input:el.querySelector('input.radio-native-p6VBGt,input[type="checkbox"]')})).filter(item=>/^(不同时发布|同时发布到)/.test(item.text))
    const noSyncChecked=Boolean(syncRadios.find(item=>item.text.startsWith('不同时发布'))?.input?.checked)
    const simultaneousChecked=Boolean(syncRadios.find(item=>item.text.startsWith('同时发布到'))?.input?.checked)
    const coverUrls = {}
    for (const [slot,re] of [['landscape',/横封面\s*4\s*:\s*3|横封面4:3/],['portrait',/竖封面\s*3\s*:\s*4|竖封面3:4/]]) {
      const card=[...document.querySelectorAll('.coverControl-CjlzqC')].find(el=>re.test(compact(el.innerText||el.textContent||'')))
      const urls=[...(card?.querySelectorAll('img')||[])].map(img=>img.src).filter(src=>/blob:|douyinpic|pstatp|tos-cn|creator-media/.test(src))
      for(const el of [card,...(card?[...card.querySelectorAll('*')]:[])]){const bg=el?getComputedStyle(el).backgroundImage:'';const match=bg.match(/^url\(["']?(.*?)["']?\)$/);if(match&&/blob:|douyinpic|pstatp|tos-cn|creator-media/.test(match[1]))urls.push(match[1])}
      coverUrls[slot]=[...new Set(urls)]
    }
    const dialogs=[...document.querySelectorAll('[role="dialog"],.semi-modal,[class*="modal-mask"],[class*="dialog-mask"]')]
      .map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {text:compact(el.innerText||el.textContent||'').slice(0,500),cls:String(el.className||''),w:r.width,h:r.height,display:s.display,visibility:s.visibility,opacity:s.opacity}})
      .filter(item=>item.w>20&&item.h>20&&item.display!=='none'&&item.visibility!=='hidden'&&!/animate-hide|leave-active/.test(item.cls))
    return {text:text.slice(0,2800),title,editorText,prose,selected,plainResidue,duplicates,tokenCounts,uploadSucceeded,uploading,uploadFailed,loginRequired,resumeDialog,identityMatches,identityEmpty,syncOn,syncFound:Boolean(sync),noSyncChecked,simultaneousChecked,coverUrls,dialogs}
  })(${JSON.stringify(douyinTitle)}, ${JSON.stringify(douyinDescription)}, ${JSON.stringify(douyinTopics)})`);
  const buttons = await inspectFinalButtons(/^发布$/);
  const finalButton = buttons.find(button=>button.buttonish) || buttons[0] || null;
  const receipt = expectedReceipts.cover || null;
  const expectedBySlot = Object.fromEntries(douyinCoverAssets.map(asset=>[asset.slot,asset]));
  const coverReceiptOk = douyinCustomCover && receipt && ['portrait','landscape'].every(slot => {
    const item=receipt.slots?.[slot]; const expected=expectedBySlot[slot];
    return item?.assetPath===expected.path && item?.ratio===expected.ratio && item?.afterUrl && (state.coverUrls[slot]||[]).includes(item.afterUrl);
  }) && receipt.slots.portrait.afterUrl!==receipt.slots.landscape.afterUrl;
  const defaultCoverOk = !douyinCustomCover && ['portrait','landscape'].some(slot=>(state.coverUrls[slot]||[]).length>0 || /选择封面|设置封面/.test(state.text));
  return {
    gates: {
      authenticated: state.loginRequired ? failedGate({loginRequired:true}) : okGate({url:PLATFORM_URLS.douyin}),
      draftIdentity: state.identityMatches ? okGate({empty:state.identityEmpty,title:state.title}) : failedGate({foreign:true,title:state.title,editorText:state.editorText}),
      video: state.uploadSucceeded && !state.uploading && !state.uploadFailed ? okGate({stable:true}) : failedGate({uploaded:state.uploadSucceeded,uploading:state.uploading,failed:state.uploadFailed,resumeDialog:state.resumeDialog}),
      title: state.title===douyinTitle ? okGate({expected:douyinTitle,actual:state.title}) : failedGate({expected:douyinTitle,actual:state.title}),
      description: state.prose===douyinDescription ? okGate({expected:douyinDescription,actual:state.prose}) : failedGate({expected:douyinDescription,actual:state.prose,editorText:state.editorText}),
      tags: state.selected.length===douyinTopics.length&&!state.plainResidue.length&&!state.duplicates.length ? okGate({requested:douyinTopics,selected:state.selected,tokenCounts:state.tokenCounts}) : failedGate({requested:douyinTopics,selected:state.selected,plainResidue:state.plainResidue,duplicates:state.duplicates,tokenCounts:state.tokenCounts,editorText:state.editorText}),
      settings: state.noSyncChecked&&!state.syncOn&&!state.simultaneousChecked ? okGate({simultaneousPublish:false,toutiaoSync:false}) : failedGate({simultaneousPublish:state.simultaneousChecked,noSyncChecked:state.noSyncChecked,toutiaoSync:state.syncOn,syncFound:state.syncFound}),
      cover: coverReceiptOk||defaultCoverOk ? okGate({custom:douyinCustomCover,urls:state.coverUrls,receipt}) : failedGate({custom:douyinCustomCover,urls:state.coverUrls,receipt,reason:douyinCustomCover&&!receipt?'custom cover receipt missing':'cover not verified'}),
      noBlockingDialog: state.dialogs.length===0 ? okGate({active:[]}) : failedGate({active:state.dialogs}),
      finalButton: finalButton&&!finalButton.disabled ? okGate(finalButton) : failedGate({buttons}),
    },
    evidence:{pageSample:state.text},
  };
}

async function uploadDouyin() {
  let before=await inspectDouyin();
  if(before.gates.video.ok)return before;
  if(!before.gates.draftIdentity.ok)return {...before,blocker:typedBlocker('FOREIGN_DRAFT','抖音当前编辑器属于其他视频草稿',{evidence:before.gates.draftIdentity.evidence})};
  if(before.gates.video.evidence?.resumeDialog){
    const point=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const item=[...document.querySelectorAll('button,[role="button"],div,span')].map(el=>({el,text:c(el.innerText||el.textContent||''),r:el.getBoundingClientRect()})).filter(x=>x.text==='放弃'&&x.r.width>12&&x.r.height>=8&&x.r.width<160&&x.r.height<70).sort((a,b)=>a.r.width*a.r.height-b.r.width*b.r.height)[0];if(!item)return null;const r=item.r;return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    if(!point)return {...before,blocker:typedBlocker('SELECTOR_DRIFT','douyin discard button missing')};
    await click([point.x,point.y],{label:'discard stale douyin upload'}).catch(()=>{});await wait(1.5);
  }
  const exposed=await js(String.raw`(() => { const input=[...document.querySelectorAll('input[type=file]')].find(el=>/video|\.mp4|\.mov|\.mkv|\.flv/i.test(el.accept||'')); if(!input)return {ok:false,reason:'douyin video input missing'}; input.id='vp2-douyin-video'; return {ok:true,selector:'#vp2-douyin-video'} })()`);
  if(!exposed.ok)return {...before,blocker:typedBlocker('SELECTOR_DRIFT',exposed.reason)};
  try{await uploadFile(exposed.selector,videoPath);}catch(error){return {...before,blocker:typedBlocker('UPLOAD_NOT_STARTED',String(error?.message||error),{retryable:true})};}
  let stableSince=0;
  for(let i=0;i<180;i+=1){const current=await inspectDouyin();if(current.gates.video.ok){if(!stableSince)stableSince=Date.now();if(Date.now()-stableSince>=10000)return current;}else stableSince=0;await wait(5);}
  const after=await inspectDouyin();return {...after,blocker:typedBlocker('UPLOAD_STALLED','抖音视频没有在等待窗口内稳定完成',{retryable:true,evidence:after.gates.video.evidence})};
}

async function setDouyinTitle() {
  const selector='input[placeholder*="作品标题"]';
  const before=await js(String.raw`((selector) => {const el=document.querySelector(selector);if(!el)return null;el.scrollIntoView({block:'center',inline:'center'});return el.value})(${JSON.stringify(selector)})`);
  if(before===null)return {ok:false,reason:'douyin title input missing'};
  try{await fillInput(selector,douyinTitle)}catch(error){return {ok:false,reason:String(error?.message||error)}}
  await js(String.raw`((selector) => {document.querySelector(selector)?.blur();return true})(${JSON.stringify(selector)})`);await wait(1);
  const after=await js(String.raw`((selector) => document.querySelector(selector)?.value||'')(${JSON.stringify(selector)})`);
  return after===douyinTitle?{ok:true,before,value:after}:{ok:false,reason:'douyin title input did not persist exact value',expected:douyinTitle,actual:after};
}

async function clearAndFillDouyinBody() {
  const locate=()=>js(String.raw`(() => {
    const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>180&&r.height>50&&s.display!=='none'&&s.visibility!=='hidden'}
    const rows=[...document.querySelectorAll('[contenteditable="true"],[contenteditable=""]')].map(el=>{const r=el.getBoundingClientRect();let p=el.parentElement,context='';for(let i=0;p&&i<5;i+=1){context+=' '+compact(p.innerText||p.textContent||'');p=p.parentElement}return {el,r,context,cls:String(el.className||'')}}).filter(item=>visible(item.el)&&!item.el.closest('[role="dialog"],[class*="modal"],[class*="dialog"]')).sort((a,b)=>Number(/作品描述|#添加话题|@好友/.test(b.context))-Number(/作品描述|#添加话题|@好友/.test(a.context))||Number(/editor|zone|ace/.test(b.cls))-Number(/editor|zone|ace/.test(a.cls))||b.r.width*b.r.height-a.r.width*a.r.height)
    const item=rows[0];if(!item)return {ok:false,reason:'douyin description editor missing'};item.el.scrollIntoView({block:'center',inline:'center'});return {ok:true,text:item.el.innerText||item.el.textContent||'',className:item.cls}
  })()`);
  const focus=(collapseEnd)=>js(String.raw`((collapseEnd) => {
    const compact=v=>String(v||'').replace(/\s+/g,' ').trim();const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>180&&r.height>50&&s.display!=='none'&&s.visibility!=='hidden'}
    const rows=[...document.querySelectorAll('[contenteditable="true"],[contenteditable=""]')].map(el=>{const r=el.getBoundingClientRect();let p=el.parentElement,context='';for(let i=0;p&&i<5;i+=1){context+=' '+compact(p.innerText||p.textContent||'');p=p.parentElement}return {el,r,context,cls:String(el.className||'')}}).filter(item=>visible(item.el)&&!item.el.closest('[role="dialog"],[class*="modal"],[class*="dialog"]')).sort((a,b)=>Number(/作品描述|#添加话题|@好友/.test(b.context))-Number(/作品描述|#添加话题|@好友/.test(a.context))||Number(/editor|zone|ace/.test(b.cls))-Number(/editor|zone|ace/.test(a.cls))||b.r.width*b.r.height-a.r.width*a.r.height)
    const el=rows[0]?.el;if(!el)return {ok:false,reason:'douyin description editor missing'};el.focus();const selection=getSelection(),range=document.createRange();range.selectNodeContents(el);if(collapseEnd)range.collapse(false);selection.removeAllRanges();selection.addRange(range);return {ok:document.activeElement===el,selected:String(selection),text:el.innerText||el.textContent||''}
  })(${JSON.stringify(collapseEnd)})`);
  let located=await locate();if(!located.ok)return located;
  for(let attempt=0;attempt<3;attempt+=1){
    const selected=await focus(false);if(!selected.ok)continue;await wait(.2);await pressKey('Backspace').catch(()=>{});await wait(.7);
    if(!String((await locate()).text||'').replace(/[\s\u200b]/g,''))break;
  }
  const cleared=await locate();if(String(cleared.text||'').replace(/[\s\u200b]/g,''))return {ok:false,reason:'douyin description editor did not clear',text:cleared.text};
  if(douyinDescription){const focused=await focus(true);if(!focused.ok)return focused;await cdp('Input.insertText',{text:douyinDescription});await wait(1);}
  const after=await locate();const ok=String(after.text||'').replace(/[\s\u200b]/g,'')===String(douyinDescription||'').replace(/[\s\u200b]/g,'');return ok?{ok:true,text:after.text}:{ok:false,reason:'douyin description did not persist exact value',expected:douyinDescription,actual:after.text};
}

async function addDouyinTopic(tag) {
  const focused=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>180&&r.height>50&&s.display!=='none'&&s.visibility!=='hidden'};const editor=[...document.querySelectorAll('[contenteditable="true"],[contenteditable=""]')].map(el=>{const r=el.getBoundingClientRect();let p=el.parentElement,context='';for(let i=0;p&&i<5;i+=1){context+=' '+c(p.innerText||p.textContent||'');p=p.parentElement}return {el,r,context,cls:String(el.className||'')}}).filter(item=>visible(item.el)&&!item.el.closest('[role="dialog"],[class*="modal"],[class*="dialog"]')).sort((a,b)=>Number(/作品描述|#添加话题|@好友/.test(b.context))-Number(/作品描述|#添加话题|@好友/.test(a.context))||Number(/editor|zone|ace/.test(b.cls))-Number(/editor|zone|ace/.test(a.cls))||b.r.width*b.r.height-a.r.width*a.r.height)[0];if(!editor)return {ok:false,reason:'douyin description editor missing'};editor.el.scrollIntoView({block:'center',inline:'center'});editor.el.focus();const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(editor.el);range.collapse(false);selection.removeAllRanges();selection.addRange(range);const r=editor.el.getBoundingClientRect();return {ok:true,point:{x:r.right-18,y:r.top+20}}})()`);
  if(!focused.ok)return focused;await click([focused.point.x,focused.point.y],{label:'focus douyin body end'}).catch(()=>{});await wait(.2);
  await js(String.raw`(() => {const editor=[...document.querySelectorAll('[contenteditable="true"],[contenteditable=""]')].find(el=>/zone-container|editor-kit/.test(String(el.className||'')));if(!editor)return false;editor.focus();const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(editor);range.collapse(false);selection.removeAllRanges();selection.addRange(range);return true})()`);
  const buttonPoint=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const item=[...document.querySelectorAll('button,[role="button"],div,span')].map(el=>({el,text:c(el.innerText||el.textContent||''),r:el.getBoundingClientRect()})).filter(x=>x.text==='#添加话题'&&x.r.width>20&&x.r.width<140&&x.r.height>=8&&x.r.height<50).sort((a,b)=>a.r.width*a.r.height-b.r.width*b.r.height)[0];if(!item)return null;item.el.scrollIntoView({block:'center',inline:'center'});const r=item.el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  if(!buttonPoint)return {ok:false,reason:'douyin add-topic button missing'};await click([buttonPoint.x,buttonPoint.y],{label:`open douyin topic ${tag}`}).catch(()=>{});await wait(.7);await cdp('Input.insertText',{text:String(tag).trim()});await wait(2.4);
  const findRow=()=>js(String.raw`((tag) => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const expected='#'+String(tag).toLowerCase();const containers=[...document.querySelectorAll('[class*="mention-suggest-item-container"],.mention-suggest-mount-dom')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'});const rows=containers.flatMap(container=>[...container.querySelectorAll('*')]).map(el=>({text:c(el.innerText||el.textContent||''),r:el.getBoundingClientRect()})).filter(item=>item.r.height>20&&item.r.height<90&&item.r.width>150&&(item.text.toLowerCase()===expected||item.text.toLowerCase().startsWith(expected+' '))).sort((a,b)=>a.text.length-b.text.length);const item=rows[0];return item?{x:item.r.left+Math.min(56,item.r.width/3),y:item.r.top+item.r.height/2,text:item.text}:null})(${JSON.stringify(tag)})`);
  let row=null;for(let attempt=0;attempt<5&&!row;attempt+=1){row=await findRow();if(!row)await wait(.8)}
  if(!row)return {ok:false,reason:'exact douyin topic suggestion missing',tag};await click([row.x,row.y],{label:`commit douyin topic ${tag}`}).catch(()=>{});await wait(1.4);
  let state=await inspectDouyin();let committed=(state.gates.tags.evidence?.selected||[]).some(value=>String(value).toLowerCase()===String(tag).toLowerCase());
  if(!committed){const retry=await findRow();if(retry){await click([retry.x,retry.y],{label:`retry douyin topic ${tag}`}).catch(()=>{});await wait(1.2);state=await inspectDouyin();committed=(state.gates.tags.evidence?.selected||[]).some(value=>String(value).toLowerCase()===String(tag).toLowerCase())}}
  return committed?{ok:true,text:row.text}:{ok:false,reason:'douyin topic entity was not committed',tag,evidence:state.gates.tags.evidence};
}

async function turnOffDouyinSync() {
  const located=await js(String.raw`(() => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const label=[...document.querySelectorAll('label')].find(el=>c(el.innerText||el.textContent||'').startsWith('不同时发布'));if(!label)return {ok:false,reason:'douyin no-sync radio missing'};const input=label.querySelector('input');label.scrollIntoView({block:'center',inline:'center'});const r=label.getBoundingClientRect();return {ok:true,on:Boolean(input?.checked),point:{x:r.left+r.width/2,y:r.top+r.height/2}}})()`);
  if(!located.ok)return located;if(!located.on){await click([located.point.x,located.point.y],{label:'disable douyin simultaneous publish'}).catch(()=>{});await wait(1)}const after=await inspectDouyin();return after.gates.settings.ok?{ok:true,wasOn:!located.on}:{ok:false,reason:'douyin simultaneous publish remained enabled',evidence:after.gates.settings.evidence};
}

async function uploadDouyinCoverSlot(asset) {
  await js(String.raw`(() => {document.querySelectorAll('[class*="animate-hide"]').forEach(el=>{el.style.pointerEvents='none'});return true})()`);
  const active=await js(String.raw`(() => Boolean([...document.querySelectorAll('[role="dialog"]')].find(el=>!/animate-hide/.test(String(el.className||''))&&(el.innerText||el.textContent||'').includes('封面'))))()`);
  if(!active){
    const prepared=await js(String.raw`((slot) => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const re=slot==='portrait'?/竖封面\s*3\s*:\s*4|竖封面3:4/:/横封面\s*4\s*:\s*3|横封面4:3/;const label=[...document.querySelectorAll('div,span')].filter(el=>re.test(c(el.innerText||el.textContent||''))&&c(el.innerText||el.textContent||'').length<40).sort((a,b)=>c(a.innerText||a.textContent||'').length-c(b.innerText||b.textContent||'').length)[0];const card=label?.closest('.coverControl-CjlzqC')||label?.parentElement?.parentElement;if(!card)return {ok:false,reason:'douyin cover slot control missing'};card.id='vp2-douyin-cover-card-'+slot;card.scrollIntoView({block:'center',inline:'center'});return {ok:true,selector:'#'+card.id}})(${JSON.stringify(asset.slot)})`);
    if(!prepared.ok)return {...prepared,slot:asset.slot};await hover(prepared.selector,{label:`reveal douyin ${asset.slot} cover`}).catch(()=>{});await wait(.5);const trigger=await js(String.raw`((selector,slot) => {const card=document.querySelector(selector);const target=card?.querySelector('.title-wA45Xd,.filter-k_CjvJ')||card;if(!target)return {ok:false,reason:'douyin cover edit trigger missing'};target.id='vp2-douyin-cover-trigger-'+slot;return {ok:true,selector:'#'+target.id}})(${JSON.stringify(prepared.selector)},${JSON.stringify(asset.slot)})`);if(!trigger.ok)return {...trigger,slot:asset.slot};await click(trigger.selector,{label:`open douyin ${asset.slot} cover`}).catch(()=>{});await wait(2);
  }
  const exposed=await js(String.raw`((slot) => {const dialog=[...document.querySelectorAll('[role="dialog"]')].find(el=>!/animate-hide/.test(String(el.className||''))&&(el.innerText||el.textContent||'').includes('封面'));if(!dialog)return {ok:false,reason:'douyin cover dialog missing'};const active=[...dialog.querySelectorAll('[class*="step-active"]')].map(el=>(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()).join(' ');const expected=slot==='portrait'?'竖封面':'横封面';if(active&&!active.includes(expected))return {ok:false,reason:'douyin cover dialog opened on wrong slot',active,expected};const input=dialog.querySelector('.upload-BvM5FF input.semi-upload-hidden-input')||[...dialog.querySelectorAll('input[type=file]')].find(el=>(el.parentElement?.innerText||'').includes('点击上传文件'));if(!input)return {ok:false,reason:'douyin custom cover input missing'};input.id='vp2-douyin-cover-'+slot;return {ok:true,selector:'#'+input.id,active}})(${JSON.stringify(asset.slot)})`);
  if(!exposed.ok)return exposed;try{await uploadFile(exposed.selector,asset.path)}catch(error){return {ok:false,reason:String(error?.message||error)}}await wait(3);
  const allowedLabels=asset.slot==='portrait'?['设置横封面','完成']:['完成'];let action=null;
  for(let attempt=0;attempt<30&&!action;attempt+=1){action=await js(String.raw`((labels) => {const c=v=>String(v||'').replace(/\s+/g,' ').trim();const dialog=[...document.querySelectorAll('[role="dialog"]')].find(el=>!/animate-hide/.test(String(el.className||'')));const buttons=[...dialog?.querySelectorAll('button,[role="button"]')||[]];for(const label of labels){const button=buttons.find(el=>c(el.innerText||el.textContent||'')===label&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!/disabled/.test(String(el.className||'')));if(button){const r=button.getBoundingClientRect();return{label,x:r.left+r.width/2,y:r.top+r.height/2}}}return null})(${JSON.stringify(allowedLabels)})`);if(!action)await wait(.75)}
  if(!action)return {ok:false,reason:`douyin ${allowedLabels.join(' or ')} button did not enable`,slot:asset.slot};await click([action.x,action.y],{label:`douyin cover ${action.label}`}).catch(()=>{});
  if(action.label==='完成'){let closed=false;for(let attempt=0;attempt<40;attempt+=1){closed=await js(String.raw`(() => ![...document.querySelectorAll('[role="dialog"]')].some(el=>!/animate-hide/.test(String(el.className||''))&&/封面/.test(el.innerText||el.textContent||'')))()`);if(closed)break;await wait(.75)}if(!closed)return {ok:false,reason:'douyin cover dialog did not close after completion',slot:asset.slot}}else await wait(2);
  return {ok:true,assetPath:asset.path,ratio:asset.ratio,completionLabel:action.label};
}

async function repairDelayedDouyinCoverReceipt(){
  const prior=expectedReceipts.cover;
  if(!prior?.slots?.portrait||!prior?.slots?.landscape)return {ok:false,skipped:true};
  const expected=Object.fromEntries(douyinCoverAssets.map(asset=>[asset.slot,asset]));
  if(!['portrait','landscape'].every(slot=>prior.slots[slot].assetPath===expected[slot].path&&prior.slots[slot].ratio===expected[slot].ratio))return {ok:false,skipped:true};
  if(prior.slots.portrait.afterUrl!==prior.slots.landscape.afterUrl)return {ok:false,skipped:true};
  const state=await inspectDouyin();const urls=state.gates.cover.evidence?.urls||{};
  const portrait=(urls.portrait||[]).find(Boolean);const landscape=(urls.landscape||[]).find(url=>url&&url!==portrait);
  if(!portrait||!landscape||!(urls.portrait||[]).includes(prior.slots.portrait.afterUrl))return {ok:false,skipped:true};
  const receipt={slots:{portrait:{...prior.slots.portrait,afterUrl:portrait},landscape:{...prior.slots.landscape,afterUrl:landscape}}};
  return {ok:true,receipt,reason:'repaired delayed landscape card after both real slot uploads'};
}

async function mutateDouyin() {
  const before = await inspectDouyin();
  if (!before.gates.video.ok) return { ...before, blocker: typedBlocker('STATE_AMBIGUOUS', '抖音没有可修复的已上传视频') };
  const actions = {};
  if (!before.gates.title.ok) {
    actions.title = await setDouyinTitle();
    if (!actions.title.ok) return { ...(await inspectDouyin()), blocker: typedBlocker('ACTION_FAILED', actions.title.reason, { evidence: actions.title }) };
  }
  if (!(before.gates.description.ok && before.gates.tags.ok)) {
    actions.body = await clearAndFillDouyinBody();
    if (!actions.body.ok) return { ...(await inspectDouyin()), blocker: typedBlocker('ACTION_FAILED', actions.body.reason) };
    for (const tag of douyinTopics) {
      const added = await addDouyinTopic(tag);
      (actions.topics ||= []).push({ tag, ...added });
      if (!added.ok) return { ...(await inspectDouyin()), blocker: typedBlocker('ACTION_FAILED', added.reason, { evidence: added }) };
    }
  }
  actions.settings = await turnOffDouyinSync();
  if (!actions.settings.ok) return { ...(await inspectDouyin()), blocker: typedBlocker('SELECTOR_DRIFT', actions.settings.reason) };

  const receipts = {};
  if (douyinCustomCover) {
    const repaired = await repairDelayedDouyinCoverReceipt();
    if (repaired.ok) {
      actions.coverReceiptRepair = { ok: true, reason: repaired.reason };
      receipts.cover = repaired.receipt;
      expectedReceipts.cover = receipts.cover;
    } else {
      const beforeUrls = before.gates.cover.evidence?.urls || {};
      const existingDistinct = (beforeUrls.portrait || []).some(url => url && (beforeUrls.landscape || []).some(other => other && other !== url));
      if (existingDistinct && !expectedReceipts.cover) {
        return {
          ...before,
          blocker: typedBlocker('STATE_AMBIGUOUS', '抖音页面已有双封面，但正式回执和崩溃恢复 checkpoint 均缺失，无法证明素材身份；拒绝盲目重传', { retryable: false, evidence: { urls: beforeUrls } }),
        };
      }
      receipts.cover = { slots: {} };
      for (const asset of douyinCoverAssets) {
        const uploaded = await uploadDouyinCoverSlot(asset);
        (actions.covers ||= []).push({ asset, ...uploaded });
        if (!uploaded.ok) return { ...(await inspectDouyin()), blocker: typedBlocker('PLATFORM_REJECTED_ASSET', uploaded.reason, { retryable: true, evidence: uploaded }) };
      }
      let coverState = null;
      for (let attempt = 0; attempt < 45; attempt += 1) {
        coverState = await inspectDouyin();
        const portrait = coverState.gates.cover.evidence?.urls?.portrait || [];
        const landscape = coverState.gates.cover.evidence?.urls?.landscape || [];
        if (portrait.length && landscape.length && portrait.some(url => !landscape.includes(url)) && landscape.some(url => !portrait.includes(url))) break;
        await wait(1);
      }
      for (const asset of douyinCoverAssets) {
        const urls = coverState.gates.cover.evidence?.urls?.[asset.slot] || [];
        const otherSlot = asset.slot === 'portrait' ? 'landscape' : 'portrait';
        const otherUrls = coverState.gates.cover.evidence?.urls?.[otherSlot] || [];
        const afterUrl = urls.find(url => !(beforeUrls[asset.slot] || []).includes(url) && !otherUrls.includes(url)) || urls.find(url => !otherUrls.includes(url));
        if (!afterUrl) return { ...coverState, blocker: typedBlocker('PLATFORM_REJECTED_ASSET', `douyin ${asset.slot} cover did not produce a distinct preview`, { retryable: true, evidence: { before: beforeUrls[asset.slot] || [], after: urls, other: otherUrls } }) };
        receipts.cover.slots[asset.slot] = { assetPath: asset.path, ratio: asset.ratio, beforeUrls: beforeUrls[asset.slot] || [], afterUrl };
      }
      expectedReceipts.cover = receipts.cover;
    }
  }
  actions.receiptCheckpoint = checkpointReceipts(receipts);
  const after = await inspectDouyin();
  return { ...after, actions, receipts };
}

async function runPlatformPhase(){if(phase==='inspect'||phase==='verify')return await inspectDouyin();if(phase==='upload')return await uploadDouyin();if(phase==='mutate')return await mutateDouyin();return {...(await inspectDouyin()),blocker:typedBlocker('ACTION_FAILED',`unsupported Douyin phase: ${phase}`)}}
