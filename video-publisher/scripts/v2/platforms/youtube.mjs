const youtubeTitle = pkg.platformTitle.youtube;
const youtubeDescription = pkg.youtubeDescription;
const youtubeTags = pkg.youtubeTags;
const youtubeAudience = pkg.youtubeAudience;
const youtubeVisibility = pkg.youtubeVisibility;
const youtubeCategory = pkg.youtubeCategory;
const youtubeLanguage = pkg.youtubeLanguage;
const youtubePlaylist = pkg.youtubePlaylist;
const youtubeLicense = pkg.youtubeLicense;
const youtubePaidPromotion = pkg.youtubePaidPromotion === true;
const youtubeAlteredContent = pkg.youtubeAlteredContent === true;
const youtubeAllowEmbedding = pkg.youtubeAllowEmbedding !== false;
const youtubeNotifySubscribers = pkg.youtubeNotifySubscribers !== false;
const youtubeVideoName = videoPath.split('/').pop();
const youtubeVideoStem = youtubeVideoName.replace(/\.[^.]+$/, '');
const youtubeCustomThumbnail = pkg.cover?.uploadCustomCover === true;
const youtubeThumbnailPath = String(pkg.cover?.horizontal16x9Path || '');
const normalizeYoutubeLabel = value => String(value || '')
  .replace(/\s+/g, '')
  .replace(/[（]/g, '(')
  .replace(/[）]/g, ')')
  .replace(/与/g, '和')
  .toLowerCase();

async function activateYoutubeLifecycle() {
  await cdp('Page.bringToFront', {}).catch(() => null);
  await cdp('Page.setWebLifecycleState', { state: 'active' }).catch(() => null);
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => null);
}

async function inspectYoutube() {
  await activateYoutubeLifecycle();
  const state = await js(String.raw`((expectedName, expectedStem, expectedTitle, expectedDescription, expectedTags, expectedAudience, expectedVisibility, expectedCategory, expectedLanguage, expectedPlaylist, expectedLicense, expectedPaidPromotion, expectedAlteredContent, expectedAllowEmbedding, expectedNotifySubscribers) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const normalized = value => String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    const normalizedLabel = value => compact(value).replace(/\s+/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/与/g, '和').toLowerCase()
    const visible = element => {
      if (!element) return false
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 4 && rect.height > 4 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const dialog = document.querySelector('ytcp-uploads-dialog')
    const scope = document
    const workflowStep = String(dialog?.getAttribute('workflow-step') || '')
    const videoId = String(dialog?.getAttribute('video-id') || '')
    const bodyText = compact(document.body?.innerText || '')
    const text = compact(scope.innerText || scope.textContent || '')
    const titleEditors = [...scope.querySelectorAll('#title-textarea #textbox, ytcp-social-suggestions-textbox#title-textarea #textbox')]
    const descriptionEditors = [...scope.querySelectorAll('#description-textarea #textbox, ytcp-social-suggestions-textbox#description-textarea #textbox')]
    const titleEditor = titleEditors.find(visible) || titleEditors[0] || null
    const descriptionEditor = descriptionEditors.find(visible) || descriptionEditors[0] || null
    const dialogTitle = scope.querySelector('ytcp-uploads-dialog .header #title, ytcp-uploads-dialog #title')
    const title = normalized(
      titleEditor?.innerText
        || titleEditor?.textContent
        || dialogTitle?.innerText
        || dialogTitle?.textContent
        || '',
    )
    const description = normalized(descriptionEditor?.innerText || descriptionEditor?.textContent || '')
    const selectedVideoInput = [...scope.querySelectorAll('input[type="file"]')].find(input => (
      input.name === 'Filedata'
      || input.id === 'file-loader'
      || /video|\.(mp4|mov|m4v|webm)/i.test(input.accept || '')
    ) && !/image/i.test(input.accept || '')) || null
    const selectedVideoName = String(selectedVideoInput?.files?.[0]?.name || '')
    const fileNameElement = scope.querySelector('#file-name, .file-name, ytcp-video-info #value, ytcp-video-info .value')
    const fileNameText = compact(fileNameElement?.innerText || fileNameElement?.textContent || '')
    const filenameVisible = text.includes(expectedName)
      || text.includes(expectedStem)
      || fileNameText.includes(expectedName)
      || fileNameText.includes(expectedStem)
      || selectedVideoName === expectedName
    const progressElements = [...scope.querySelectorAll('ytcp-video-upload-progress, #upload-status, #progress-label, .progress-label, ytcp-video-upload-progress #label')]
    const statusText = compact(progressElements.map(element => element.innerText || element.textContent || '').join(' '))
    const uploading = /正在上传|上传中|Uploading|剩余.*(?:分钟|秒)|remaining|(?:^|\s)\d{1,3}%/i.test(statusText)
      && !/上传完毕|Upload complete/i.test(statusText)
    const processing = /正在处理视频|处理中|Processing|检查中|Checks running|正在检查|还剩\s*\d+\s*(?:分钟|秒)/i.test(statusText)
      && !/处理完毕(?!后)|Processing complete|检查完毕|Checks complete/i.test(statusText)
    const failed = /上传失败|Upload failed|处理失败|Processing failed|网络错误|文件格式不受支持/i.test(statusText || text)
    const hasVideo = Boolean(fileNameText || selectedVideoName || filenameVisible || statusText)
    const normalizedIdentity = value => compact(value).replace(/[_-]+/g, ' ').toLowerCase()
    const identityMatches = !hasVideo
      || filenameVisible
      || title === expectedTitle
      || normalizedIdentity(title) === normalizedIdentity(expectedStem)
    const uploaded = Boolean(identityMatches && hasVideo && !uploading && !processing && !failed
      && (/上传完毕|Upload complete|处理完毕|Processing complete|检查完毕|Checks complete/i.test(statusText)
        || /视频元素|Video elements|检查|Checks|可见性|Visibility/.test(text)))
    const loginRequired = location.hostname === 'accounts.google.com'
      || (/登录|Sign in/i.test(bodyText) && !/YouTube Studio|频道内容|Channel content/i.test(bodyText))

    const chipText = element => compact(
      element.querySelector('#text, .text, [slot="chip-text"]')?.innerText
        || element.querySelector('#text, .text, [slot="chip-text"]')?.textContent
        || element.innerText
        || element.textContent
        || '',
    ).replace(/[×✕]$/, '').trim()
    const tagChips = [...scope.querySelectorAll('#tags-container ytcp-chip, ytcp-form-input-container#tags-container ytcp-chip')]
      .map(chipText).filter(Boolean)
    const missingTags = expectedTags.filter(tag => !tagChips.some(chip => chip.toLowerCase() === String(tag).toLowerCase()))
    const unexpectedTags = tagChips.filter(chip => !expectedTags.some(tag => String(tag).toLowerCase() === chip.toLowerCase()))
    const duplicateTags = tagChips.filter((chip, index) => tagChips.findIndex(other => other.toLowerCase() === chip.toLowerCase()) !== index)

    const radioChecked = names => names.map(name => scope.querySelector('tp-yt-paper-radio-button[name="' + name + '"], ytcp-radio-button[name="' + name + '"]')).find(element => element?.checked === true || element?.getAttribute('aria-checked') === 'true')
    const audienceMade = radioChecked(['VIDEO_MADE_FOR_KIDS_MFK', 'MADE_FOR_KIDS'])
    const audienceNotMade = radioChecked(['VIDEO_MADE_FOR_KIDS_NOT_MFK', 'NOT_MADE_FOR_KIDS'])
    const audience = audienceMade ? 'made_for_kids' : audienceNotMade ? 'not_made_for_kids' : ''
    const alteredYes = radioChecked(['VIDEO_HAS_ALTERED_CONTENT_YES', 'ALTERED_CONTENT_YES'])
    const alteredNo = radioChecked(['VIDEO_HAS_ALTERED_CONTENT_NO', 'ALTERED_CONTENT_NO'])
    const alteredContent = alteredYes ? true : alteredNo ? false : null

    const checked = element => {
      if (!element) return null
      const input = element.matches?.('input[type="checkbox"]') ? element : element.querySelector?.('input[type="checkbox"]')
      if (input) return input.checked === true
      if (typeof element.checked === 'boolean') return element.checked
      const aria = element.getAttribute?.('aria-checked')
      return aria === 'true' ? true : aria === 'false' ? false : null
    }
    const byIdOrText = (selector, pattern) => scope.querySelector(selector)
      || [...scope.querySelectorAll('ytcp-checkbox-lit, tp-yt-paper-checkbox, ytcp-form-checkbox')].find(element => pattern.test(compact(element.parentElement?.innerText || element.innerText || element.textContent || '')))
    const paidPromotionControl = byIdOrText('#paid-promotion', /付费宣传|Paid promotion/i)
    const allowEmbeddingControl = byIdOrText('#allow-embedding', /允许嵌入|Allow embedding/i)
    const notifySubscribersControl = byIdOrText('#notify-subscribers', /通知订阅者|Notify subscribers/i)
    const paidPromotion = checked(paidPromotionControl)
    const allowEmbedding = checked(allowEmbeddingControl)
    const notifySubscribers = checked(notifySubscribersControl)

    const dropdownText = selector => {
      const container = scope.querySelector(selector)
      return compact(container?.querySelector('#label, .dropdown-trigger-text, ytcp-dropdown-trigger')?.innerText || container?.innerText || '')
    }
    const category = dropdownText('#category')
    const language = dropdownText('#language, #language-input')
    const playlist = dropdownText('#playlists')
    const licenseText = dropdownText('#license')
    const license = /Creative Commons|知识共享/i.test(licenseText)
      ? 'creative_commons'
      : /Standard YouTube|标准 YouTube/i.test(licenseText)
        ? 'standard_youtube'
        : ''

    const privateRadio = radioChecked(['PRIVATE'])
    const unlistedRadio = radioChecked(['UNLISTED'])
    const publicRadio = radioChecked(['PUBLIC'])
    const visibility = privateRadio ? 'private' : unlistedRadio ? 'unlisted' : publicRadio ? 'public' : ''
    const visibilityReady = Boolean(scope.querySelector('tp-yt-paper-radio-button[name="PRIVATE"], ytcp-radio-button[name="PRIVATE"]'))

    const thumbnailUrls = [...scope.querySelectorAll('ytcp-video-still-editor img, ytcp-thumbnails-compact-editor img, #custom-thumbnail img, ytcp-thumbnail-uploader img')]
      .map(image => image.currentSrc || image.getAttribute('src') || '')
      .filter(url => /^https?:/i.test(url))
    const thumbnailInput = [...scope.querySelectorAll('ytcp-thumbnail-uploader input[type="file"], #custom-thumbnail input[type="file"], input[type="file"][accept*="image"]')][0] || null
    const videoInput = selectedVideoInput

    const blockingDialogs = [...document.querySelectorAll('tp-yt-paper-dialog[role="dialog"], ytcp-dialog, [role="alertdialog"]')]
      .filter(visible)
      .filter(element => {
        if (!dialog) return true
        if (!element.closest('ytcp-uploads-dialog')) return false
        if (element.matches('tp-yt-paper-dialog.style-scope.ytcp-uploads-dialog')) return false
        return true
      })
      .map(element => ({ text: compact(element.innerText || element.textContent || '').slice(0, 500), tag: element.tagName }))

    const doneButton = scope.querySelector('#done-button')
    const doneRect = doneButton?.getBoundingClientRect()
    const doneStyle = doneButton ? getComputedStyle(doneButton) : null
    const finalButton = doneButton && doneRect.width > 12 && doneRect.height > 12 && doneStyle.display !== 'none' && doneStyle.visibility !== 'hidden'
      ? {
          text: compact(doneButton.innerText || doneButton.textContent || doneButton.getAttribute('aria-label') || ''),
          disabled: Boolean(doneButton.disabled) || doneButton.getAttribute('aria-disabled') === 'true' || /disabled/.test(String(doneButton.className || '')),
          width: Math.round(doneRect.width),
          height: Math.round(doneRect.height),
        }
      : null

    const categoryOk = !expectedCategory || normalizedLabel(category).includes(normalizedLabel(expectedCategory))
    const languageOk = !expectedLanguage || normalizedLabel(language).includes(normalizedLabel(expectedLanguage))
    const playlistOk = !expectedPlaylist || playlist.includes(expectedPlaylist)
    const licenseOk = license === expectedLicense
    const booleansKnown = paidPromotion !== null && alteredContent !== null && allowEmbedding !== null && notifySubscribers !== null
    const settingsOk = categoryOk && languageOk && playlistOk && licenseOk && booleansKnown
      && paidPromotion === expectedPaidPromotion
      && alteredContent === expectedAlteredContent
      && allowEmbedding === expectedAllowEmbedding
      && notifySubscribers === expectedNotifySubscribers
    const earlyMutation = {
      ready: Boolean(visible(titleEditor) && visible(descriptionEditor)),
      uploading,
      uploaded,
      controls: { title: visible(titleEditor), description: visible(descriptionEditor) },
    }
    return {
      url: location.href,
      workflowStep,
      videoId,
      pageText: bodyText.slice(0, 3500),
      dialogText: text.slice(0, 3500),
      hasDialog: Boolean(dialog),
      title,
      description,
      fileNameText,
      selectedVideoName,
      filenameVisible,
      statusText,
      uploading,
      processing,
      uploaded,
      failed,
      hasVideo,
      identityMatches,
      loginRequired,
      tagChips,
      missingTags,
      unexpectedTags,
      duplicateTags: [...new Set(duplicateTags)],
      audience,
      alteredContent,
      paidPromotion,
      allowEmbedding,
      notifySubscribers,
      category,
      language,
      playlist,
      license,
      settingsOk,
      settingsEvidence: {
        expected: {
          category: expectedCategory,
          language: expectedLanguage,
          playlist: expectedPlaylist,
          license: expectedLicense,
          paidPromotion: expectedPaidPromotion,
          alteredContent: expectedAlteredContent,
          allowEmbedding: expectedAllowEmbedding,
          notifySubscribers: expectedNotifySubscribers,
        },
        actual: { category, language, playlist, license, paidPromotion, alteredContent, allowEmbedding, notifySubscribers },
      },
      visibility,
      visibilityReady,
      thumbnailUrls: [...new Set(thumbnailUrls)],
      thumbnailInput: Boolean(thumbnailInput),
      videoInput: Boolean(videoInput),
      blockingDialogs,
      finalButton,
      earlyMutation,
    }
  })(
    ${JSON.stringify(youtubeVideoName)},
    ${JSON.stringify(youtubeVideoStem)},
    ${JSON.stringify(youtubeTitle)},
    ${JSON.stringify(youtubeDescription)},
    ${JSON.stringify(youtubeTags)},
    ${JSON.stringify(youtubeAudience)},
    ${JSON.stringify(youtubeVisibility)},
    ${JSON.stringify(youtubeCategory)},
    ${JSON.stringify(youtubeLanguage)},
    ${JSON.stringify(youtubePlaylist)},
    ${JSON.stringify(youtubeLicense)},
    ${JSON.stringify(youtubePaidPromotion)},
    ${JSON.stringify(youtubeAlteredContent)},
    ${JSON.stringify(youtubeAllowEmbedding)},
    ${JSON.stringify(youtubeNotifySubscribers)}
  )`);
  const genericButtons = await inspectFinalButtons(YOUTUBE_FINAL_TEXT);
  const finalButton = state.finalButton || genericButtons.find(button => button.buttonish) || genericButtons[0] || null;
  const detailsReceipt = expectedReceipts.details || null;
  const detailsReceiptOk = Boolean(
    detailsReceipt
      && state.videoId
      && state.workflowStep && state.workflowStep !== 'DETAILS'
      && detailsReceipt.videoId === state.videoId
      && detailsReceipt.title === youtubeTitle
      && detailsReceipt.description === youtubeDescription
      && JSON.stringify(detailsReceipt.tags || []) === JSON.stringify(youtubeTags)
      && detailsReceipt.audience === youtubeAudience
      && detailsReceipt.category === youtubeCategory
      && detailsReceipt.language === youtubeLanguage
      && detailsReceipt.playlist === youtubePlaylist
      && detailsReceipt.license === youtubeLicense
      && detailsReceipt.paidPromotion === youtubePaidPromotion
      && detailsReceipt.alteredContent === youtubeAlteredContent
      && detailsReceipt.allowEmbedding === youtubeAllowEmbedding
      && detailsReceipt.notifySubscribers === youtubeNotifySubscribers,
  );
  const receipt = expectedReceipts.cover || null;
  const customThumbnailOk = Boolean(
    youtubeCustomThumbnail
      && receipt
      && receipt.assetPath === youtubeThumbnailPath
      && receipt.ratio === '16:9'
      && (receipt.videoId === state.videoId || (!receipt.videoId && detailsReceiptOk))
      && receipt.afterUrl
      && (state.thumbnailUrls.includes(receipt.afterUrl) || (detailsReceiptOk && state.workflowStep !== 'DETAILS')),
  );
  const defaultThumbnailOk = !youtubeCustomThumbnail && state.uploaded;
  return {
    gates: {
      authenticated: state.loginRequired
        ? failedGate({ loginRequired: true, url: state.url })
        : okGate({ url: state.url }),
      draftIdentity: state.identityMatches || detailsReceiptOk
        ? okGate({ filenameVisible: state.filenameVisible, fileNameText: state.fileNameText, selectedVideoName: state.selectedVideoName, title: state.title })
        : failedGate({ foreign: true, fileNameText: state.fileNameText, selectedVideoName: state.selectedVideoName, title: state.title, expectedName: youtubeVideoName }),
      video: (state.uploaded && !state.uploading && !state.processing && !state.failed) || detailsReceiptOk
        ? okGate({ filename: youtubeVideoName, stable: true, statusText: state.statusText, receipt: detailsReceiptOk })
        : failedGate({
            uploaded: state.uploaded,
            uploading: state.uploading,
            processing: state.processing,
            failed: state.failed,
            statusText: state.statusText,
            hasDialog: state.hasDialog,
            videoInput: state.videoInput,
          }),
      title: state.title === youtubeTitle || detailsReceiptOk
        ? okGate({ expected: youtubeTitle, actual: state.title || detailsReceipt?.title, receipt: detailsReceiptOk })
        : failedGate({ expected: youtubeTitle, actual: state.title }),
      description: state.description === youtubeDescription || detailsReceiptOk
        ? okGate({ expected: youtubeDescription, actual: state.description || detailsReceipt?.description, receipt: detailsReceiptOk })
        : failedGate({ expected: youtubeDescription, actual: state.description }),
      tags: (state.missingTags.length === 0 && state.unexpectedTags.length === 0 && state.duplicateTags.length === 0) || detailsReceiptOk
        ? okGate({ requested: youtubeTags, chips: state.tagChips.length ? state.tagChips : detailsReceipt?.tags, receipt: detailsReceiptOk })
        : failedGate({
            requested: youtubeTags,
            chips: state.tagChips,
            missing: state.missingTags,
            unexpected: state.unexpectedTags,
            duplicates: state.duplicateTags,
          }),
      audience: state.audience === youtubeAudience || detailsReceiptOk
        ? okGate({ expected: youtubeAudience, actual: state.audience || detailsReceipt?.audience, receipt: detailsReceiptOk })
        : failedGate({ expected: youtubeAudience, actual: state.audience }),
      settings: state.settingsOk || detailsReceiptOk
        ? okGate(detailsReceiptOk ? { expected: state.settingsEvidence.expected, actual: detailsReceipt, receipt: true } : state.settingsEvidence)
        : failedGate(state.settingsEvidence),
      cover: customThumbnailOk || defaultThumbnailOk
        ? okGate({ custom: youtubeCustomThumbnail, urls: state.thumbnailUrls, receipt })
        : failedGate({
            custom: youtubeCustomThumbnail,
            urls: state.thumbnailUrls,
            receipt,
            thumbnailInput: state.thumbnailInput,
            reason: youtubeCustomThumbnail && !receipt ? 'custom thumbnail receipt missing' : 'thumbnail not verified',
          }),
      visibility: state.visibilityReady && state.visibility === youtubeVisibility
        ? okGate({ expected: youtubeVisibility, actual: state.visibility })
        : failedGate({ expected: youtubeVisibility, actual: state.visibility, controlsReady: state.visibilityReady }),
      noBlockingDialog: state.blockingDialogs.length === 0
        ? okGate({ active: [] })
        : failedGate({ active: state.blockingDialogs }),
      finalButton: finalButton && !finalButton.disabled
        ? okGate(finalButton)
        : failedGate({ buttons: genericButtons, direct: state.finalButton }),
    },
    evidence: {
      workflowStep: state.workflowStep,
      videoId: state.videoId,
      pageSample: state.pageText,
      dialogSample: state.dialogText,
      statusText: state.statusText,
      earlyMutation: state.earlyMutation,
    },
  };
}

async function exposeYoutubeVideoInput() {
  return await js(String.raw`(() => {
    const dialog = [...document.querySelectorAll('ytcp-uploads-dialog')].find(element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 20 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden'
    })
    const scope = dialog || document
    const input = [...scope.querySelectorAll('input[type="file"]')]
      .find(element => (
        element.name === 'Filedata'
        || element.id === 'file-loader'
        || /video|\.(mp4|mov|m4v|webm)/i.test(element.accept || '')
      ) && !/image/i.test(element.accept || ''))
    if (!input) return { ok: false, reason: 'youtube video input missing', hasDialog: Boolean(dialog) }
    for (const stale of document.querySelectorAll('[data-vp2-youtube-video]')) stale.removeAttribute('data-vp2-youtube-video')
    input.setAttribute('data-vp2-youtube-video', '')
    return { ok: true, selector: 'input[data-vp2-youtube-video]', accept: input.accept || '', hasDialog: Boolean(dialog) }
  })()`);
}

async function openYoutubeUploadDialog() {
  let exposed = await exposeYoutubeVideoInput();
  if (exposed.ok) return exposed;
  for (const locator of [
    'loc=role:button[name="上传视频"]',
    'loc=role:button[name="Upload videos"]',
  ]) {
    try {
      await click(locator, { label: 'open YouTube upload dialog' });
      for (let attempt = 1; attempt <= 20; attempt += 1) {
        await wait(.5);
        exposed = await exposeYoutubeVideoInput();
        if (exposed.ok) return { ...exposed, directUploadControl: locator, attempt };
      }
    } catch {}
  }
  const create = await js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const visible = element => {
      if (!element) return false
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 12 && rect.height > 12 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const candidates = [
      document.querySelector('ytcp-button#create-icon'),
      document.querySelector('#create-icon'),
      ...document.querySelectorAll('button, [role="button"], ytcp-button'),
    ].filter(Boolean)
    const button = candidates.find(element => visible(element) && /创建|Create/i.test(compact(element.getAttribute('aria-label') || element.innerText || element.textContent || '')))
    if (!button) return { ok: false, reason: 'youtube create control missing', sample: compact(document.body?.innerText || '').slice(0, 1200) }
    button.id = 'vp2-youtube-create'
    return { ok: true, selector: '#vp2-youtube-create' }
  })()`);
  if (!create.ok) return create;
  try {
    await click(create.selector, { label: 'open YouTube create menu' });
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
  await wait(1);
  for (const locator of [
    'loc=role:menuitem[name="上传视频"]',
    'loc=role:menuitem[name="Upload videos"]',
  ]) {
    try {
      await click(locator, { label: 'choose YouTube upload video' });
      for (let attempt = 1; attempt <= 20; attempt += 1) {
        await wait(.5);
        exposed = await exposeYoutubeVideoInput();
        if (exposed.ok) return { ...exposed, createMenuControl: locator, attempt };
      }
    } catch {}
  }
  const upload = await js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const visible = element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 20 && rect.height > 16 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const item = [...document.querySelectorAll('tp-yt-paper-item, ytcp-ve, [role="menuitem"], [role="option"], button, div')]
      .find(element => visible(element) && /^(上传视频|Upload videos?)$/i.test(compact(element.innerText || element.textContent || '')))
    if (!item) return { ok: false, reason: 'youtube upload menu item missing' }
    item.id = 'vp2-youtube-upload-menu'
    return { ok: true, selector: '#vp2-youtube-upload-menu' }
  })()`);
  if (!upload.ok) return upload;
  try {
    await click(upload.selector, { label: 'open YouTube upload dialog' });
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    await wait(1);
    exposed = await exposeYoutubeVideoInput();
    if (exposed.ok) return { ...exposed, attempt };
  }
  return { ok: false, reason: 'youtube upload dialog did not expose its video input' };
}

async function waitYoutubeEarlyMutationReady(mode) {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const current = await inspectYoutube();
    if (!current.gates.authenticated.ok) {
      return {
        ...current,
        blocker: typedBlocker('AUTH_REQUIRED', 'YouTube Studio 登录状态失效', {
          requiresUser: true,
          evidence: current.gates.authenticated.evidence,
        }),
      };
    }
    if (!current.gates.draftIdentity.ok) {
      return {
        ...current,
        blocker: typedBlocker('FOREIGN_DRAFT', 'YouTube 当前上传窗口属于其他视频草稿', {
          evidence: current.gates.draftIdentity.evidence,
        }),
      };
    }
    if (current.gates.video.ok) {
      return { ...current, actions: { upload: { mode, stage: 'complete', earlyMutationReady: true } } };
    }
    if (current.gates.video.evidence?.failed === true) {
      return {
        ...current,
        blocker: typedBlocker('PLATFORM_REJECTED_ASSET', 'YouTube 拒绝了当前视频文件', {
          evidence: current.gates.video.evidence,
        }),
      };
    }
    if ((current.gates.video.evidence?.uploading === true || current.gates.video.evidence?.processing === true)
      && current.evidence?.earlyMutation?.ready === true) {
      return { ...current, actions: { upload: { mode, stage: 'editable_uploading', earlyMutationReady: true } } };
    }
    await wait(1);
  }
  const after = await inspectYoutube();
  return {
    ...after,
    blocker: typedBlocker('UPLOAD_NOT_STARTED', 'YouTube 上传启动后详情字段未及时进入可编辑状态', {
      retryable: true,
      evidence: { video: after.gates.video.evidence, earlyMutation: after.evidence?.earlyMutation },
    }),
  };
}

async function startYoutubeUpload() {
  const before = await inspectYoutube();
  if (!before.gates.authenticated.ok) {
    return {
      ...before,
      blocker: typedBlocker('AUTH_REQUIRED', 'YouTube Studio 需要登录', {
        requiresUser: true,
        evidence: before.gates.authenticated.evidence,
      }),
    };
  }
  if (!before.gates.draftIdentity.ok) {
    return {
      ...before,
      blocker: typedBlocker('FOREIGN_DRAFT', 'YouTube 当前上传窗口属于其他视频草稿', {
        evidence: before.gates.draftIdentity.evidence,
      }),
    };
  }
  if (before.gates.video.ok) {
    return { ...before, actions: { upload: { mode: 'already_ready', stage: 'complete', earlyMutationReady: true } } };
  }
  if (before.gates.video.evidence?.uploading || before.gates.video.evidence?.processing) {
    return await waitYoutubeEarlyMutationReady('resume_existing');
  }
  const exposed = await openYoutubeUploadDialog();
  if (!exposed.ok) {
    return {
      ...(await inspectYoutube()),
      blocker: typedBlocker('SELECTOR_DRIFT', exposed.reason, { retryable: true, evidence: exposed }),
    };
  }
  try {
    await uploadFile(exposed.selector, videoPath);
  } catch (error) {
    return {
      ...(await inspectYoutube()),
      blocker: typedBlocker('UPLOAD_NOT_STARTED', String(error?.message || error), {
        retryable: true,
        evidence: exposed,
      }),
    };
  }
  return await waitYoutubeEarlyMutationReady('injected');
}

async function waitYoutubeUploadCompletion(mode) {
  let stableSince = 0;
  for (let attempt = 1; attempt <= 240; attempt += 1) {
    const current = await inspectYoutube();
    if (current.gates.video.ok) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= 5000) return { ...current, actions: { upload: { mode } } };
    } else {
      stableSince = 0;
    }
    if (current.gates.video.evidence?.failed === true) {
      return {
        ...current,
        actions: { upload: { mode } },
        blocker: typedBlocker('PLATFORM_REJECTED_ASSET', 'YouTube 上传或处理失败', {
          evidence: current.gates.video.evidence,
        }),
      };
    }
    await wait(5);
  }
  const after = await inspectYoutube();
  return {
    ...after,
    actions: { upload: { mode } },
    blocker: typedBlocker('UPLOAD_STALLED', 'YouTube 视频没有在等待窗口内完成上传和处理', {
      retryable: true,
      evidence: after.gates.video.evidence,
    }),
  };
}

async function uploadYoutube() {
  const started = await startYoutubeUpload();
  if (started.blocker) return started;
  const mode = started.actions?.upload?.mode || 'already_ready';
  if (started.gates.video.ok) return { ...started, actions: { upload: { mode } } };
  return await waitYoutubeUploadCompletion(mode);
}

async function setYoutubeEditor(selector, value, label) {
  return await js(String.raw`((selector, value, label) => {
    const normalized = input => String(input || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    const editor = document.querySelector('ytcp-uploads-dialog ' + selector)
    if (!editor) return { ok: false, reason: 'youtube ' + label + ' editor missing' }
    editor.focus()
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(editor)
    selection.removeAllRanges()
    selection.addRange(range)
    document.execCommand('delete', false)
    document.execCommand('insertText', false, value)
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }))
    editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    editor.blur()
    const actual = normalized(editor.innerText || editor.textContent || '')
    return { ok: actual === normalized(value), actual }
  })(${JSON.stringify(selector)}, ${JSON.stringify(value)}, ${JSON.stringify(label)})`);
}

async function ensureYoutubeShowMore() {
  const hasAdvanced = await js(String.raw`(() => Boolean(document.querySelector('ytcp-uploads-dialog #tags-container, ytcp-uploads-dialog #category, ytcp-uploads-dialog #language, ytcp-uploads-dialog #language-input')))()`);
  if (hasAdvanced) return { ok: true, already: true };
  const target = await js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const visible = element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 20 && rect.height > 15 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const dialog = document.querySelector('ytcp-uploads-dialog')
    for (const stale of document.querySelectorAll('#vp2-youtube-show-more')) stale.removeAttribute('id')
    const button = dialog?.querySelector('button[aria-label="显示高级设置"], button[aria-label="Show advanced settings"]')
      || [...(dialog?.querySelectorAll('button, [role="button"], ytcp-button') || [])]
        .find(element => visible(element) && (
          /^(显示更多|Show more|展开|Expand)$/i.test(compact(element.innerText || element.textContent || ''))
          || /显示高级设置|Show advanced settings/i.test(element.getAttribute('aria-label') || '')
        ))
    if (!button) return { ok: false, reason: 'youtube show-more control missing' }
    button.id = 'vp2-youtube-show-more'
    return { ok: true, selector: '#vp2-youtube-show-more' }
  })()`);
  if (!target.ok) return target;
  try {
    const activated = await js(String.raw`(() => {
      const button = document.querySelector('#vp2-youtube-show-more')
      if (!button) return { ok: false, reason: 'youtube show-more control disappeared' }
      button.scrollIntoView({ block: 'center' })
      button.click()
      return { ok: true }
    })()`);
    if (!activated.ok) return activated;
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await wait(.5);
    const ready = await js(String.raw`(() => Boolean(document.querySelector('ytcp-uploads-dialog #tags-container, ytcp-uploads-dialog #category, ytcp-uploads-dialog #language, ytcp-uploads-dialog #language-input')))()`);
    if (ready) return { ok: true, changed: true };
  }
  return { ok: false, reason: 'youtube advanced details did not expand' };
}

async function ensureYoutubeRadio(names, labelPattern, actionLabel) {
  const target = await js(String.raw`((names, labelSource) => {
    const labelPattern = new RegExp(labelSource, 'i')
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const dialog = document.querySelector('ytcp-uploads-dialog')
    const radios = [...(dialog?.querySelectorAll('tp-yt-paper-radio-button, ytcp-radio-button') || [])]
    const radio = names.map(name => radios.find(element => element.getAttribute('name') === name)).find(Boolean)
      || radios.find(element => labelPattern.test(compact(element.parentElement?.innerText || element.innerText || element.textContent || '')))
    if (!radio) return { ok: false, reason: 'youtube radio missing', names }
    const checked = radio.checked === true || radio.getAttribute('aria-checked') === 'true'
    if (checked) return { ok: true, already: true }
    for (const stale of document.querySelectorAll('#vp2-youtube-radio')) stale.removeAttribute('id')
    radio.id = 'vp2-youtube-radio'
    radio.scrollIntoView({ block: 'center' })
    return { ok: true, selector: '#vp2-youtube-radio' }
  })(${JSON.stringify(names)}, ${JSON.stringify(labelPattern.source)})`);
  if (!target.ok || target.already) return target;
  try {
    await click(target.selector, { label: actionLabel });
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
  await wait(.7);
  return { ok: true, changed: true };
}

async function ensureYoutubeCheckbox(selector, labelPattern, expected, actionLabel) {
  const target = await js(String.raw`((selector, labelSource, expected) => {
    const pattern = new RegExp(labelSource, 'i')
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const dialog = document.querySelector('ytcp-uploads-dialog')
    const candidates = [...(dialog?.querySelectorAll('ytcp-checkbox-lit, tp-yt-paper-checkbox, ytcp-form-checkbox') || [])]
    const control = dialog?.querySelector(selector)
      || candidates.find(element => pattern.test(compact(element.parentElement?.innerText || element.innerText || element.textContent || '')))
    if (!control) return { ok: false, reason: 'youtube checkbox missing', selector }
    const input = control.matches?.('input[type="checkbox"]') ? control : control.querySelector?.('input[type="checkbox"]')
    const current = input ? input.checked === true
      : typeof control.checked === 'boolean' ? control.checked
        : control.getAttribute('aria-checked') === 'true'
    if (current === expected) return { ok: true, already: true, current }
    for (const stale of document.querySelectorAll('#vp2-youtube-checkbox')) stale.removeAttribute('id')
    control.id = 'vp2-youtube-checkbox'
    control.scrollIntoView({ block: 'center' })
    return { ok: true, selector: '#vp2-youtube-checkbox', current }
  })(${JSON.stringify(selector)}, ${JSON.stringify(labelPattern.source)}, ${JSON.stringify(expected)})`);
  if (!target.ok || target.already) return target;
  try {
    await click(target.selector, { label: actionLabel });
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
  await wait(.7);
  return { ok: true, changed: true, before: target.current, expected };
}

async function rebuildYoutubeTags() {
  const removed = [];
  for (let pass = 0; pass < 30; pass += 1) {
    const current = await inspectYoutube();
    const unexpected = current.gates.tags.evidence?.unexpected || [];
    if (!unexpected.length) break;
    const targetTag = unexpected[0];
    const removal = await js(String.raw`((targetTag) => {
      const compact = value => String(value || '').replace(/\s+/g, ' ').trim().replace(/[×✕]$/, '').trim()
      const dialog = document.querySelector('ytcp-uploads-dialog')
      const chip = [...(dialog?.querySelectorAll('#tags-container ytcp-chip, ytcp-form-input-container#tags-container ytcp-chip') || [])]
        .find(element => compact(element.querySelector('#text, .text, [slot="chip-text"]')?.innerText || element.innerText || element.textContent || '').toLowerCase() === String(targetTag).toLowerCase())
      if (!chip) return { ok: false, reason: 'youtube unexpected tag chip missing', targetTag }
      const remove = chip.querySelector('#delete-button, #delete-icon, #remove-button, button[aria-label*="Remove"], button[aria-label*="移除"], yt-icon-button')
      if (!remove) return { ok: false, reason: 'youtube tag remove control missing', targetTag }
      remove.id = 'vp2-youtube-tag-remove'
      return { ok: true, selector: '#vp2-youtube-tag-remove' }
    })(${JSON.stringify(targetTag)})`);
    if (!removal.ok) return { ok: false, reason: removal.reason, removed };
    try {
      await click(removal.selector, { label: `remove YouTube tag ${targetTag}` });
    } catch (error) {
      return { ok: false, reason: String(error?.message || error), removed };
    }
    removed.push(targetTag);
    await wait(.5);
  }

  const attempts = [];
  for (const tag of youtubeTags) {
    let current = await inspectYoutube();
    if (current.gates.tags.evidence?.chips?.some(chip => chip.toLowerCase() === tag.toLowerCase())) continue;
    const input = await js(String.raw`((tag) => {
      const dialog = document.querySelector('ytcp-uploads-dialog')
      const root = dialog?.querySelector('#tags-container, ytcp-form-input-container#tags-container')
      const input = root?.querySelector('input')
      if (!input) return { ok: false, reason: 'youtube tag input missing' }
      const chipEditor = root.querySelector('ytcp-free-text-chip-bar')
      if (typeof chipEditor?.parseAndAddNewChips === 'function') {
        let componentError = ''
        try {
          chipEditor.parseAndAddNewChips(tag)
        } catch (error) {
          componentError = String(error)
        }
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        if (setter) setter.call(input, '')
        else input.value = ''
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
        return { ok: true, component: true, componentError }
      }
      input.id = 'vp2-youtube-tag-input'
      input.scrollIntoView({ block: 'center' })
      const rect = input.getBoundingClientRect()
      return { ok: true, selector: '#vp2-youtube-tag-input', point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }
    })(${JSON.stringify(tag)})`);
    if (!input.ok) return { ok: false, reason: input.reason, removed, attempts };
    if (!input.component) {
      try {
        await click([input.point.x, input.point.y], { label: `focus YouTube tag ${tag}` });
        await cdp('Input.insertText', { text: tag });
        await pressKey('Enter');
      } catch (error) {
        return { ok: false, reason: String(error?.message || error), removed, attempts };
      }
    }
    let committed = false;
    for (let poll = 0; poll < 20; poll += 1) {
      await wait(.4);
      current = await inspectYoutube();
      committed = Boolean(current.gates.tags.evidence?.chips?.some(chip => chip.toLowerCase() === tag.toLowerCase()));
      if (committed) break;
    }
    attempts.push({ tag, committed });
    if (!committed) return { ok: false, reason: `youtube tag did not persist: ${tag}`, removed, attempts };
  }
  const after = await inspectYoutube();
  return after.gates.tags.ok
    ? { ok: true, removed, attempts }
    : { ok: false, reason: 'youtube tag set is not exact', removed, attempts, evidence: after.gates.tags.evidence };
}

async function ensureYoutubeDropdown(selector, labelPattern, expectedLabel, actionLabel) {
  if (!expectedLabel) return { ok: true, skipped: true };
  const before = await inspectYoutube();
  const evidence = before.gates.settings.evidence?.actual || {};
  const key = selector === '#category' ? 'category' : selector === '#language' ? 'language' : selector === '#license' ? 'license' : 'playlist';
  if (selector === '#license' && evidence.license === youtubeLicense) return { ok: true, already: true };
  if (normalizeYoutubeLabel(evidence[key]).includes(normalizeYoutubeLabel(expectedLabel))) return { ok: true, already: true };
  const opened = await js(String.raw`((selector, labelSource) => {
    const pattern = new RegExp(labelSource, 'i')
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const dialog = document.querySelector('ytcp-uploads-dialog')
    const containers = [...(dialog?.querySelectorAll('ytcp-dropdown-trigger, ytcp-form-input-container, ytcp-video-metadata-playlists') || [])]
    const container = dialog?.querySelector(selector)
      || containers.find(element => pattern.test(compact(element.parentElement?.innerText || element.innerText || element.textContent || '')))
    const trigger = container?.matches?.('ytcp-dropdown-trigger') ? container : container?.querySelector?.('ytcp-dropdown-trigger, #dropdown-trigger, [role="button"]')
    if (!trigger) return { ok: false, reason: 'youtube dropdown trigger missing', selector }
    for (const stale of document.querySelectorAll('#vp2-youtube-dropdown')) stale.removeAttribute('id')
    trigger.id = 'vp2-youtube-dropdown'
    trigger.scrollIntoView({ block: 'center' })
    if (typeof container?.open === 'function') {
      container.open()
      return { ok: true, selector: '#vp2-youtube-dropdown', component: true }
    }
    trigger.click()
    return { ok: true, selector: '#vp2-youtube-dropdown', component: true }
  })(${JSON.stringify(selector)}, ${JSON.stringify(labelPattern.source)})`);
  if (!opened.ok) return opened;
  await wait(.8);
  const option = await js(String.raw`((expectedLabel) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const normalized = value => compact(value).replace(/\s+/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/与/g, '和').toLowerCase()
    const visible = element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 20 && rect.height > 15 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const item = [...document.querySelectorAll('tp-yt-paper-item, ytcp-text-menu, [role="option"], [role="menuitem"], [role="menuitemradio"]')]
      .find(element => visible(element) && normalized(element.innerText || element.textContent || '') === normalized(expectedLabel))
    if (!item) return { ok: false, reason: 'youtube dropdown option missing', expectedLabel }
    for (const stale of document.querySelectorAll('#vp2-youtube-dropdown-option')) stale.removeAttribute('id')
    item.id = 'vp2-youtube-dropdown-option'
    item.click()
    return { ok: true, selector: '#vp2-youtube-dropdown-option', component: true }
  })(${JSON.stringify(expectedLabel)})`);
  if (!option.ok) return option;
  await wait(.8);
  return { ok: true, changed: true };
}

async function ensureYoutubePlaylist() {
  if (!youtubePlaylist) return { ok: true, skipped: true };
  const current = await inspectYoutube();
  if (String(current.gates.settings.evidence?.actual?.playlist || '').includes(youtubePlaylist)) {
    return { ok: true, already: true };
  }
  const opened = await ensureYoutubeDropdown('#playlists', /播放列表|Playlists/i, youtubePlaylist, 'open YouTube playlists');
  if (opened.ok) return opened;
  return opened;
}

async function ensureYoutubeMetadata(before) {
  const actions = {};
  if (before.gates.title.ok
    && before.gates.description.ok
    && before.gates.tags.ok
    && before.gates.audience.ok
    && before.gates.settings.ok) {
    return { ok: true, actions: { metadata: { alreadyVerified: true } }, current: before };
  }
  if (!before.gates.title.ok) actions.title = await setYoutubeEditor('#title-textarea #textbox', youtubeTitle, 'title');
  if (actions.title && !actions.title.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('ACTION_FAILED', actions.title.reason) };
  }
  let current = await inspectYoutube();
  if (!current.gates.description.ok) actions.description = await setYoutubeEditor('#description-textarea #textbox', youtubeDescription, 'description');
  if (actions.description && !actions.description.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('ACTION_FAILED', actions.description.reason) };
  }
  actions.showMore = await ensureYoutubeShowMore();
  if (!actions.showMore.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('SELECTOR_DRIFT', actions.showMore.reason, { retryable: true }) };
  }
  current = await inspectYoutube();
  if (!current.gates.tags.ok) actions.tags = await rebuildYoutubeTags();
  if (actions.tags && !actions.tags.ok) {
    return {
      ok: false,
      actions,
      current: await inspectYoutube(),
      blocker: typedBlocker('PLATFORM_REJECTED_METADATA', actions.tags.reason, { retryable: true, evidence: actions.tags }),
    };
  }
  current = await inspectYoutube();
  if (!current.gates.audience.ok) {
    const madeForKids = youtubeAudience === 'made_for_kids';
    actions.audience = await ensureYoutubeRadio(
      madeForKids ? ['VIDEO_MADE_FOR_KIDS_MFK', 'MADE_FOR_KIDS'] : ['VIDEO_MADE_FOR_KIDS_NOT_MFK', 'NOT_MADE_FOR_KIDS'],
      madeForKids ? /面向儿童|made for kids/i : /并非面向儿童|not made for kids/i,
      'set YouTube audience',
    );
  }
  if (actions.audience && !actions.audience.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('ACTION_FAILED', actions.audience.reason) };
  }
  actions.paidPromotion = await ensureYoutubeCheckbox('#paid-promotion', /付费宣传|Paid promotion/i, youtubePaidPromotion, 'set YouTube paid promotion');
  if (!actions.paidPromotion.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('SELECTOR_DRIFT', actions.paidPromotion.reason, { retryable: true }) };
  }
  actions.alteredContent = await ensureYoutubeRadio(
    youtubeAlteredContent ? ['VIDEO_HAS_ALTERED_CONTENT_YES', 'ALTERED_CONTENT_YES'] : ['VIDEO_HAS_ALTERED_CONTENT_NO', 'ALTERED_CONTENT_NO'],
    youtubeAlteredContent ? /是|Yes/i : /否|No/i,
    'set YouTube altered-content disclosure',
  );
  if (!actions.alteredContent.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('SELECTOR_DRIFT', actions.alteredContent.reason, { retryable: true }) };
  }
  actions.category = await ensureYoutubeDropdown('#category', /类别|Category/i, youtubeCategory, 'open YouTube category');
  if (!actions.category.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('SELECTOR_DRIFT', actions.category.reason, { retryable: true }) };
  }
  actions.language = await ensureYoutubeDropdown('#language', /视频语言|Video language/i, youtubeLanguage, 'open YouTube language');
  if (!actions.language.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('SELECTOR_DRIFT', actions.language.reason, { retryable: true }) };
  }
  actions.playlist = await ensureYoutubePlaylist();
  if (!actions.playlist.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('SELECTOR_DRIFT', actions.playlist.reason, { retryable: true }) };
  }
  const licenseLabel = youtubeLicense === 'creative_commons' ? 'Creative Commons' : '标准 YouTube 许可';
  actions.license = await ensureYoutubeDropdown('#license', /许可|License/i, licenseLabel, 'open YouTube license');
  if (!actions.license.ok && youtubeLicense === 'standard_youtube') {
    actions.license = await ensureYoutubeDropdown('#license', /许可|License/i, 'Standard YouTube License', 'open YouTube license');
  }
  if (!actions.license.ok) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('SELECTOR_DRIFT', actions.license.reason, { retryable: true }) };
  }
  actions.allowEmbedding = await ensureYoutubeCheckbox('#allow-embedding', /允许嵌入|Allow embedding/i, youtubeAllowEmbedding, 'set YouTube embedding');
  actions.notifySubscribers = await ensureYoutubeCheckbox('#notify-subscribers', /通知订阅者|Notify subscribers/i, youtubeNotifySubscribers, 'set YouTube subscriber notification');
  const failedCheckbox = [actions.allowEmbedding, actions.notifySubscribers].find(action => !action.ok);
  if (failedCheckbox) {
    return { ok: false, actions, current: await inspectYoutube(), blocker: typedBlocker('SELECTOR_DRIFT', failedCheckbox.reason, { retryable: true }) };
  }
  current = await inspectYoutube();
  if (!current.gates.title.ok || !current.gates.description.ok || !current.gates.tags.ok || !current.gates.audience.ok || !current.gates.settings.ok) {
    return {
      ok: false,
      actions,
      current,
      blocker: typedBlocker('STATE_AMBIGUOUS', 'YouTube 详情字段没有完整持久化', {
        retryable: true,
        evidence: {
          title: current.gates.title.evidence,
          description: current.gates.description.evidence,
          tags: current.gates.tags.evidence,
          audience: current.gates.audience.evidence,
          settings: current.gates.settings.evidence,
        },
      }),
    };
  }
  return { ok: true, actions, current };
}

async function uploadYoutubeThumbnail() {
  if (!youtubeCustomThumbnail) return { ok: true, skipped: true };
  const beforeState = await inspectYoutube();
  if (beforeState.gates.cover.ok) return { ok: true, skipped: true, reason: 'already_verified' };
  const before = beforeState.gates.cover.evidence?.urls || [];
  const exposed = await js(String.raw`(() => {
    const dialog = document.querySelector('ytcp-uploads-dialog')
    const input = dialog?.querySelector('ytcp-thumbnail-uploader input[type="file"], #custom-thumbnail input[type="file"], input[type="file"][accept*="image"]')
    if (!input) return { ok: false, reason: 'youtube custom thumbnail input missing' }
    if (input.id === 'vp2-youtube-thumbnail') input.id = 'file-loader'
    for (const stale of document.querySelectorAll('[data-vp2-youtube-thumbnail]')) stale.removeAttribute('data-vp2-youtube-thumbnail')
    input.setAttribute('data-vp2-youtube-thumbnail', '')
    return { ok: true, selector: 'input[data-vp2-youtube-thumbnail]' }
  })()`);
  if (!exposed.ok) return exposed;
  try {
    await uploadFile(exposed.selector, youtubeThumbnailPath);
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
  await wait(.7);
  const midState = await inspectYoutube();
  const mid = midState.gates.cover.evidence?.urls || [];
  if (!mid.some(url => !before.includes(url))) {
    const started = await js(String.raw`(() => {
      const dialog = document.querySelector('ytcp-uploads-dialog')
      const uploader = dialog?.querySelector('ytcp-thumbnail-uploader')
      const input = uploader?.querySelector('input[type="file"]')
      if (!uploader) return { ok: false, reason: 'youtube thumbnail uploader missing' }
      if (!input?.files?.length && uploader.selected === true) {
        return { ok: true, component: true, alreadyStarted: true }
      }
      if (!input?.files?.length) return { ok: false, reason: 'youtube thumbnail file selection missing' }
      if (typeof uploader.onFileLoaderChange !== 'function') return { ok: false, reason: 'youtube thumbnail upload handler missing' }
      uploader.onFileLoaderChange({ target: input, currentTarget: input })
      return { ok: true, component: true }
    })()`);
    if (!started.ok) return started;
  }
  let after = [];
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    await wait(1);
    const current = await inspectYoutube();
    after = current.gates.cover.evidence?.urls || [];
    if (after.some(url => !before.includes(url))) break;
  }
  const afterUrl = after.find(url => !before.includes(url));
  if (!afterUrl) return { ok: false, reason: 'youtube custom thumbnail preview did not change', before, after };
  return {
    ok: true,
    receipt: { assetPath: youtubeThumbnailPath, ratio: '16:9', beforeUrls: before, afterUrl },
  };
}

async function advanceYoutubeToVisibility() {
  for (let attempt = 1; attempt <= 180; attempt += 1) {
    const ready = await js(String.raw`(() => Boolean(document.querySelector('ytcp-uploads-dialog tp-yt-paper-radio-button[name="PRIVATE"], ytcp-uploads-dialog ytcp-radio-button[name="PRIVATE"]')))()`);
    if (ready) return { ok: true, attempt };
    const next = await js(String.raw`(() => {
      const dialog = document.querySelector('ytcp-uploads-dialog')
      const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
      const button = [...(dialog?.querySelectorAll('ytcp-button') || [])]
        .find(element => /^(继续|Continue|下一步|Next)$/i.test(compact(element.innerText || element.textContent || '')))
      if (!button && dialog) {
        return { ok: false, waiting: true, reason: 'youtube next button is rerendering', step: dialog.getAttribute('workflow-step') || '' }
      }
      if (!button) return { ok: false, reason: 'youtube next button missing' }
      const disabled = Boolean(button.disabled) || button.getAttribute('aria-disabled') === 'true' || /disabled/.test(String(button.className || ''))
      if (disabled) return { ok: false, waiting: true, reason: 'youtube next button disabled' }
      button.click()
      return { ok: true, component: true }
    })()`);
    if (next.ok) {
      await wait(1);
      continue;
    }
    if (!next.waiting) return next;
    await wait(2);
  }
  return { ok: false, reason: 'youtube visibility step did not become ready' };
}

async function returnYoutubeToDetails() {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const current = await inspectYoutube();
    if (current.evidence?.workflowStep === 'DETAILS') return { ok: true, attempt, current };
    const back = await js(String.raw`(() => {
      const dialog = document.querySelector('ytcp-uploads-dialog')
      const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
      const button = [...(dialog?.querySelectorAll('ytcp-button') || [])]
        .find(element => /^(返回|Back)$/i.test(compact(element.innerText || element.textContent || '')))
      if (!button) return { ok: false, reason: 'youtube back button missing' }
      const disabled = Boolean(button.disabled) || button.getAttribute('aria-disabled') === 'true'
      if (disabled) return { ok: false, reason: 'youtube back button disabled' }
      button.click()
      return { ok: true }
    })()`);
    if (!back.ok) return back;
    await wait(1);
  }
  return { ok: false, reason: 'youtube details step did not return' };
}

async function ensureYoutubeVisibility() {
  const names = youtubeVisibility === 'private' ? ['PRIVATE'] : youtubeVisibility === 'unlisted' ? ['UNLISTED'] : ['PUBLIC'];
  const labels = youtubeVisibility === 'private' ? /不公开|Private/i : youtubeVisibility === 'unlisted' ? /不列出|Unlisted/i : /公开|Public/i;
  return await ensureYoutubeRadio(names, labels, `set YouTube visibility ${youtubeVisibility}`);
}

async function prefillYoutube() {
  const before = await inspectYoutube();
  if (!before.gates.authenticated.ok) {
    return { ...before, blocker: typedBlocker('AUTH_REQUIRED', 'YouTube Studio 登录状态失效', { requiresUser: true }) };
  }
  if (!before.gates.draftIdentity.ok) {
    return { ...before, blocker: typedBlocker('FOREIGN_DRAFT', 'YouTube 当前上传窗口属于其他视频草稿', { evidence: before.gates.draftIdentity.evidence }) };
  }
  const uploading = before.gates.video.evidence?.uploading === true || before.gates.video.evidence?.processing === true;
  if (!before.gates.video.ok && (!uploading || before.evidence?.earlyMutation?.ready !== true)) {
    return {
      ...before,
      blocker: typedBlocker('STATE_AMBIGUOUS', 'YouTube 上传中的详情字段尚未完整就绪', {
        retryable: true,
        evidence: before.evidence?.earlyMutation,
      }),
    };
  }
  const metadata = await ensureYoutubeMetadata(before);
  if (!metadata.ok) return { ...metadata.current, actions: metadata.actions, blocker: metadata.blocker };
  return { ...metadata.current, actions: { ...metadata.actions, prefill: { completedDuringUpload: uploading } } };
}

async function mutateYoutube() {
  let before = await inspectYoutube();
  const recoveryActions = {};
  const detailsGatesReady = ['title', 'description', 'tags', 'audience', 'settings']
    .every(gate => before.gates[gate]?.ok === true);
  const needsThumbnail = youtubeCustomThumbnail && !before.gates.cover.ok;
  if ((!detailsGatesReady || needsThumbnail) && before.evidence?.workflowStep && before.evidence.workflowStep !== 'DETAILS') {
    recoveryActions.returnToDetails = await returnYoutubeToDetails();
    if (!recoveryActions.returnToDetails.ok) {
      return {
        ...(await inspectYoutube()),
        actions: recoveryActions,
        blocker: typedBlocker('SELECTOR_DRIFT', recoveryActions.returnToDetails.reason, { retryable: true }),
      };
    }
    before = recoveryActions.returnToDetails.current || await inspectYoutube();
  }
  if (!before.gates.draftIdentity.ok) {
    return { ...before, blocker: typedBlocker('FOREIGN_DRAFT', 'YouTube 当前上传窗口属于其他视频草稿', { evidence: before.gates.draftIdentity.evidence }) };
  }
  if (!before.gates.video.ok) {
    return { ...before, blocker: typedBlocker('STATE_AMBIGUOUS', 'YouTube 没有完成上传和处理的视频') };
  }
  const metadata = await ensureYoutubeMetadata(before);
  if (!metadata.ok) return { ...metadata.current, actions: metadata.actions, blocker: metadata.blocker };
  const actions = { ...recoveryActions, ...metadata.actions };
  const receipts = {};
  const nextDetailsReceipt = {
    videoId: metadata.current.evidence?.videoId || expectedReceipts.details?.videoId || '',
    title: youtubeTitle,
    description: youtubeDescription,
    tags: [...youtubeTags],
    audience: youtubeAudience,
    category: youtubeCategory,
    language: youtubeLanguage,
    playlist: youtubePlaylist,
    license: youtubeLicense,
    paidPromotion: youtubePaidPromotion,
    alteredContent: youtubeAlteredContent,
    allowEmbedding: youtubeAllowEmbedding,
    notifySubscribers: youtubeNotifySubscribers,
  };
  const currentDetailsComparable = expectedReceipts.details
    ? Object.fromEntries(Object.entries(expectedReceipts.details).filter(([key]) => key !== 'verifiedAt'))
    : null;
  if (JSON.stringify(currentDetailsComparable) !== JSON.stringify(nextDetailsReceipt)) {
    receipts.details = { ...nextDetailsReceipt, verifiedAt: new Date().toISOString() };
    expectedReceipts.details = receipts.details;
    actions.detailsReceiptCheckpoint = checkpointReceipts({ ...expectedReceipts, ...receipts });
  }
  if (youtubeCustomThumbnail && !metadata.current.gates.cover.ok) {
    actions.thumbnail = await uploadYoutubeThumbnail();
    if (!actions.thumbnail.ok) {
      return {
        ...(await inspectYoutube()),
        actions,
        blocker: typedBlocker('PLATFORM_REJECTED_ASSET', actions.thumbnail.reason, {
          retryable: true,
          evidence: actions.thumbnail,
        }),
      };
    }
    receipts.cover = {
      ...actions.thumbnail.receipt,
      videoId: metadata.current.evidence?.videoId || expectedReceipts.details?.videoId || '',
    };
    expectedReceipts.cover = receipts.cover;
    actions.receiptCheckpoint = checkpointReceipts({ ...expectedReceipts, ...receipts });
  }
  actions.advance = await advanceYoutubeToVisibility();
  if (!actions.advance.ok) {
    return {
      ...(await inspectYoutube()),
      actions,
      receipts,
      blocker: typedBlocker('SELECTOR_DRIFT', actions.advance.reason, { retryable: true }),
    };
  }
  actions.visibility = await ensureYoutubeVisibility();
  if (!actions.visibility.ok) {
    return {
      ...(await inspectYoutube()),
      actions,
      receipts,
      blocker: typedBlocker('ACTION_FAILED', actions.visibility.reason || 'YouTube 可见性没有设置成功'),
    };
  }
  const after = await inspectYoutube();
  return { ...after, actions, receipts };
}

async function runPlatformPhase() {
  if (phase === 'inspect' || phase === 'verify') return await inspectYoutube();
  if (phase === 'upload_start') return await startYoutubeUpload();
  if (phase === 'prefill') return await prefillYoutube();
  if (phase === 'upload') return await uploadYoutube();
  if (phase === 'mutate') return await mutateYoutube();
  return { ...(await inspectYoutube()), blocker: typedBlocker('ACTION_FAILED', `unsupported YouTube phase: ${phase}`) };
}
