const xhsTitle = pkg.platformTitle.xiaohongshu;
const xhsTopics = pkg.xhsTopics;
const xhsVideoName = videoPath.split('/').pop();
const xhsCustomCover = pkg.cover?.uploadCustomCover === true;
const xhsCoverPath = String(pkg.cover?.vertical3x4Path || '');

async function inspectXiaohongshu() {
  const state = await js(String.raw`((expectedName, expectedTitle, requestedTopics) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const visible = el => { if (!el) return false; const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden' }
    const text = compact(document.body.innerText || '')
    const titleInput = [...document.querySelectorAll('input')]
      .find(el => (el.placeholder || '').includes('填写标题'))
    const title = String(titleInput?.value || '').trim()
    const editors = [...document.querySelectorAll('[contenteditable="true"], [contenteditable=""]')]
    const editor = editors.find(el => el.querySelector('a') || /话题|creator-editor/i.test(String(el.className || ''))) || editors[0]
    const editorText = compact(editor?.innerText || editor?.textContent || '')
    const anchorNames = [...(editor?.querySelectorAll('a') || [])].map(el => {
      try { return String(JSON.parse(el.getAttribute('data-topic') || '{}').name || '').trim() }
      catch { return compact(el.innerText || el.textContent || '').replace(/^#|\[话题\]#.*$/g, '') }
    }).filter(Boolean)
    const plainClone = editor?.cloneNode(true)
    plainClone?.querySelectorAll('a').forEach(el => el.remove())
    const plainText = compact(plainClone?.innerText || plainClone?.textContent || '')
    const topicCounts = Object.fromEntries(requestedTopics.map(tag => {
      const normalized = String(tag).replace(/\s+/g, '').toLowerCase()
      const count = anchorNames.filter(value => String(value).replace(/\s+/g, '').toLowerCase() === normalized).length
      return [tag, count]
    }))
    const selected = requestedTopics.filter(tag => topicCounts[tag] === 1)
    const plainCompact = plainText.replace(/\s+/g, '').toLowerCase()
    const plainResidue = requestedTopics.filter(tag => plainCompact.includes('#' + String(tag).replace(/\s+/g, '').toLowerCase()))
    const duplicate = requestedTopics.filter(tag => topicCounts[tag] > 1)
    const originalLabels = [...document.querySelectorAll('div,section,label,span')]
      .filter(el => compact(el.innerText || el.textContent || '') === '原创声明')
      .sort((a,b) => { const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(); return ar.width*ar.height-br.width*br.height })
    const originalLabel = originalLabels[0] || null
    const originalAncestors = []; for(let el=originalLabel;el&&originalAncestors.length<8;el=el.parentElement)originalAncestors.push(el)
    const originalSelectors = '.custom-switch-switch, .d-switch, [role="switch"], input[type="checkbox"]'
    const originalRow = originalAncestors.find(el => el.matches?.(originalSelectors) || el.querySelector?.(originalSelectors))
      || originalAncestors.find(el => { const s=getComputedStyle(el); return compact(el.innerText||el.textContent||'')==='原创声明' && (parseFloat(s.borderRadius)>0 || s.backgroundColor!=='rgba(0, 0, 0, 0)') })
      || originalLabel?.parentElement
    const originalSwitch = (originalRow?.matches?.(originalSelectors) ? originalRow : originalRow?.querySelector(originalSelectors))
      || [...document.querySelectorAll('.custom-switch-switch, .d-switch, [role="switch"]')]
        .find(el => /原创声明/.test(el.parentElement?.parentElement?.innerText || ''))
    const simulator = originalSwitch?.querySelector?.('.d-switch-simulator') || originalSwitch?.parentElement?.querySelector?.('.d-switch-simulator')
    const originalInput = originalSwitch?.matches?.('input[type="checkbox"]')
      ? originalSwitch
      : originalSwitch?.querySelector?.('input[type="checkbox"]') || simulator?.querySelector?.('input[type="checkbox"]')
    const switchTokens = String(originalSwitch?.className || '').split(/\s+/).filter(Boolean)
    const simulatorTokens = String(simulator?.className || '').split(/\s+/).filter(Boolean)
    const originalEnabled = Boolean(originalSwitch && (
      originalInput?.checked === true
      || originalSwitch.getAttribute?.('aria-checked') === 'true'
      || originalSwitch.getAttribute?.('data-state') === 'checked'
      || switchTokens.some(token => ['checked', 'active', 'open', 'enabled'].includes(token))
      || simulatorTokens.some(token => ['checked', 'active', 'open', 'enabled'].includes(token))
    ))
    const activeDialogs = [...document.querySelectorAll('.d-modal-mask, [role="dialog"], [class*="modal-mask"]')]
      .map(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { text: compact(el.innerText || el.textContent || ''), cls: String(el.className || ''), width: r.width, height: r.height, opacity: s.opacity, display: s.display, visibility: s.visibility } })
      .filter(item => item.width > 20 && item.height > 20 && item.display !== 'none' && item.visibility !== 'hidden')
      .filter(item => !(/leave-active/.test(item.cls) && Number(item.opacity) === 0))
    const cover = document.querySelector('.cover-plugin-preview .default.row, .cover-plugin-preview .default.column')
    const coverBg = cover ? getComputedStyle(cover).backgroundImage : ''
    const filenameVisible = text.includes(expectedName) || text.includes(expectedName.replace(/\.[^.]+$/, ''))
    const uploaded = filenameVisible && /重新上传|上传完成|检测为高清视频/.test(text)
    const uploading = /封面上传中|视频上传中|取消上传|剩余时间|当前速度|处理中/.test(text)
    const failed = /上传失败|网络错误|重新上传失败/.test(text)
    const loginRequired = /扫码登录|请登录|登录后|安全验证|验证码/.test(text) && !/发布笔记|内容设置/.test(text)
    const topicButton = document.querySelector('button.contentBtn.topic-btn, #topicBtn')
    const earlyMutation = {
      ready: Boolean(visible(titleInput) && visible(editor) && visible(topicButton)),
      uploading,
      uploaded,
      controls: { title: visible(titleInput), topics: visible(editor) && visible(topicButton) },
    }
    return { text: text.slice(0, 2600), title, editorText, selected, topicCounts, plainResidue, duplicate, originalEnabled, activeDialogs, coverBg, filenameVisible, uploaded, uploading, failed, loginRequired, earlyMutation }
  })(${JSON.stringify(xhsVideoName)}, ${JSON.stringify(xhsTitle)}, ${JSON.stringify(xhsTopics)})`);
  const buttons = await inspectFinalButtons(/^(发布|发布笔记)$/);
  const identityOk = !state.uploaded || state.filenameVisible || state.title === xhsTitle;
  const receipt = expectedReceipts.cover || null;
  const receiptMatches = Boolean(receipt
    && receipt.assetPath === xhsCoverPath
    && receipt.ratio === '3:4'
    && receipt.afterUrl
    && state.coverBg.includes(receipt.afterUrl));
  const coverOk = xhsCustomCover
    ? receiptMatches && !state.uploading
    : Boolean(state.coverBg) && !state.uploading;
  const finalButton = buttons.find(button => button.buttonish) || buttons[0] || null;
  return {
    gates: {
      authenticated: state.loginRequired ? failedGate({ loginRequired: true }) : okGate({ url: PLATFORM_URLS.xiaohongshu }),
      draftIdentity: identityOk ? okGate({ expectedName: xhsVideoName, filenameVisible: state.filenameVisible }) : failedGate({ foreign: true, expectedName: xhsVideoName, actualTitle: state.title }),
      video: state.uploaded && !state.failed && !state.uploading
        ? okGate({ filename: xhsVideoName, stable: true })
        : failedGate({ filename: xhsVideoName, uploaded: state.uploaded, uploading: state.uploading, failed: state.failed }),
      title: state.title === xhsTitle ? okGate({ expected: xhsTitle, actual: state.title }) : failedGate({ expected: xhsTitle, actual: state.title }),
      tags: state.selected.length === xhsTopics.length && !state.plainResidue.length && !state.duplicate.length
        ? okGate({ requested: xhsTopics, selected: state.selected, topicCounts: state.topicCounts })
        : failedGate({ requested: xhsTopics, selected: state.selected, plainResidue: state.plainResidue, duplicate: state.duplicate, topicCounts: state.topicCounts }),
      original: state.originalEnabled ? okGate({ enabled: true }) : failedGate({ enabled: false }),
      cover: coverOk
        ? okGate({ custom: xhsCustomCover, background: state.coverBg, receipt })
        : failedGate({ custom: xhsCustomCover, background: state.coverBg, receipt, reason: xhsCustomCover && !receipt ? 'custom cover receipt missing' : 'cover not verified' }),
      noBlockingDialog: state.activeDialogs.length === 0 ? okGate({ active: [] }) : failedGate({ active: state.activeDialogs }),
      finalButton: finalButton && !finalButton.disabled ? okGate(finalButton) : failedGate({ buttons }),
    },
    evidence: { pageSample: state.text, earlyMutation: state.earlyMutation },
  };
}

async function waitXiaohongshuUploadCompletion(mode) {
  let stableSince = 0;
  for (let index = 0; index < 180; index += 1) {
    const current = await inspectXiaohongshu();
    const uploaded = current.gates.video.evidence?.uploaded || current.gates.video.ok;
    const uploading = current.gates.video.evidence?.uploading === true;
    if (uploaded && !uploading) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= 10000) return { ...current, actions: { upload: { mode } } };
    } else {
      stableSince = 0;
    }
    await wait(5);
  }
  const after = await inspectXiaohongshu();
  return { ...after, actions: { upload: { mode } }, blocker: typedBlocker('UPLOAD_STALLED', '小红书视频没有在等待窗口内稳定完成', { retryable: true, evidence: after.gates.video.evidence }) };
}

async function uploadXiaohongshu() {
  const before = await inspectXiaohongshu();
  if (before.gates.video.ok) return { ...before, actions: { upload: { mode: 'already_ready' } } };
  if (!before.gates.draftIdentity.ok) {
    return { ...before, blocker: typedBlocker('FOREIGN_DRAFT', '小红书当前编辑器属于其他视频草稿', { evidence: before.gates.draftIdentity.evidence }) };
  }
  if (before.gates.video.evidence?.uploading === true) {
    return await waitXiaohongshuUploadCompletion('resume_existing');
  }
  const exposed = await js(String.raw`(() => {
    const videoLike = value => /video|\.(mp4|mov|flv|f4v|mkv|rmvb?|m4v|mpg|mpeg|ts)\b/i.test(value || '')
    const input = [...document.querySelectorAll('input[type=file]')].find(el => videoLike(el.accept))
    if (!input) return { ok: false, reason: 'xiaohongshu video input missing' }
    input.id = 'vp2-xhs-video'
    return { ok: true, selector: '#vp2-xhs-video', accept: input.accept || '' }
  })()`);
  if (!exposed.ok) return { ...before, blocker: typedBlocker('SELECTOR_DRIFT', exposed.reason) };
  try {
    await uploadFile(exposed.selector, videoPath);
  } catch (error) {
    return { ...before, blocker: typedBlocker('UPLOAD_NOT_STARTED', `小红书文件注入失败: ${String(error?.message || error)}`, { retryable: true }) };
  }
  return await waitXiaohongshuUploadCompletion('injected');
}

async function waitXiaohongshuEarlyMutationReady(mode) {
  for (let index = 0; index < 30; index += 1) {
    const current = await inspectXiaohongshu();
    if (!current.gates.authenticated.ok) {
      return { ...current, blocker: typedBlocker('AUTH_REQUIRED', '小红书登录状态失效', { requiresUser: true, evidence: current.gates.authenticated.evidence }) };
    }
    if (current.gates.video.ok) return { ...current, actions: { upload: { mode, stage: 'complete', earlyMutationReady: true } } };
    if (current.gates.video.evidence?.failed === true) {
      return { ...current, blocker: typedBlocker('UPLOAD_NOT_STARTED', '小红书上传失败', { retryable: true, evidence: current.gates.video.evidence }) };
    }
    if (current.gates.video.evidence?.uploading === true && current.evidence?.earlyMutation?.ready === true) {
      return { ...current, actions: { upload: { mode, stage: 'editable_uploading', earlyMutationReady: true } } };
    }
    await wait(1);
  }
  const after = await inspectXiaohongshu();
  return { ...after, blocker: typedBlocker('UPLOAD_NOT_STARTED', '小红书上传启动后编辑区未及时就绪', { retryable: true, evidence: after.evidence?.earlyMutation }) };
}

async function startXiaohongshuUpload() {
  const before = await inspectXiaohongshu();
  if (before.gates.video.ok) return { ...before, actions: { upload: { mode: 'already_ready', stage: 'complete', earlyMutationReady: true } } };
  if (!before.gates.authenticated.ok) {
    return { ...before, blocker: typedBlocker('AUTH_REQUIRED', '小红书登录状态失效', { requiresUser: true, evidence: before.gates.authenticated.evidence }) };
  }
  if (!before.gates.draftIdentity.ok) {
    return { ...before, blocker: typedBlocker('FOREIGN_DRAFT', '小红书当前编辑器属于其他视频草稿', { evidence: before.gates.draftIdentity.evidence }) };
  }
  if (before.gates.video.evidence?.uploading === true) return await waitXiaohongshuEarlyMutationReady('resume_existing');
  const exposed = await js(String.raw`(() => {
    const videoLike = value => /video|\.(mp4|mov|flv|f4v|mkv|rmvb?|m4v|mpg|mpeg|ts)\b/i.test(value || '')
    const input = [...document.querySelectorAll('input[type=file]')].find(el => videoLike(el.accept))
    if (!input) return { ok: false, reason: 'xiaohongshu video input missing' }
    input.id = 'vp2-xhs-video'
    return { ok: true, selector: '#vp2-xhs-video', accept: input.accept || '' }
  })()`);
  if (!exposed.ok) return { ...before, blocker: typedBlocker('SELECTOR_DRIFT', exposed.reason) };
  try {
    await uploadFile(exposed.selector, videoPath);
  } catch (error) {
    return { ...before, blocker: typedBlocker('UPLOAD_NOT_STARTED', `小红书文件注入失败: ${String(error?.message || error)}`, { retryable: true }) };
  }
  return await waitXiaohongshuEarlyMutationReady('injected');
}

async function activateXhsTopicLifecycle() {
  await cdp('Page.bringToFront', {}).catch(() => {});
  await cdp('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await wait(.35);
  const state=await js(String.raw`(() => ({visibility:document.visibilityState,hasFocus:document.hasFocus()}))()`);
  return state.visibility==='visible'&&state.hasFocus
    ? {ok:true,...state}
    : {ok:false,reason:'xiaohongshu topic page did not become visible and focused',...state};
}

async function rebuildXhsTopics() {
  const attempts=[];
  for(let rebuildAttempt=1;rebuildAttempt<=3;rebuildAttempt+=1){
    const lifecycle=await activateXhsTopicLifecycle();
    if(!lifecycle.ok)return {...lifecycle,attempts};
    const cleared = await js(String.raw`(() => {
      const editors = [...document.querySelectorAll('[contenteditable="true"], [contenteditable=""]')]
      const editor = editors.find(el => el.querySelector('a') || /话题|creator-editor/i.test(String(el.className || ''))) || editors[0]
      if (!editor) return { ok: false, reason: 'xiaohongshu topic editor missing' }
      editor.focus()
      const selection = window.getSelection(); const range = document.createRange()
      range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range)
      document.execCommand('delete', false)
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward' }))
      return { ok: String(editor.innerText || editor.textContent || '').replace(/[\s\u200b]/g, '') === '' }
    })()`);
    if (!cleared.ok) return {...cleared,attempts};
    if(rebuildAttempt>1)await wait(1.5*rebuildAttempt);
    let failure=null;
    for (const tag of xhsTopics) {
    const queryTag = String(tag).replace(/\s+/g, '');
    const started = await js(String.raw`(() => {
      const editors = [...document.querySelectorAll('[contenteditable="true"], [contenteditable=""]')]
      const editor = editors.find(el => /话题|creator-editor/i.test(String(el.className || ''))) || editors[0]
      if (!editor) return { ok: false, reason: 'xiaohongshu topic editor lost focus' }
      const topicButton = document.querySelector('button.contentBtn.topic-btn, #topicBtn')
      if (!topicButton) return { ok: false, reason: 'xiaohongshu native topic button missing' }
      // The sticky publish footer can visually cover this toolbar near the viewport
      // bottom, so a real pointer click may land on the footer. Calling the native
      // Vue click handler still uses the site's own editor command to begin a topic.
      topicButton.click()
      editor.focus(); const selection = window.getSelection(); const range = document.createRange()
      range.selectNodeContents(editor); range.collapse(false); selection.removeAllRanges(); selection.addRange(range)
      const text = String(editor.innerText || editor.textContent || '')
      return { ok: document.activeElement === editor && text.trimEnd().endsWith('#'), active: document.activeElement === editor, text }
    })()`);
    if (!started.ok) { failure={ ...started, reason: started.reason || 'xiaohongshu native topic entry did not start',tag }; break; }
    await cdp('Input.insertText', { text: queryTag });
    await wait(1.2);
    const typed=await js(String.raw`((tag) => {const editors=[...document.querySelectorAll('[contenteditable="true"],[contenteditable=""]')];const editor=editors.find(el=>/话题|creator-editor/i.test(String(el.className||'')))||editors[0];const text=String(editor?.innerText||editor?.textContent||'').replace(/\u200b/g,'').trimEnd();return {ok:text.replace(/\s+/g,'').toLowerCase().endsWith(('#'+String(tag)).toLowerCase()),text}})(${JSON.stringify(queryTag)})`);
    if(!typed.ok){failure={ok:false,reason:'xiaohongshu topic query did not persist exactly',tag,typed};break;}
    let clicked = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      clicked = await js(String.raw`((tag) => {
      const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
      const normalize = value => String(value || '').replace(/\s+/g, '').toLowerCase()
      const tagLower = normalize(tag)
      const scopes = [...document.querySelectorAll('#creator-editor-topic-container, [data-tippy-root], .tippy-box, .tippy-content')]
      const rows = scopes.flatMap(scope => [...scope.querySelectorAll('.item, [role="option"], div, li')])
        .map(el => ({ el, text: compact(el.querySelector('.name')?.innerText || el.innerText || el.textContent || ''), rect: el.getBoundingClientRect() }))
        .filter(item => item.rect.width > 20 && item.rect.height > 10 && item.rect.height < 100)
        .map(item => {const match=item.text.match(/(?:\[话题\]\s*)?#([^\s#]+)/)||item.text.match(/^([^\s#]+)/);return {...item,topic:normalize(match?.[1]||'')}})
        .filter(item => item.topic === tagLower)
        .sort((a, b) => (a.rect.width*a.rect.height)-(b.rect.width*b.rect.height) || a.text.length-b.text.length)
      const row = rows[0]
      if (!row) return { ok: false, reason: 'exact topic suggestion missing', tag, visible: scopes.flatMap(scope=>[...scope.querySelectorAll('.item,[role="option"],li')]).map(el=>compact(el.innerText||el.textContent||'')).filter(Boolean).slice(0,12) }
      row.el.click(); return { ok: true, text: row.text }
    })(${JSON.stringify(queryTag)})`);
      if (clicked.ok) break;
      await wait(0.75);
    }
    if (!clicked.ok) { failure={...clicked,tag}; break; }
    await wait(1.2);
    const committed = await js(String.raw`((tag) => [...document.querySelectorAll('[contenteditable] a')]
      .some(el => {let name='';try{name=JSON.parse(el.getAttribute('data-topic')||'{}').name||''}catch{};if(!name)name=String(el.innerText||el.textContent||'').replace(/^#|\[话题\]#.*$/g,'');return name.replace(/\s+/g,'').toLowerCase()===String(tag).replace(/\s+/g,'').toLowerCase()}))(${JSON.stringify(tag)})`);
    if (!committed) { failure={ ok: false, reason: 'topic entity did not commit', tag }; break; }
    await cdp('Input.insertText', { text: ' ' });
    }
    if(!failure){
      const verified=await inspectXiaohongshu();
      if(verified.gates.tags.ok)return {ok:true,rebuildAttempt,attempts:[...attempts,{rebuildAttempt,result:'committed'}]};
      failure={ok:false,reason:'xiaohongshu topic entities did not pass exact post-build verification',evidence:verified.gates.tags.evidence};
    }
    attempts.push({rebuildAttempt,...failure});
    if(rebuildAttempt<3)await wait(2*rebuildAttempt);
  }
  const last=attempts.at(-1)||{};
  return {ok:false,reason:'xiaohongshu exact topics did not commit after bounded whole-set rebuilds',lastFailure:last,attempts};
}

async function ensureXhsOriginal() {
  await removeExactStaleMask(/笔记完成原创声明后|原创声明须知|声明原创/);
  let inspected = await inspectXiaohongshu();
  if (inspected.gates.original.ok) return { ok: true, already: true };
  const control = await js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const labels = [...document.querySelectorAll('div,section,label,span')].filter(el => compact(el.innerText || el.textContent || '') === '原创声明').sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return ar.width*ar.height-br.width*br.height})
    const label=labels[0]||null;const ancestors=[];for(let el=label;el&&ancestors.length<8;el=el.parentElement)ancestors.push(el)
    const selectors='.custom-switch-switch, .d-switch, [role="switch"], input[type="checkbox"]'
    const row=ancestors.find(el=>el.matches?.(selectors)||el.querySelector?.(selectors))||ancestors.find(el=>{const s=getComputedStyle(el);return compact(el.innerText||el.textContent||'')==='原创声明'&&(parseFloat(s.borderRadius)>0||s.backgroundColor!=='rgba(0, 0, 0, 0)')})||label?.parentElement
    const target=row?.querySelector?.('.d-switch-simulator')||(row?.matches?.('.d-switch-simulator')?row:null)||(row?.matches?.(selectors)?row:row?.querySelector(selectors))||row
    if (!target) return { ok: false, reason: 'xiaohongshu original switch missing' }
    target.id='vp2-xhs-original-control';target.scrollIntoView({block:'center',inline:'center'});return {ok:true,selector:'#vp2-xhs-original-control',className:String(target.className||''),tag:target.tagName,role:target.getAttribute?.('role')||''}
  })()`);
  if (!control.ok) return control;
  try { await click(control.selector,{label:'enable xhs original declaration'}); }
  catch (error) { return { ok: false, reason: `xiaohongshu original switch click failed: ${String(error?.message || error)}`, control }; }
  await wait(1.5);
  const agreement = await js(String.raw`(() => {
    const modal = [...document.querySelectorAll('.d-modal')].find(el => /笔记完成原创声明后|原创声明须知/.test(el.innerText || el.textContent || ''))
    if (!modal) return { ok: true, modal: false, alreadyClosed: true }
    const input = modal.querySelector('input[type="checkbox"]')
    if (!input) return { ok: false, reason: 'xiaohongshu original agreement checkbox missing' }
    if (input.checked) return { ok: true, modal: true, alreadyChecked: true }
    const checkbox = modal.querySelector('.d-checkbox-simulator') || input.closest('.d-checkbox') || input
    checkbox.id='vp2-xhs-original-agreement';checkbox.scrollIntoView({block:'center',inline:'center'})
    return { ok: true, modal: true, selector: '#vp2-xhs-original-agreement' }
  })()`);
  if (!agreement.ok) return { ...agreement, control };
  if (agreement.selector) {
    try { await click(agreement.selector, { label: 'accept xhs original declaration agreement' }); }
    catch (error) { return { ok: false, reason: `xiaohongshu original agreement click failed: ${String(error?.message || error)}`, control, agreement }; }
    await wait(.75);
  }
  let modalResult = { ok: true, modal: agreement.modal === true, alreadyClosed: agreement.alreadyClosed === true };
  if (agreement.modal) {
    let confirm = { ok: false, reason: 'xiaohongshu original confirm disabled' };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      confirm = await js(String.raw`(() => {
        const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
        const modal = [...document.querySelectorAll('.d-modal')].find(el => /笔记完成原创声明后|原创声明须知/.test(el.innerText || el.textContent || ''))
        if (!modal) return { ok: true, alreadyClosed: true }
        const input = modal.querySelector('input[type="checkbox"]')
        const button = [...modal.querySelectorAll('button')].find(el => compact(el.innerText || el.textContent || '') === '声明原创')
        if (!input?.checked || !button || button.disabled) return { ok: false, waiting: true, agreementChecked: Boolean(input?.checked), buttonDisabled: Boolean(button?.disabled) }
        button.id='vp2-xhs-original-confirm';button.scrollIntoView({block:'center',inline:'center'})
        return { ok: true, selector: '#vp2-xhs-original-confirm' }
      })()`);
      if (confirm.ok) break;
      await wait(.25);
    }
    if (!confirm.ok) return { ok: false, reason: 'xiaohongshu original confirm disabled', control, agreement, confirm };
    if (confirm.selector) {
      try { await click(confirm.selector, { label: 'confirm xhs original declaration' }); }
      catch (error) { return { ok: false, reason: `xiaohongshu original confirm click failed: ${String(error?.message || error)}`, control, agreement, confirm }; }
    }
    modalResult = { ok: true, modal: true, confirm };
  }
  await wait(2);
  inspected = await inspectXiaohongshu();
  if (!inspected.gates.noBlockingDialog.ok) return { ok: false, reason: 'xiaohongshu original declaration dialog did not close', control, agreement, modalResult, evidence: inspected.gates.noBlockingDialog.evidence };
  return inspected.gates.original.ok ? { ok: true, control, modalResult } : { ok: false, reason: 'xiaohongshu original declaration did not persist', control, modalResult };
}

async function uploadXhsCover() {
  if (!xhsCustomCover) return { ok: true, skipped: true };
  const before = await js(String.raw`(() => { const el=document.querySelector('.cover-plugin-preview .default.row, .cover-plugin-preview .default.column'); return el ? getComputedStyle(el).backgroundImage : '' })()`);
  let tab = { ok: false, reason: 'xiaohongshu upload-cover tab did not become visible' };
  for (let attempt = 0; attempt < 4 && !tab.ok; attempt += 1) {
    await removeExactStaleMask(/设置封面/);
    const existingEditor = await js(String.raw`(() => {
      const compact=value=>String(value||'').replace(/\s+/g,' ').trim()
      const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>10&&r.height>10&&s.display!=='none'&&s.visibility!=='hidden'}
      const modal=[...document.querySelectorAll('.main-cover-editor-modal,.d-modal,[role="dialog"]')]
        .find(el=>(el.matches('.main-cover-editor-modal')||/设置封面/.test(compact(el.innerText||el.textContent||'')))&&visible(el))
      const scope=modal||document
      const input=[...scope.querySelectorAll('input[type=file]')].find(el=>/image|png|jpe?g/i.test(el.accept||''))
      const uploaded=[...scope.querySelectorAll('.uploaded-thumbnail-img')].find(el=>el.naturalWidth>0&&el.naturalHeight>0&&visible(el))
      return uploaded
        ? {ok:true,alreadyUploaded:true,width:uploaded.naturalWidth,height:uploaded.naturalHeight}
        : {ok:!!input}
    })()`);
    if (existingEditor.ok) {
      tab = { ok: true, attempt: attempt + 1, mode: existingEditor.alreadyUploaded ? 'resume-uploaded-thumbnail' : 'direct-image-input', alreadyUploaded: existingEditor.alreadyUploaded === true };
      break;
    }
    const opener = await js(String.raw`((attempt) => {
      const compact=value=>String(value||'').replace(/\s+/g,' ').trim()
      const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>10&&r.height>10&&s.display!=='none'&&s.visibility!=='hidden'}
      const exact=[...document.querySelectorAll('button,[role="button"],div,span')]
        .filter(el=>compact(el.innerText||el.textContent||'')==='编辑封面'&&visible(el))
        .sort((a,b)=>{const ab=a.matches('button,[role="button"]')?0:1,bb=b.matches('button,[role="button"]')?0:1;if(ab!==bb)return ab-b;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return ar.width*ar.height-br.width*br.height})
      const currentEntry=[...document.querySelectorAll('.cover-edit-entry')].find(visible)
      const currentStack=[...document.querySelectorAll('.cover-edit-stack')].find(visible)
      const currentOperator=[...document.querySelectorAll('.operator.default')].find(visible)
      const preview=document.querySelector('.cover-plugin-preview .default.row, .cover-plugin-preview .default.column')
      const targets=[currentEntry,currentStack,currentOperator,preview].filter(Boolean)
      const target=targets[attempt]||exact[0]||preview
      if(!target)return {ok:false,reason:'xiaohongshu cover editor opener missing'}
      target.scrollIntoView({block:'center',inline:'center'})
      if(target.matches('.cover-edit-entry')){target.click();return {ok:true,nativeHoverEntry:true,text:compact(target.innerText||target.textContent||'')}}
      document.querySelectorAll('#vp2-xhs-cover-opener').forEach(el=>el.removeAttribute('id'))
      target.id='vp2-xhs-cover-opener';return {ok:true,selector:'#vp2-xhs-cover-opener',text:compact(target.innerText||target.textContent||'')}
    })(${JSON.stringify(attempt)})`);
    if (!opener.ok) {
      tab = opener;
      continue;
    }
    if (!opener.nativeHoverEntry) {
      try {
        await click(opener.selector, { label: 'open xhs cover editor' });
      } catch (error) {
        tab = { ok: false, reason: `xiaohongshu cover preview click failed: ${String(error?.message || error)}` };
        continue;
      }
    }
    await wait(0.75);
    const openedAfterRealClick = await js(String.raw`(() => {
      const compact=value=>String(value||'').replace(/\s+/g,' ').trim()
      const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>10&&r.height>10&&s.display!=='none'&&s.visibility!=='hidden'}
      const modal=[...document.querySelectorAll('.main-cover-editor-modal,.d-modal,[role="dialog"]')]
        .find(el=>(el.matches('.main-cover-editor-modal')||/设置封面/.test(compact(el.innerText||el.textContent||'')))&&visible(el))
      const input=[...(modal?.querySelectorAll('input[type=file]')||[])].find(el=>/image|png|jpe?g/i.test(el.accept||''))
      return Boolean(modal||input)
    })()`);
    if (!openedAfterRealClick) {
      await js(String.raw`(() => {
        const target=document.querySelector('.cover-plugin-preview .cover-edit-entry')||document.querySelector('#vp2-xhs-cover-opener')
        if(!target)return {ok:false,reason:'xiaohongshu cover opener disappeared before native fallback'}
        target.click();return {ok:true}
      })()`);
    }
    for (let index = 0; index < 20; index += 1) {
      const exposed = await js(String.raw`(() => {
        const compact=value=>String(value||'').replace(/\s+/g,' ').trim()
        const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>10&&r.height>10&&s.display!=='none'&&s.visibility!=='hidden'}
        const modal=[...document.querySelectorAll('.main-cover-editor-modal,.d-modal,[role="dialog"]')]
          .find(el=>(el.matches('.main-cover-editor-modal')||/设置封面/.test(compact(el.innerText||el.textContent||'')))&&visible(el))
        const scope=modal||document
        const uploaded=[...scope.querySelectorAll('.uploaded-thumbnail-img')].find(el=>el.naturalWidth>0&&el.naturalHeight>0&&visible(el))
        if(uploaded)return {ok:true,alreadyUploaded:true}
        const input=[...scope.querySelectorAll('input[type=file]')].find(el=>/image|png|jpe?g/i.test(el.accept||''))
        if(input)return {ok:true,directInput:true}
        const item=[...scope.querySelectorAll('.d-tabs-header,[role="tab"],button,div,span')]
          .filter(el=>{const label=compact(el.innerText||el.textContent||'');return (/^(上传封面|上传)$/.test(label)||/^(上传图片|本地上传|从本地上传)$/.test(label))&&visible(el)})
          .sort((a,b)=>{const ap=a.matches('.d-tabs-header,[role="tab"],button')?0:1,bp=b.matches('.d-tabs-header,[role="tab"],button')?0:1;if(ap!==bp)return ap-bp;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return ar.width*ar.height-br.width*br.height})[0]
        if(!item)return {ok:false,directInput:false}
        item.id='vp2-xhs-upload-cover-tab';item.scrollIntoView({block:'center',inline:'center'});return {ok:true,selector:'#vp2-xhs-upload-cover-tab'}
      })()`);
      if (exposed.ok) {
        if (exposed.alreadyUploaded) {
          tab = { ok: true, attempt: attempt + 1, waited: index * 0.5, mode: 'resume-uploaded-thumbnail', alreadyUploaded: true };
          break;
        }
        if (exposed.directInput) {
          tab = { ok: true, attempt: attempt + 1, waited: index * 0.5, mode: 'direct-image-input' };
          break;
        }
        try {
          await click(exposed.selector, { label: 'activate xhs upload-cover tab' });
          tab = { ok: true, attempt: attempt + 1, waited: index * 0.5 };
        } catch (error) {
          tab = { ok: false, reason: `xiaohongshu upload-cover tab click failed: ${String(error?.message || error)}` };
        }
        break;
      }
      await wait(0.5);
    }
  }
  if (!tab.ok) {
    const diagnostics = await js(String.raw`(() => {
      const compact=value=>String(value||'').replace(/\s+/g,' ').trim()
      const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden'}
      const candidates=[...document.querySelectorAll('button,[role="button"],[role="tab"],div,span')]
        .filter(el=>visible(el)&&/封面|上传|本地|图片/.test(compact(el.innerText||el.textContent||'')))
        .map(el=>({tag:el.tagName,role:el.getAttribute?.('role')||'',className:String(el.className||'').slice(0,180),text:compact(el.innerText||el.textContent||'').slice(0,180)}))
        .filter((item,index,array)=>array.findIndex(other=>other.tag===item.tag&&other.role===item.role&&other.className===item.className&&other.text===item.text)===index)
        .slice(0,80)
      const dialogs=[...document.querySelectorAll('.main-cover-editor-modal,.d-modal,[role="dialog"],[class*="modal"],[class*="drawer"]')]
        .filter(visible)
        .map(el=>({tag:el.tagName,role:el.getAttribute?.('role')||'',className:String(el.className||'').slice(0,180),text:compact(el.innerText||el.textContent||'').slice(0,600)}))
        .slice(0,20)
      const inputs=[...document.querySelectorAll('input[type=file]')].map(el=>({accept:el.accept||'',className:String(el.className||''),outerHTML:String(el.outerHTML||'').slice(0,500)}))
      return {candidates,dialogs,inputs}
    })()`);
    return { ...tab, diagnostics };
  }
  if (!tab.alreadyUploaded) {
    await wait(1);
    const exposed = await js(String.raw`(() => {
      const input=[...document.querySelectorAll('input[type=file]')].find(el=>/image|png|jpe?g/i.test(el.accept||''))
      if(!input)return {ok:false,reason:'xiaohongshu cover input missing'}
      input.id='vp2-xhs-cover'; return {ok:true,selector:'#vp2-xhs-cover',accept:input.accept||''}
    })()`);
    if (!exposed.ok) return exposed;
    try { await uploadFile(exposed.selector, xhsCoverPath); } catch (error) { return { ok: false, reason: String(error?.message || error) }; }
    await wait(2);
  }
  let ratio = await js(String.raw`(() => {
    const item=[...document.querySelectorAll('.crop-ratio-item')].find(el=>String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()==='3:4')
    if(!item)return {ok:false,reason:'legacy-ratio-control-missing'}
    item.click(); return {ok:true,className:String(item.className||'')}
  })()`);
  if (!ratio.ok) {
    const ratioControl = await js(String.raw`(() => {
      const compact=value=>String(value||'').replace(/\s+/g,' ').trim()
      const modal=[...document.querySelectorAll('.main-cover-editor-modal,.d-modal,[role="dialog"]')]
        .find(el=>el.matches('.main-cover-editor-modal')||/设置封面/.test(compact(el.innerText||el.textContent||'')))
      const item=modal?.querySelector('.ratio-select')
      if(!item){
        const uploaded=[...modal?.querySelectorAll('.uploaded-thumbnail-img')||[]].find(el=>el.naturalWidth>0&&el.naturalHeight>0)
        const actualRatio=uploaded?uploaded.naturalWidth/uploaded.naturalHeight:0
        if(uploaded&&Math.abs(actualRatio-0.75)<0.01)return {ok:true,already:true,inferredFromUploadedThumbnail:true,actual:'3:4',width:uploaded.naturalWidth,height:uploaded.naturalHeight}
        return {ok:false,reason:'xiaohongshu ratio selector missing',uploadedThumbnail:uploaded?{width:uploaded.naturalWidth,height:uploaded.naturalHeight}:null}
      }
      if(String(item.innerText||item.textContent||'').replace(/\s+/g,' ').trim()==='3:4')return {ok:true,already:true}
      item.id='vp2-xhs-ratio-select';return {ok:true,selector:'#vp2-xhs-ratio-select'}
    })()`);
    if (!ratioControl.ok) return ratioControl;
    if (!ratioControl.already) {
      try { await click(ratioControl.selector, { label: 'open xhs cover ratio selector' }); } catch (error) { return { ok: false, reason: `xiaohongshu ratio selector click failed: ${String(error?.message || error)}` }; }
      await wait(0.5);
      const ratioItem = await js(String.raw`(() => {
        const item=[...document.querySelectorAll('.ratio-select-menu .ratio-item')].find(el=>String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()==='3:4')
        if(!item)return {ok:false,reason:'xiaohongshu 3:4 ratio option missing'}
        item.id='vp2-xhs-ratio-3x4';return {ok:true,selector:'#vp2-xhs-ratio-3x4'}
      })()`);
      if (!ratioItem.ok) return ratioItem;
      try { await click(ratioItem.selector, { label: 'select xhs 3:4 cover ratio' }); } catch (error) { return { ok: false, reason: `xiaohongshu 3:4 ratio click failed: ${String(error?.message || error)}` }; }
      await wait(0.5);
    }
    ratio = ratioControl.inferredFromUploadedThumbnail
      ? ratioControl
      : await js(String.raw`(() => {
        const modal=[...document.querySelectorAll('.main-cover-editor-modal,.d-modal,[role="dialog"]')].find(el=>el.matches('.main-cover-editor-modal')||/设置封面/.test(el.innerText||el.textContent||''))
        const actual=String(modal?.querySelector('.ratio-select')?.innerText||modal?.querySelector('.ratio-select')?.textContent||'').replace(/\s+/g,' ').trim()
        return actual==='3:4'?{ok:true,actual}:{ok:false,reason:'xiaohongshu 3:4 ratio did not persist',actual}
      })()`);
  }
  if (!ratio.ok) return ratio;
  await wait(1);
  const confirmed = await js(String.raw`(() => {
    const compact=value=>String(value||'').replace(/\s+/g,' ').trim()
    const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>10&&r.height>10&&s.display!=='none'&&s.visibility!=='hidden'}
    const modal=[...document.querySelectorAll('.main-cover-editor-modal,.d-modal,[role="dialog"]')]
      .find(el=>(el.matches('.main-cover-editor-modal')||/设置封面/.test(compact(el.innerText||el.textContent||'')))&&visible(el))
    const button=[...(modal?.querySelectorAll('button')||[])].find(el=>/^(确定|完成)$/.test(compact(el.innerText||el.textContent||''))&&!el.disabled&&visible(el))
    if(!button)return {ok:false,reason:'xiaohongshu cover confirm missing or disabled'}
    button.click(); return {ok:true}
  })()`);
  if (!confirmed.ok) return confirmed;
  let after = '';
  for (let index = 0; index < 60; index += 1) {
    const current = await js(String.raw`(() => { const el=document.querySelector('.cover-plugin-preview .default.row, .cover-plugin-preview .default.column'); const text=document.body.innerText||''; return {bg:el?getComputedStyle(el).backgroundImage:'',uploading:/封面上传中|正在上传|处理中/.test(text)} })()`);
    after = current.bg;
    if (after && after !== before && !current.uploading) break;
    await wait(2);
  }
  await removeExactStaleMask(/设置封面/);
  if (!after || after === before) return { ok: false, reason: 'xiaohongshu cover preview did not change', before, after };
  const url = (after.match(/url\(["']?([^"')]+)/) || [])[1] || after;
  return { ok: true, receipt: { assetPath: xhsCoverPath, ratio: '3:4', beforeUrl: before, afterUrl: url } };
}

async function ensureXiaohongshuEarlyMetadata(before) {
  const actions = {};
  if (!before.gates.title.ok) actions.title = await setNativeInputValue('input[placeholder*="填写标题"]', xhsTitle);
  let current = await inspectXiaohongshu();
  if (!current.gates.title.ok) {
    return { ok: false, actions, current, blocker: typedBlocker('ACTION_FAILED', '小红书标题没有持久化', { evidence: current.gates.title.evidence }) };
  }
  if (!current.gates.tags.ok) actions.tags = await rebuildXhsTopics();
  if (actions.tags && !actions.tags.ok) {
    current = await inspectXiaohongshu();
    return { ok: false, actions, current, blocker: typedBlocker('ACTION_FAILED', actions.tags.reason, { evidence: actions.tags }) };
  }
  current = await inspectXiaohongshu();
  return { ok: current.gates.title.ok && current.gates.tags.ok, actions, current };
}

async function prefillXiaohongshu() {
  const before = await inspectXiaohongshu();
  if (!before.gates.authenticated.ok) {
    return { ...before, blocker: typedBlocker('AUTH_REQUIRED', '小红书登录状态失效', { requiresUser: true, evidence: before.gates.authenticated.evidence }) };
  }
  if (!before.gates.draftIdentity.ok) {
    return { ...before, blocker: typedBlocker('FOREIGN_DRAFT', '小红书当前编辑器属于其他视频草稿', { evidence: before.gates.draftIdentity.evidence }) };
  }
  const uploading = before.gates.video.evidence?.uploading === true;
  if (!before.gates.video.ok && (!uploading || before.evidence?.earlyMutation?.ready !== true)) {
    return { ...before, blocker: typedBlocker('STATE_AMBIGUOUS', '小红书上传中的编辑区尚未完整就绪', { retryable: true, evidence: before.evidence?.earlyMutation }) };
  }
  const metadata = await ensureXiaohongshuEarlyMetadata(before);
  if (!metadata.ok) return { ...metadata.current, actions: metadata.actions, blocker: metadata.blocker };
  return { ...metadata.current, actions: { ...metadata.actions, prefill: { completedDuringUpload: uploading } } };
}

async function mutateXiaohongshu() {
  const before = await inspectXiaohongshu();
  if (!before.gates.video.ok) return { ...before, blocker: typedBlocker('STATE_AMBIGUOUS', '小红书没有可修复的已上传视频') };
  const metadata = await ensureXiaohongshuEarlyMetadata(before);
  if (!metadata.ok) return { ...metadata.current, actions: metadata.actions, blocker: metadata.blocker };
  const actions = { ...metadata.actions };
  actions.original = await ensureXhsOriginal();
  if (!actions.original.ok) return { ...(await inspectXiaohongshu()), blocker: typedBlocker('ACTION_FAILED', actions.original.reason, { evidence: actions.original }) };
  actions.cover = await uploadXhsCover();
  if (!actions.cover.ok) return { ...(await inspectXiaohongshu()), blocker: typedBlocker('PLATFORM_REJECTED_ASSET', actions.cover.reason, { retryable: true, evidence: actions.cover }) };
  const receipts = actions.cover.receipt ? { cover: actions.cover.receipt } : {};
  actions.receiptCheckpoint = checkpointReceipts(receipts);
  const previousReceipts = expectedReceipts;
  expectedReceipts.cover = receipts.cover || expectedReceipts.cover;
  const after = await inspectXiaohongshu();
  Object.assign(expectedReceipts, previousReceipts, receipts);
  return { ...after, actions, receipts };
}

async function runPlatformPhase() {
  if (phase === 'inspect' || phase === 'verify') return await inspectXiaohongshu();
  if (phase === 'upload_start') return await startXiaohongshuUpload();
  if (phase === 'prefill') return await prefillXiaohongshu();
  if (phase === 'upload') return await uploadXiaohongshu();
  if (phase === 'mutate') return await mutateXiaohongshu();
  return { ...(await inspectXiaohongshu()), blocker: typedBlocker('ACTION_FAILED', `unsupported Xiaohongshu phase: ${phase}`) };
}
