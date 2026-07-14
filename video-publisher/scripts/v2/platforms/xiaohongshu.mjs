const xhsTitle = pkg.platformTitle.xiaohongshu;
const xhsTopics = pkg.xhsTopics;
const xhsVideoName = videoPath.split('/').pop();
const xhsCustomCover = pkg.cover?.uploadCustomCover === true;
const xhsCoverPath = String(pkg.cover?.vertical3x4Path || '');

async function inspectXiaohongshu() {
  const state = await js(String.raw`((expectedName, expectedTitle, requestedTopics) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
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
    const originalEnabled = Boolean(originalSwitch && (
      originalSwitch.checked === true
      || originalSwitch.getAttribute?.('aria-checked') === 'true'
      || originalSwitch.getAttribute?.('data-state') === 'checked'
      || /checked|active|open|enabled/.test(String(originalSwitch.className || ''))
      || /checked|active|open|enabled/.test(String(simulator?.className || ''))
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
    return { text: text.slice(0, 2600), title, editorText, selected, topicCounts, plainResidue, duplicate, originalEnabled, activeDialogs, coverBg, filenameVisible, uploaded, uploading, failed, loginRequired }
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
    evidence: { pageSample: state.text },
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

async function rebuildXhsTopics() {
  const cleared = await js(String.raw`(() => {
    const editors = [...document.querySelectorAll('[contenteditable="true"], [contenteditable=""]')]
    const editor = editors.find(el => el.querySelector('a') || /话题|creator-editor/i.test(String(el.className || ''))) || editors[0]
    if (!editor) return { ok: false, reason: 'xiaohongshu topic editor missing' }
    editor.focus()
    const selection = window.getSelection(); const range = document.createRange()
    range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range)
    document.execCommand('delete', false)
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward' }))
    return { ok: String(editor.innerText || editor.textContent || '').replace(/\s+/g, ' ').trim() === '' }
  })()`);
  if (!cleared.ok) return cleared;
  for (const tag of xhsTopics) {
    const queryTag = String(tag).replace(/\s+/g, '');
    const focused = await js(String.raw`(() => {
      const editors = [...document.querySelectorAll('[contenteditable="true"], [contenteditable=""]')]
      const editor = editors.find(el => /话题|creator-editor/i.test(String(el.className || ''))) || editors[0]
      if (!editor) return false
      editor.focus(); const selection = window.getSelection(); const range = document.createRange()
      range.selectNodeContents(editor); range.collapse(false); selection.removeAllRanges(); selection.addRange(range)
      return true
    })()`);
    if (!focused) return { ok: false, reason: 'xiaohongshu topic editor lost focus' };
    await cdp('Input.insertText', { text: `#${queryTag}` });
    await wait(1.8);
    const clicked = await js(String.raw`((tag) => {
      const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
      const tagLower = String(tag).toLowerCase()
      const scopes = [...document.querySelectorAll('#creator-editor-topic-container, [data-tippy-root], .tippy-box, .tippy-content')]
      const rows = scopes.flatMap(scope => [...scope.querySelectorAll('.item, [role="option"], div, li')])
        .map(el => ({ el, text: compact(el.querySelector('.name')?.innerText || el.innerText || el.textContent || ''), rect: el.getBoundingClientRect() }))
        .filter(item => item.rect.width > 20 && item.rect.height > 10 && item.rect.height < 100)
        .filter(item => ((item.text.toLowerCase().match(/^#[^\s#]+/) || [''])[0]) === '#' + tagLower)
        .sort((a, b) => a.text.length - b.text.length)
      const row = rows[0]
      if (!row) return { ok: false, reason: 'exact topic suggestion missing', tag }
      row.el.click(); return { ok: true, text: row.text }
    })(${JSON.stringify(queryTag)})`);
    if (!clicked.ok) return clicked;
    await wait(1.2);
    const committed = await js(String.raw`((tag) => [...document.querySelectorAll('[contenteditable] a')]
      .some(el => {let name='';try{name=JSON.parse(el.getAttribute('data-topic')||'{}').name||''}catch{};if(!name)name=String(el.innerText||el.textContent||'').replace(/^#|\[话题\]#.*$/g,'');return name.replace(/\s+/g,'').toLowerCase()===String(tag).replace(/\s+/g,'').toLowerCase()}))(${JSON.stringify(tag)})`);
    if (!committed) return { ok: false, reason: 'topic entity did not commit', tag };
    await cdp('Input.insertText', { text: ' ' });
  }
  return { ok: true };
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
    const target=(row?.matches?.(selectors)?row:row?.querySelector(selectors))||row
    if (!target) return { ok: false, reason: 'xiaohongshu original switch missing' }
    target.id='vp2-xhs-original-control';target.scrollIntoView({block:'center',inline:'center'});return {ok:true,selector:'#vp2-xhs-original-control',className:String(target.className||''),tag:target.tagName,role:target.getAttribute?.('role')||''}
  })()`);
  if (!control.ok) return control;
  await click(control.selector,{label:'enable xhs original declaration'}).catch(()=>{});
  await wait(1.5);
  const modalResult = await js(String.raw`(() => {
    const modal = [...document.querySelectorAll('.d-modal')].find(el => /笔记完成原创声明后|原创声明须知/.test(el.innerText || el.textContent || ''))
    if (!modal) return { ok: true, modal: false }
    const checkbox = modal.querySelector('.d-checkbox, input[type="checkbox"]')
    const input = modal.querySelector('input[type="checkbox"]')
    if (input && !input.checked) (checkbox || input).click()
    const button = [...modal.querySelectorAll('button')].find(el => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() === '声明原创')
    if (!button || button.disabled) return { ok: false, reason: 'xiaohongshu original confirm disabled' }
    button.click(); return { ok: true, modal: true }
  })()`);
  await wait(2);
  await removeExactStaleMask(/笔记完成原创声明后|原创声明须知|声明原创/);
  inspected = await inspectXiaohongshu();
  return inspected.gates.original.ok ? { ok: true, control, modalResult } : { ok: false, reason: 'xiaohongshu original declaration did not persist', control, modalResult };
}

async function uploadXhsCover() {
  if (!xhsCustomCover) return { ok: true, skipped: true };
  const before = await js(String.raw`(() => { const el=document.querySelector('.cover-plugin-preview .default.row, .cover-plugin-preview .default.column'); return el ? getComputedStyle(el).backgroundImage : '' })()`);
  let tab = { ok: false, reason: 'xiaohongshu upload-cover tab did not become visible' };
  for (let attempt = 0; attempt < 2 && !tab.ok; attempt += 1) {
    await removeExactStaleMask(/设置封面/);
    try {
      await click('.cover-plugin-preview .default.row, .cover-plugin-preview .default.column', { label: 'open xhs cover editor' });
    } catch (error) {
      tab = { ok: false, reason: `xiaohongshu cover preview click failed: ${String(error?.message || error)}` };
      continue;
    }
    for (let index = 0; index < 20; index += 1) {
      const exposed = await js(String.raw`(() => {
        const compact=value=>String(value||'').replace(/\s+/g,' ').trim()
        const item=[...document.querySelectorAll('.d-tabs-header')]
          .find(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return compact(el.innerText||el.textContent||'')==='上传封面'&&r.width>10&&r.height>10&&s.display!=='none'&&s.visibility!=='hidden'})
        if(!item)return {ok:false}
        item.id='vp2-xhs-upload-cover-tab';item.scrollIntoView({block:'center',inline:'center'});return {ok:true,selector:'#vp2-xhs-upload-cover-tab'}
      })()`);
      if (exposed.ok) {
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
  if (!tab.ok) return tab;
  await wait(1);
  const exposed = await js(String.raw`(() => {
    const input=[...document.querySelectorAll('input[type=file]')].find(el=>/image|png|jpe?g/i.test(el.accept||''))
    if(!input)return {ok:false,reason:'xiaohongshu cover input missing'}
    input.id='vp2-xhs-cover'; return {ok:true,selector:'#vp2-xhs-cover',accept:input.accept||''}
  })()`);
  if (!exposed.ok) return exposed;
  try { await uploadFile(exposed.selector, xhsCoverPath); } catch (error) { return { ok: false, reason: String(error?.message || error) }; }
  await wait(2);
  const ratio = await js(String.raw`(() => {
    const item=[...document.querySelectorAll('.crop-ratio-item')].find(el=>String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()==='3:4')
    if(!item)return {ok:false,reason:'xiaohongshu 3:4 crop chip missing'}
    item.click(); return {ok:true,className:String(item.className||'')}
  })()`);
  if (!ratio.ok) return ratio;
  await wait(1);
  const confirmed = await js(String.raw`(() => {
    const modal=[...document.querySelectorAll('.d-modal')].find(el=>/设置封面/.test(el.innerText||el.textContent||''))
    const button=[...(modal?.querySelectorAll('button')||[])].find(el=>String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()==='确定'&&!el.disabled)
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

async function mutateXiaohongshu() {
  const before = await inspectXiaohongshu();
  if (!before.gates.video.ok) return { ...before, blocker: typedBlocker('STATE_AMBIGUOUS', '小红书没有可修复的已上传视频') };
  const actions = {};
  if (!before.gates.title.ok) actions.title = await setNativeInputValue('input[placeholder*="填写标题"]', xhsTitle);
  const afterTitle = await inspectXiaohongshu();
  if (!afterTitle.gates.tags.ok) actions.tags = await rebuildXhsTopics();
  if (actions.tags && !actions.tags.ok) return { ...(await inspectXiaohongshu()), blocker: typedBlocker('ACTION_FAILED', actions.tags.reason, { evidence: actions.tags }) };
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
  if (phase === 'upload') return await uploadXiaohongshu();
  if (phase === 'mutate') return await mutateXiaohongshu();
  return { ...(await inspectXiaohongshu()), blocker: typedBlocker('ACTION_FAILED', `unsupported Xiaohongshu phase: ${phase}`) };
}
