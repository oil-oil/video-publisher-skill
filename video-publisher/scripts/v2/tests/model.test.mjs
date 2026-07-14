import test from "node:test";
import assert from "node:assert/strict";
import { BLOCKER, classifyVerdict, evaluateObservation, requiredGates } from "../lib/model.mjs";

function observation(platform, overrides = {}) {
  const gates = Object.fromEntries(requiredGates(platform).map(name => [name, { ok: true, evidence: {} }]));
  return { platform, phase: "verify", taskSpaceId: 1, gates: { ...gates, ...(overrides.gates || {}) }, blocker: overrides.blocker || null };
}

test("READY is computed only when every required gate is verified", () => {
  const verdict = evaluateObservation(observation("xiaohongshu"));
  assert.equal(verdict.ready, true);
  assert.deepEqual(verdict.missing, []);
});

test("an action cannot claim READY when cover evidence is missing", () => {
  const verdict = evaluateObservation(observation("xiaohongshu", { gates: { cover: { ok: false, evidence: { receipt: null } } } }));
  assert.equal(verdict.ready, false);
  assert.deepEqual(verdict.missing, ["cover"]);
  assert.equal(verdict.blocker.code, BLOCKER.STATE_AMBIGUOUS);
  assert.equal(classifyVerdict(verdict), "needs_mutation");
});

test("foreign Bilibili drafts enter quarantine instead of user blocking", () => {
  const verdict = evaluateObservation(observation("bilibili", { gates: { draftIdentity: { ok: false, evidence: { foreign: true } } } }));
  assert.equal(verdict.blocker.code, BLOCKER.FOREIGN_DRAFT);
  assert.equal(classifyVerdict(verdict), "needs_quarantine");
});

test("typed risk-control blocker wins over otherwise missing gates", () => {
  const verdict = evaluateObservation(observation("wechat_channels", {
    gates: { video: { ok: false, evidence: { initToast: true } } },
    blocker: { code: BLOCKER.RISK_CONTROL, message: "SDK unavailable", retryable: true },
  }));
  assert.equal(verdict.ready, false);
  assert.equal(verdict.blocker.code, BLOCKER.RISK_CONTROL);
});
