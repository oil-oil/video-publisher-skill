#!/usr/bin/env node
import fs from "node:fs";
import { requiredGates } from "../lib/model.mjs";

const [platform, , phase, taskSuffix, taskSpaceRaw] = process.argv.slice(2);
const taskSpaceId = Number(process.env.VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_ID || taskSpaceRaw) || ({ xiaohongshu: 11, douyin: 12, bilibili: 13, wechat_channels: 14 }[platform]);
const taskSpace = process.env.VIDEO_PUBLISHER_V2_TASK_NAME || `video publisher v2 ${platform} ${taskSuffix}`;
const at = Date.now();
if (process.env.VIDEO_PUBLISHER_V2_MOCK_LOG) fs.appendFileSync(process.env.VIDEO_PUBLISHER_V2_MOCK_LOG, JSON.stringify({ at, event: "start", platform, phase }) + "\n");
if (phase === "upload") await new Promise(resolve => setTimeout(resolve, 30));
const brokenChannel = process.env.VIDEO_PUBLISHER_V2_MOCK_BROKEN_CHANNEL === `${platform}:${phase}`;
const gates = Object.fromEntries(requiredGates(platform).map(name => [name, { ok: phase === "mutate" || phase === "verify", evidence: {} }]));
gates.authenticated = { ok: true, evidence: {} };
gates.draftIdentity = { ok: true, evidence: {} };
gates.noBlockingDialog = { ok: true, evidence: {} };
gates.finalButton = { ok: true, evidence: { text: "final", disabled: false } };
gates.safety = { ok: true, evidence: { finalPublishClicked: false, guardArmed: true, blockedAttempts: 0 } };
if (phase === "upload") gates.video = { ok: true, evidence: { stable: true } };
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
  ...(brokenChannel ? { blocker: { code: "INPUT_CHANNEL_BROKEN", message: "mock Ego exit", retryable: true, requiresUser: false } } : {}),
  ...(process.env.VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_RECREATED === "1" ? { taskSpaceRecovery: { recreated: true, previousTaskSpaceId: taskSpaceId, taskSpaceId } } : {}),
  ...(phase === "mutate" ? { receipts: { cover: { mock: true, taskSpaceId } } } : {}),
};
if (process.env.VIDEO_PUBLISHER_V2_MOCK_LOG) fs.appendFileSync(process.env.VIDEO_PUBLISHER_V2_MOCK_LOG, JSON.stringify({ at: Date.now(), event: "end", platform, phase }) + "\n");
console.log("VIDEO_PUBLISHER_V2_RESULT:" + JSON.stringify(result));
