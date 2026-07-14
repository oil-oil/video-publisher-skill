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
});
