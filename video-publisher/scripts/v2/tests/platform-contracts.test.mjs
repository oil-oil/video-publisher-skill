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
