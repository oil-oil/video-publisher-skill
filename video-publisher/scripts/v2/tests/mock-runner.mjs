#!/usr/bin/env node
import fs from "node:fs";
import { requiredGates } from "../lib/model.mjs";

const [platform, packagePath, phase, taskSuffix, taskSpaceRaw] = process.argv.slice(2);
const taskSpaceId = Number(process.env.VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_ID || taskSpaceRaw) || ({ xiaohongshu: 11, douyin: 12, bilibili: 13, wechat_channels: 14, youtube: 15 }[platform]);
const taskSpace = process.env.VIDEO_PUBLISHER_V2_TASK_NAME || `video publisher v2 ${platform} ${taskSuffix}`;
const phaseKey = `${platform}:${phase}`;
const delays = JSON.parse(process.env.VIDEO_PUBLISHER_V2_MOCK_DELAYS || "{}");
const blockers = JSON.parse(process.env.VIDEO_PUBLISHER_V2_MOCK_BLOCKERS || "{}");
const at = Date.now();
if (process.env.VIDEO_PUBLISHER_V2_MOCK_LOG) fs.appendFileSync(process.env.VIDEO_PUBLISHER_V2_MOCK_LOG, JSON.stringify({ at, event: "start", platform, phase }) + "\n");
const delayMs = Number(delays[phaseKey] ?? (["upload_start", "upload"].includes(phase) ? 30 : 0));
if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
const brokenChannel = process.env.VIDEO_PUBLISHER_V2_MOCK_BROKEN_CHANNEL === phaseKey;
const configuredBlocker = blockers[phaseKey] || null;
const gates = Object.fromEntries(requiredGates(platform).map(name => [name, { ok: phase === "mutate" || phase === "verify", evidence: {} }]));
const expectedReceipts = JSON.parse(process.env.VIDEO_PUBLISHER_V2_RECEIPTS || "{}");
const packageData = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (process.env.VIDEO_PUBLISHER_V2_MOCK_EXISTING_READY === "1" && phase === "inspect") {
  for (const name of Object.keys(gates)) gates[name] = { ok: true, evidence: {} };
  if (packageData.cover?.uploadCustomCover === true && !expectedReceipts.cover) {
    gates.cover = { ok: false, evidence: { reason: "desired cover receipt missing" } };
  }
}
gates.authenticated = { ok: true, evidence: {} };
gates.draftIdentity = { ok: true, evidence: {} };
gates.noBlockingDialog = { ok: true, evidence: {} };
gates.finalButton = { ok: true, evidence: { text: "final", disabled: false } };
gates.safety = { ok: true, evidence: { finalPublishClicked: false, guardArmed: true, blockedAttempts: 0 } };
if (phase === "upload") gates.video = { ok: true, evidence: { stable: true } };
if (phase === "upload_start") gates.video = { ok: false, evidence: { uploading: true, failed: false } };
if (phase === "prefill") {
  gates.video = { ok: false, evidence: { uploading: true, failed: false } };
  for (const name of ["title", "description", "tags", "settings"]) {
    if (gates[name]) gates[name] = { ok: true, evidence: {} };
  }
}
if (configuredBlocker?.code === "AUTH_REQUIRED") gates.authenticated = { ok: false, evidence: { reason: "mock authentication required" } };
if (["UPLOAD_NOT_STARTED", "UPLOAD_STALLED", "PLATFORM_REJECTED_ASSET"].includes(configuredBlocker?.code)) {
  gates.video = { ok: false, evidence: { uploading: configuredBlocker.code === "UPLOAD_STALLED" } };
}
if (brokenChannel) {
  for (const name of Object.keys(gates)) gates[name] = { ok: false, evidence: { reason: "mock input channel broken" } };
  gates.safety = { ok: false, evidence: { finalPublishClicked: false, guardArmed: false, blockedAttempts: 0 } };
}
const result = {
  schemaVersion: 1,
  platform,
  phase,
  taskSpaceId,
  taskSpace,
  observedAt: new Date().toISOString(),
  finalPublishClicked: false,
  gates,
  ...(brokenChannel
    ? { blocker: { code: "INPUT_CHANNEL_BROKEN", message: "mock Ego exit", retryable: true, requiresUser: false } }
    : configuredBlocker ? { blocker: configuredBlocker } : {}),
  ...(process.env.VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_RECREATED === "1" ? { taskSpaceRecovery: { recreated: true, previousTaskSpaceId: taskSpaceId, taskSpaceId } } : {}),
  ...(phase === "upload_start" ? { actions: { upload: { mode: "injected", stage: "editable_uploading", earlyMutationReady: true } }, evidence: { earlyMutation: { ready: true, uploading: true } } } : {}),
  ...(phase === "prefill" ? { actions: { prefill: { completedDuringUpload: true } }, evidence: { earlyMutation: { ready: true, uploading: true } } } : {}),
  ...(phase === "mutate" ? { receipts: { cover: { mock: true, taskSpaceId } } } : {}),
};
if (process.env.VIDEO_PUBLISHER_V2_MOCK_LOG) fs.appendFileSync(process.env.VIDEO_PUBLISHER_V2_MOCK_LOG, JSON.stringify({ at: Date.now(), event: "end", platform, phase }) + "\n");
console.log("VIDEO_PUBLISHER_V2_RESULT:" + JSON.stringify(result));
