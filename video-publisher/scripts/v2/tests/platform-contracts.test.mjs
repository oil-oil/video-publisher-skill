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
  const nativeStart = topicFlow.indexOf("topicButton.click()");
  const explicitFocus = topicFlow.indexOf("editor.focus()", nativeStart);
  const bareQuery = topicFlow.indexOf("await cdp('Input.insertText', { text: queryTag })", explicitFocus);
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
