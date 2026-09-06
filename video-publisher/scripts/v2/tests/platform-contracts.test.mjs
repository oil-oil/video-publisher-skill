import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = path.join(DIR, "..", "platforms");

test("Xiaohongshu topics start through the native editor command", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "xiaohongshu.mjs"), "utf8");
  const start = source.indexOf("async function rebuildXhsTopics");
  const end = source.indexOf("async function ensureXhsOriginal", start);
  assert.ok(start >= 0 && end > start, "topic rebuild function must remain discoverable");
  const topicFlow = source.slice(start, end);
  const lifecycle = topicFlow.indexOf("activateXhsTopicLifecycle()");
  const nativeStart = topicFlow.indexOf("topicButton.click()");
  const explicitFocus = topicFlow.indexOf("editor.focus()", nativeStart);
  const bareQuery = topicFlow.indexOf("await cdp('Input.insertText', { text: queryTag })", explicitFocus);
  assert.ok(lifecycle >= 0 && lifecycle < nativeStart, "the hidden post-crash page must be activated before topic input");
  assert.match(source, /Page\.setWebLifecycleState', \{ state: 'active' \}/);
  assert.ok(nativeStart >= 0, "the platform topic command must insert the leading hash");
  assert.ok(explicitFocus > nativeStart, "the editor must be refocused after the native command");
  assert.ok(bareQuery > explicitFocus, "only the bare topic query may be inserted after refocus");
  assert.doesNotMatch(topicFlow, /Input\.insertText', \{ text: `#\$\{queryTag\}` \}/);
  assert.match(topicFlow, /rebuildAttempt<=3/, "candidate failures must retry the whole exact topic set with a finite bound");
  assert.match(topicFlow, /attempt < 12/, "each native suggestion request must get a bounded high-load wait window");
});

test("Douyin preserves committed topic entities while retrying a failed tail query", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "douyin.mjs"), "utf8");
  const cleanupStart = source.indexOf("async function removeDouyinTrailingTopicQuery");
  const cleanupEnd = source.indexOf("async function addDouyinTopic", cleanupStart);
  const addEnd = source.indexOf("async function recoverDouyinTopicPrefix", cleanupEnd);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart && addEnd > cleanupEnd);
  const cleanup = source.slice(cleanupStart, cleanupEnd);
  const add = source.slice(cleanupEnd, addEnd);
  assert.match(cleanup, /expected\.startsWith\(initial\)/, "cleanup must prove the visible tail belongs to the missing topic");
  assert.match(cleanup, /entitiesUnchanged/, "cleanup must verify existing topic entities were preserved");
  assert.match(source, /value\.startsWith\(expectedDescription\)/, "the first topic query must be isolated from a shared description text node");
  assert.match(add, /attempt<=3/, "suggestion lookup must use a finite retry bound");
  assert.match(add, /removeDouyinTrailingTopicQuery\(queryTag,committedBefore\)/, "a failed lookup must remove only its own plain query");
  assert.match(add, /querySelectorAll\('\[class\*=\"mention-suggest-item-container\"\]'\)/, "current Douyin must click the real suggestion row before falling back to descendants");
  assert.match(add, /direct\.length\?direct:legacy/, "legacy suggestion descendants remain a bounded fallback");
});

test("Douyin prefill requires live editable-upload evidence and defers covers", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "douyin.mjs"), "utf8");
  const start = source.indexOf("async function prefillDouyin");
  const end = source.indexOf("async function mutateDouyin", start);
  assert.ok(start >= 0 && end > start, "Douyin prefill function must remain discoverable");
  const prefill = source.slice(start, end);
  assert.match(source, /stage:'editable_uploading'/, "upload start must expose an explicit editable-uploading stage");
  assert.match(prefill, /early\.ready===true/, "prefill must require freshly proven editor readiness");
  assert.match(prefill, /video\.evidence\?\.uploading===true/, "prefill must remain bound to an active upload when video is incomplete");
  assert.match(prefill, /ensureDouyinMetadata\(before\)/, "prefill must use the same idempotent metadata repair as final mutation");
  assert.doesNotMatch(prefill, /uploadDouyinCoverSlot|repairDelayedDouyinCoverReceipt/, "custom covers stay after upload completion");
});

test("Xiaohongshu prefill requires live title and topic controls and defers rights and cover", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "xiaohongshu.mjs"), "utf8");
  const start = source.indexOf("async function prefillXiaohongshu");
  const end = source.indexOf("async function mutateXiaohongshu", start);
  assert.ok(start >= 0 && end > start);
  const prefill = source.slice(start, end);
  assert.match(source, /stage: 'editable_uploading'/);
  assert.match(source, /controls: \{ title: visible\(titleInput\), topics:/);
  assert.match(prefill, /ensureXiaohongshuEarlyMetadata\(before\)/);
  assert.doesNotMatch(prefill, /ensureXhsOriginal|uploadXhsCover/);
});

test("Xiaohongshu cover repair supports the current upload editor labels", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "xiaohongshu.mjs"), "utf8");
  const start = source.indexOf("async function uploadXhsCover");
  const end = source.indexOf("async function ensureXiaohongshuEarlyMetadata", start);
  assert.ok(start >= 0 && end > start, "cover upload function must remain discoverable");
  const coverFlow = source.slice(start, end);
  assert.match(coverFlow, /\.main-cover-editor-modal/, "the current cover-editor root must be recognized");
  assert.match(coverFlow, /\^\(上传封面\|上传\)\$/, "both old and current upload labels must remain supported");
  assert.match(coverFlow, /\^\(确定\|完成\)\$/, "both old and current confirmation labels must remain supported");
  assert.match(coverFlow, /input\[type=file\]/, "a direct image input must take precedence over tab text");
  assert.match(coverFlow, /openedAfterRealClick/, "the cover opener must verify that the asynchronous editor materialized");
  assert.match(coverFlow, /native fallback/, "a missing asynchronous editor must retry through the page's native click handler");
  assert.match(coverFlow, /resume-uploaded-thumbnail/, "a retry must resume a cover that already reached the editor");
  assert.match(coverFlow, /if \(!tab\.alreadyUploaded\)/, "a resumed cover must not be uploaded twice");
  assert.match(coverFlow, /inferredFromUploadedThumbnail/, "the fixed-ratio editor must prove 3:4 from its uploaded thumbnail");
  assert.match(coverFlow, /Math\.abs\(actualRatio-0\.75\)<0\.01/, "the inferred ratio must stay tightly bound to 3:4");
});

test("Xiaohongshu original declaration never treats unchecked as checked", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "xiaohongshu.mjs"), "utf8");
  const inspectStart = source.indexOf("async function inspectXiaohongshu");
  const inspectEnd = source.indexOf("async function waitXiaohongshuUploadCompletion", inspectStart);
  const ensureStart = source.indexOf("async function ensureXhsOriginal");
  const ensureEnd = source.indexOf("async function uploadXhsCover", ensureStart);
  const inspectFlow = source.slice(inspectStart, inspectEnd);
  const ensureFlow = source.slice(ensureStart, ensureEnd);
  assert.match(inspectFlow, /originalInput\?\.checked === true/, "the real checkbox must be authoritative when present");
  assert.match(inspectFlow, /simulatorTokens\.some\(token => \['checked', 'active', 'open', 'enabled'\]\.includes\(token\)\)/, "state classes must be matched as exact tokens");
  assert.doesNotMatch(inspectFlow, /\/checked\|active\|open\|enabled\//, "substring matching would make unchecked a false positive");
  assert.match(ensureFlow, /querySelector\?\.\('\.d-switch-simulator'\)/, "the proven interactive simulator is the preferred click target");
  assert.match(ensureFlow, /accept xhs original declaration agreement/, "the agreement must be a separate real interaction");
  assert.match(ensureFlow, /attempt < 12/, "the Vue confirmation state needs a bounded readiness wait");
  assert.match(ensureFlow, /if \(!confirm\.ok\) return/, "a disabled confirmation must stop mutation instead of being ignored");
  assert.match(ensureFlow, /original declaration dialog did not close/, "success requires an independently closed dialog");
});

test("Xiaohongshu opens the hover-only cover editor through its native handler", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "xiaohongshu.mjs"), "utf8");
  const start = source.indexOf("async function uploadXhsCover");
  const end = source.indexOf("async function ensureXiaohongshuEarlyMetadata", start);
  const coverFlow = source.slice(start, end);
  assert.match(coverFlow, /target\.matches\('\.cover-edit-entry'\)\)\{target\.click\(\);return \{ok:true,nativeHoverEntry:true/, "the hover entry must fire before pointer movement can remove it");
  assert.match(coverFlow, /if \(!opener\.nativeHoverEntry\)/, "ordinary stable controls should still use the real click path");
  assert.match(coverFlow, /document\.querySelector\('\.cover-plugin-preview \.cover-edit-entry'\)\|\|document\.querySelector\('#vp2-xhs-cover-opener'\)/, "the native fallback must prefer a fresh hover entry over a stale id");
});

test("Bilibili prefill is limited to live title and tag controls", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "bilibili.mjs"), "utf8");
  const start = source.indexOf("async function prefillBilibili");
  const end = source.indexOf("async function mutateBilibili", start);
  assert.ok(start >= 0 && end > start);
  const prefill = source.slice(start, end);
  assert.match(source, /stage:'editable_uploading'/);
  assert.match(source, /controls:\{title:visible\(titleInput\),tags:visible\(tagInput\)\}/);
  assert.match(prefill, /ensureBilibiliEarlyMetadata\(before\)/);
  assert.doesNotMatch(prefill, /setBilibiliDescriptionV2|ensureBilibiliDeclarationV2|uploadBilibiliCoverV2/);
});

test("WeChat Channels prefill uses a task-space-bound upload receipt and defers original and covers", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "wechat-channels.mjs"), "utf8");
  const start = source.indexOf("async function prefillWechatChannels");
  const end = source.indexOf("async function mutateWechatChannels", start);
  assert.ok(start >= 0 && end > start);
  const prefill = source.slice(start, end);
  assert.match(source, /正在处理文件\|处理中\|生成中/, "processing and generated-cover text must keep the upload incomplete");
  assert.match(source, /uploadStartReceipt\?\.fingerprint===jobFingerprint/);
  assert.match(source, /completeWechatUploadStartObservation\(current,mode,'editable_uploading'/);
  assert.match(prefill, /ensureWechatEarlyMetadata\(before\)/);
  assert.doesNotMatch(prefill, /ensureWechatOriginal|uploadWechatCover/);
});

test("WeChat Channels cover flow supports both slot-specific and generic editors", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "wechat-channels.mjs"), "utf8");
  const start = source.indexOf("async function dismissWechatCoverEditor");
  const end = source.indexOf("async function ensureWechatEarlyMetadata", start);
  const coverFlow = source.slice(start, end);
  assert.match(coverFlow, /编辑个人主页卡片\|编辑分享卡片\|编辑封面\|裁剪封面图/, "recovery must recognize every live cover-dialog title");
  assert.match(coverFlow, /querySelectorAll\('\.weui-desktop-dialog__wrp'\)/, "cover lookup must not depend on the removed edit-cover-dialog ancestor");
  assert.match(coverFlow, /dialogs\.find\(el=>String\(el\.innerText\|\|el\.textContent\|\|'\'\)\.includes\(title\)\)\|\|dialogs\.find/, "the exact slot title remains preferred before the generic fallback");
  assert.match(coverFlow, /\/编辑封面\/\.test\(text\)&&\/上传封面\/\.test\(text\)&&\/取消\/\.test\(text\)&&\/确认\/\.test\(text\)/, "the generic fallback must still prove a complete cover editor");
});

test("Ego task-space selection rejects a recycled id with another name", () => {
  const source = fs.readFileSync(path.join(DIR, "..", "ego", "core.mjs"), "utf8");
  const start = source.indexOf("async function selectTaskSpace");
  const end = source.indexOf("async function selectPlatformTab", start);
  assert.ok(start >= 0 && end > start, "task-space selector must remain discoverable");
  const selection = source.slice(start, end);
  assert.match(selection, /activeTaskSpace\.name !== taskName/);
  assert.match(selection, /reason: 'task_space_identity_mismatch'/);
  assert.match(selection, /activeTaskSpace = await useOrCreateTaskSpace\(taskName\)/);
});

test("Bilibili upload waits for a real input and performs one bounded route recovery", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "bilibili.mjs"), "utf8");
  const start = source.indexOf("async function waitForBilibiliUploadEntry");
  const end = source.indexOf("async function waitBilibiliUploadCompletion", start);
  assert.ok(start >= 0 && end > start, "upload-entry recovery must remain discoverable");
  const recovery = source.slice(start, end);
  assert.match(recovery, /attempt<=24/, "entry discovery needs a finite wait bound");
  assert.match(recovery, /attempt===6&&navigationAttempts===0/, "only one delayed route recovery may be attempted");
  assert.match(recovery, /videoEvidence\.anyUploaded!==true/, "route recovery must not navigate away from an uploaded draft");
  assert.match(recovery, /gotoAndWait\(PLATFORM_URLS\.bilibili/, "the recovery must use the exact maintained upload URL");
  assert.match(recovery, /const guard=await armFinalPublishGuard\(\)/, "route recovery must re-arm the final-publish guard after navigation");
  assert.match(recovery, /B站定向恢复后无法重新挂载最终发布保护/, "a missing post-navigation guard must fail closed");
  assert.match(recovery, /await activateBilibiliUploadLifecycle\(\);\s*await wait\(2\)/, "the newly navigated upload page must be activated before its input is accepted");
  assert.match(recovery, /resumeBilibiliLocalDraftIfPresent/, "a restore banner must be resolved inside the same readiness loop");
  assert.match(recovery, /exposeBilibiliVideoInput/, "success still requires the platform's real file input");
  assert.doesNotMatch(recovery, /createElement\(['"]input['"]\)/, "the adapter must never create a fake upload input");
  assert.match(source, /\.bcc-upload-wrapper input\[type=file\]/, "the active uploader input must be scoped away from Bilibili's detached file inputs");
  assert.match(source, /async function waitForBilibiliUploadStart/, "file injection must have a bounded upload-start verifier");
  assert.match(source, /attempt<=20/, "a silent injection failure must stop quickly instead of consuming the full upload window");
});

test("Bilibili cover repair continues after a rejected tag and preserves the blocker", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "bilibili.mjs"), "utf8");
  const start = source.indexOf("async function mutateBilibili");
  const end = source.indexOf("async function quarantineBilibili", start);
  assert.ok(start >= 0 && end > start, "Bilibili mutation function must remain discoverable");
  const mutation = source.slice(start, end);
  const tagFailure = mutation.indexOf("mutationBlockers.push(typedBlocker('PLATFORM_REJECTED_METADATA'");
  const coverRepair = mutation.indexOf("actions.cover=await uploadBilibiliCoverV2()");
  const finalReturn = mutation.indexOf("blocker:mutationBlockers[0]||null");
  assert.ok(tagFailure >= 0 && coverRepair > tagFailure, "cover repair must run after recording a tag rejection");
  assert.ok(finalReturn > coverRepair, "the original typed blocker must survive after independent cover repair");
  assert.doesNotMatch(mutation.slice(tagFailure, coverRepair), /return /, "tag rejection must not return before cover repair");
});

test("Bilibili uses the 4:3 homepage master and receipt ratio", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "bilibili.mjs"), "utf8");
  assert.match(source, /pkg\.cover\?\.horizontal4x3Path/);
  assert.match(source, /添加主封面\|添加封面/, "cover entry repair must support the current 添加封面 label");
  assert.match(source, /receipt\.ratio==='4:3'/);
  assert.match(source, /ratio:'4:3'/);
  assert.match(source, /slots:\['homepage-4:3','space-16:9'\]/);
  assert.doesNotMatch(source, /pkg\.cover\?\.horizontal16x9Path/);
});

test("WeChat Channels refuses an unproven uploaded draft with an empty description", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "wechat-channels.mjs"), "utf8");
  assert.match(source, /identityAmbiguous=uploaded&&!description&&!trustedVideoReceipt/);
  assert.match(source, /expectedVideoReceipt\?\.fingerprint===jobFingerprint/);
  assert.match(source, /current\.gates\.draftIdentity=okGate\(\{trustedUploadAction:true,mode,uploadStartReceipt:/);
  assert.match(source, /if\(!before\.gates\.draftIdentity\.ok\)return/);
});

test("YouTube prefill repairs full details but defers thumbnail, visibility, and final save", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "youtube.mjs"), "utf8");
  const start = source.indexOf("async function prefillYoutube");
  const end = source.indexOf("async function mutateYoutube", start);
  assert.ok(start >= 0 && end > start, "YouTube prefill function must remain discoverable");
  const prefill = source.slice(start, end);
  assert.match(source, /stage: 'editable_uploading'/);
  assert.match(source, /controls: \{ title: visible\(titleEditor\), description: visible\(descriptionEditor\) \}/);
  assert.match(prefill, /ensureYoutubeMetadata\(before\)/);
  assert.doesNotMatch(prefill, /uploadYoutubeThumbnail|advanceYoutubeToVisibility|ensureYoutubeVisibility/);
  assert.doesNotMatch(source, /click\([^)]*done-button|click\([^)]*final/i, "the adapter must never click YouTube's final action");
});

test("YouTube final guard covers localized Save, Publish, and Schedule labels only on YouTube", () => {
  const source = fs.readFileSync(path.join(DIR, "..", "ego", "core.mjs"), "utf8");
  assert.match(source, /YOUTUBE_FINAL_TEXT = \/\^\(保存\|发布\|安排时间\|Save\|Publish\|Schedule\)\$\//);
  assert.match(source, /platform === 'youtube' \? YOUTUBE_FINAL_TEXT : FINAL_TEXT/);
});

test("YouTube corrections can clear all tags and replace a stale details receipt", () => {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, "youtube.mjs"), "utf8");
  assert.match(source, /for \(const tag of youtubeTags\)/, "an empty requested list must skip additions after removing old chips");
  assert.match(source, /const detailsGatesReady = \['title', 'description', 'tags', 'audience', 'settings'\]/);
  assert.match(source, /currentDetailsComparable/);
  assert.match(source, /expectedReceipts\.details = receipts\.details/);
});
