const V2_RESULT_PREFIX = 'VIDEO_PUBLISHER_V2_RESULT:';
const PLATFORM_URLS = {
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video',
  douyin: 'https://creator.douyin.com/creator-micro/content/upload',
  bilibili: 'https://member.bilibili.com/platform/upload/video/frame?spm_id_from=333.1007.top_bar.upload',
  wechat_channels: 'https://channels.weixin.qq.com/platform/post/create',
};
const PLATFORM_HOSTS = {
  xiaohongshu: /creator\.xiaohongshu\.com/,
  douyin: /creator\.douyin\.com/,
  bilibili: /member\.bilibili\.com/,
  wechat_channels: /channels\.weixin\.qq\.com/,
};
const FINAL_TEXT = /^(发布|发布笔记|发表|立即投稿)$/;
const FINAL_GUARD_KEY = '__VIDEO_PUBLISHER_FINAL_GUARD__';
let activeTaskSpace = null;
let taskSpaceRecovery = null;

const compactText = value => String(value || '').replace(/\s+/g, ' ').trim();
const unique = values => [...new Set((values || []).filter(Boolean))];

function typedBlocker(code, message, options = {}) {
  return {
    code,
    message,
    retryable: options.retryable === true,
    requiresUser: options.requiresUser === true,
    evidence: options.evidence || null,
  };
}

function okGate(evidence = {}, extra = {}) {
  return { ok: true, evidence, ...extra };
}

function failedGate(evidence = {}, extra = {}) {
  return { ok: false, evidence, ...extra };
}

async function selectTaskSpace() {
  const raw = String(taskSpaceRef || '').trim();
  const ref = raw && /^\d+$/.test(raw) ? Number(raw) : (raw || taskName);
  try {
    activeTaskSpace = await useOrCreateTaskSpace(ref);
    const identityMismatch = typeof ref === 'number'
      && Boolean(taskName)
      && Boolean(activeTaskSpace?.name)
      && activeTaskSpace.name !== taskName;
    if (identityMismatch) {
      const conflictingTaskSpace = activeTaskSpace;
      activeTaskSpace = await useOrCreateTaskSpace(taskName);
      taskSpaceRecovery = {
        recreated: true,
        reason: 'task_space_identity_mismatch',
        previousTaskSpaceId: ref,
        previousTaskSpaceName: conflictingTaskSpace.name,
        taskSpaceId: activeTaskSpace?.id ?? null,
        taskSpaceName: activeTaskSpace?.name || taskName,
      };
    }
  } catch (error) {
    const missingRecordedSpace = typeof ref === 'number' && /task space not found/i.test(String(error?.message || error));
    if (!missingRecordedSpace) throw error;
    activeTaskSpace = await useOrCreateTaskSpace(taskName);
    taskSpaceRecovery = { recreated: true, reason: 'task_space_not_found', previousTaskSpaceId: ref, taskSpaceId: activeTaskSpace?.id ?? null, taskSpaceName: activeTaskSpace?.name || taskName };
  }
  return activeTaskSpace;
}

async function selectPlatformTab() {
  const tabs = await listTabs();
  const match = tabs.find(tab => PLATFORM_HOSTS[platform].test(String(tab.url || '')));
  if (match) {
    await switchTab(match.targetId);
  } else {
    await openOrReuseTab(PLATFORM_URLS[platform], { wait: true, timeout: 45 });
  }
  await wait(1.5);
  const info = await pageInfo();
  if (info?.dialog) {
    return { ok: false, blocker: typedBlocker('STATE_AMBIGUOUS', `浏览器原生弹窗阻塞页面: ${info.dialog.message || 'unknown dialog'}`, { retryable: true, evidence: info.dialog }) };
  }
  if (!info || info.w < 300 || info.h < 300) {
    return { ok: false, blocker: typedBlocker('INPUT_CHANNEL_BROKEN', 'Ego Lite 页面视口不可用', { retryable: true, evidence: info }) };
  }
  return { ok: true, info };
}

async function armFinalPublishGuard() {
  return await js(String.raw`((key, finalSource, finalFlags) => {
    const existing = window[key]
    if (existing?.armed === true && existing.version === 1) {
      return { ok: true, armed: true, version: existing.version, armedAt: existing.armedAt, blockedAttempts: existing.blockedAttempts.length }
    }
    const finalText = new RegExp(finalSource, finalFlags)
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const state = { armed: true, version: 1, armedAt: new Date().toISOString(), blockedAttempts: [] }
    const buttonLabel = element => {
      if (!(element instanceof Element)) return ''
      const buttonish = element.matches('button, input[type="submit"], [role="button"], .d-button, .bcc-button')
      if (!buttonish) return ''
      return compact(element.value || element.getAttribute('aria-label') || element.innerText || element.textContent || '')
    }
    const guard = event => {
      const candidates = [event.submitter, ...(typeof event.composedPath === 'function' ? event.composedPath() : []), event.target]
      const match = candidates.map(element => ({ element, label: buttonLabel(element) })).find(item => finalText.test(item.label))
      if (!match) return
      event.preventDefault()
      event.stopImmediatePropagation()
      state.blockedAttempts.push({ type: event.type, label: match.label, at: new Date().toISOString() })
    }
    document.addEventListener('click', guard, true)
    document.addEventListener('submit', guard, true)
    window[key] = state
    return { ok: true, armed: true, version: state.version, armedAt: state.armedAt, blockedAttempts: 0 }
  })(${JSON.stringify(FINAL_GUARD_KEY)}, ${JSON.stringify(FINAL_TEXT.source)}, ${JSON.stringify(FINAL_TEXT.flags)})`);
}

async function inspectFinalPublishGuard() {
  return await js(String.raw`((key) => {
    const state = window[key]
    return state?.armed === true && state.version === 1
      ? { armed: true, version: state.version, armedAt: state.armedAt, blockedAttempts: state.blockedAttempts.length, attempts: state.blockedAttempts.slice(-5) }
      : { armed: false, version: state?.version || null, blockedAttempts: state?.blockedAttempts?.length || 0, attempts: state?.blockedAttempts?.slice?.(-5) || [] }
  })(${JSON.stringify(FINAL_GUARD_KEY)})`);
}

function checkpointReceipts(receipts) {
  if (!receiptCheckpointPath || !jobFingerprint || !receipts || !Object.keys(receipts).length) {
    return { ok: false, skipped: true };
  }
  const payload = {
    schemaVersion: 2,
    platform,
    fingerprint: jobFingerprint,
    taskSpaceId: activeTaskSpace?.id ?? null,
    writtenAt: new Date().toISOString(),
    receipts,
  };
  fs.mkdirSync(path.dirname(receiptCheckpointPath), { recursive: true });
  const temp = `${receiptCheckpointPath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(temp, receiptCheckpointPath);
  return { ok: true, path: receiptCheckpointPath, writtenAt: payload.writtenAt };
}

async function preparePlatform() {
  const task = await selectTaskSpace();
  const selected = await selectPlatformTab();
  if (!selected.ok) return { task, selected };
  const guard = await armFinalPublishGuard();
  if (!guard.ok || !guard.armed) {
    return {
      task,
      selected: {
        ok: false,
        blocker: typedBlocker('INPUT_CHANNEL_BROKEN', '最终发布按钮硬保护无法挂载', { retryable: true, evidence: guard }),
      },
    };
  }
  return { task, selected, guard };
}

async function pageRootsState() {
  return await js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const roots = [document, ...[...document.querySelectorAll('*')].map(el => el.shadowRoot).filter(Boolean)]
    const text = roots.map(root => root.body?.innerText || root.host?.innerText || '').join('\n')
    return { url: location.href, title: document.title, text: compact(text), rootCount: roots.length }
  })()`);
}

async function inspectFinalButtons(labels = FINAL_TEXT) {
  return await js(String.raw`((source, flags) => {
    const re = new RegExp(source, flags)
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const roots = [document, ...[...document.querySelectorAll('*')].map(el => el.shadowRoot).filter(Boolean)]
    return roots.flatMap(root => [...root.querySelectorAll('button, [role="button"], .d-button, .bcc-button, div, span')])
      .map(el => {
        const rect = el.getBoundingClientRect(); const style = getComputedStyle(el)
        const text = compact(el.innerText || el.textContent || '')
        const buttonish = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || /button|btn|submit/i.test(String(el.className || ''))
        return { text, disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true' || /disabled|loading/.test(String(el.className || '')), buttonish, width: Math.round(rect.width), height: Math.round(rect.height), display: style.display, visibility: style.visibility }
      })
      .filter(item => re.test(item.text) && item.width > 12 && item.height > 12 && item.display !== 'none' && item.visibility !== 'hidden')
      .sort((a, b) => Number(b.buttonish) - Number(a.buttonish) || (a.width * a.height) - (b.width * b.height))
  })(${JSON.stringify(labels.source)}, ${JSON.stringify(labels.flags)})`);
}

async function inspectBlockingDialogs(allowPatterns = []) {
  return await js(String.raw`((allowSources) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const allowed = allowSources.map(source => new RegExp(source))
    const roots = [document, ...[...document.querySelectorAll('*')].map(el => el.shadowRoot).filter(Boolean)]
    const selectors = '.d-modal-mask, .semi-modal-mask, .bcc-dialog, .bcc-modal, [role="dialog"], [class*="modal-mask"], [class*="dialog-mask"]'
    return roots.flatMap(root => [...root.querySelectorAll(selectors)])
      .map(el => {
        const rect = el.getBoundingClientRect(); const style = getComputedStyle(el)
        const text = compact(el.innerText || el.textContent || '')
        const staleLeaving = /leave-active/.test(String(el.className || '')) && Number(style.opacity) === 0
        return { text: text.slice(0, 600), className: String(el.className || ''), width: rect.width, height: rect.height, opacity: style.opacity, pointerEvents: style.pointerEvents, display: style.display, visibility: style.visibility, staleLeaving }
      })
      .filter(item => item.width > 20 && item.height > 20 && item.display !== 'none' && item.visibility !== 'hidden' && !item.staleLeaving)
      .filter(item => !allowed.some(re => re.test(item.text)))
  })(${JSON.stringify(allowPatterns.map(pattern => pattern.source))})`);
}

async function setNativeInputValue(selector, value) {
  return await js(String.raw`((selector, value) => {
    const el = document.querySelector(selector)
    if (!el) return { ok: false, reason: 'input missing', selector }
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (!setter) return { ok: false, reason: 'native value setter missing' }
    el.focus(); setter.call(el, value)
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }))
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    el.blur()
    return { ok: el.value === value, value: el.value }
  })(${JSON.stringify(selector)}, ${JSON.stringify(value)})`);
}

async function removeExactStaleMask(textPattern) {
  return await js(String.raw`((source, flags) => {
    const re = new RegExp(source, flags)
    const masks = [...document.querySelectorAll('.d-modal-mask, [class*="modal-mask"]')]
      .filter(el => re.test(el.innerText || el.textContent || ''))
      .filter(el => /leave-active/.test(String(el.className || '')) && Number(getComputedStyle(el).opacity) === 0)
    masks.forEach(el => el.remove())
    return { removed: masks.length }
  })(${JSON.stringify(textPattern.source)}, ${JSON.stringify(textPattern.flags)})`);
}

async function emitObservation(observation) {
  const guard = await inspectFinalPublishGuard().catch(error => ({
    armed: false,
    blockedAttempts: 0,
    error: String(error?.message || error),
  }));
  const payload = {
    schemaVersion: 1,
    platform,
    phase,
    taskSpaceId: activeTaskSpace?.id ?? null,
    taskSpace: activeTaskSpace?.name || taskName,
    taskSpaceRecovery,
    observedAt: new Date().toISOString(),
    finalPublishClicked: false,
    ...observation,
  };
  // Safety is injected centrally and backed by a page-level capture guard.
  // A blocked attempt keeps the draft unpublished, but intentionally fails READY
  // so accidental final-button interaction cannot pass unnoticed.
  payload.gates ||= {};
  const safetyEvidence = { finalPublishClicked: false, guardArmed: guard.armed === true, blockedAttempts: guard.blockedAttempts || 0, attempts: guard.attempts || [], guardVersion: guard.version || null };
  payload.gates.safety = guard.armed === true && guard.blockedAttempts === 0
    ? okGate(safetyEvidence)
    : failedGate(safetyEvidence);
  delete payload.ready;
  cliLog(V2_RESULT_PREFIX + JSON.stringify(payload));
  return payload;
}
