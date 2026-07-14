import test from "node:test";
import assert from "node:assert/strict";
import { parseV2Result, V2_RESULT_PREFIX } from "../lib/result-line.mjs";

test("result parser accepts only a prefix at the start of a trimmed line", () => {
  const payload = { platform: "douyin", phase: "verify", gates: {} };
  const output = `warning mentions ${V2_RESULT_PREFIX} but is not JSON\n  ${V2_RESULT_PREFIX}${JSON.stringify(payload)}\n`;
  assert.deepEqual(parseV2Result(output), payload);
});

test("result parser preserves runner errors that merely mention the prefix", () => {
  const output = `Error: Ego runner returned no ${V2_RESULT_PREFIX} marker`;
  assert.throws(() => parseV2Result(output), /returned no structured observation/);
});
