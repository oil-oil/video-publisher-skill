#!/usr/bin/env node
import fs from "node:fs";
import { requiredGates } from "../lib/model.mjs";

const [platform, , phase, , taskSpaceRaw] = process.argv.slice(2);
const taskSpaceId = Number(taskSpaceRaw) || ({ xiaohongshu: 11, douyin: 12, bilibili: 13, wechat_channels: 14 }[platform]);
const at = Date.now();
if (process.env.VIDEO_PUBLISHER_V2_MOCK_LOG) fs.appendFileSync(process.env.VIDEO_PUBLISHER_V2_MOCK_LOG, JSON.stringify({ at, event: "start", platform, phase }) + "\n");
if (phase === "upload") await new Promise(resolve => setTimeout(resolve, 30));
const gates = Object.fromEntries(requiredGates(platform).map(name => [name, { ok: phase === "mutate" || phase === "verify", evidence: {} }]));
gates.authenticated = { ok: true, evidence: {} };
gates.draftIdentity = { ok: true, evidence: {} };
gates.noBlockingDialog = { ok: true, evidence: {} };
gates.finalButton = { ok: true, evidence: { text: "final", disabled: false } };
gates.safety = { ok: true, evidence: { finalPublishClicked: false, guardArmed: true, blockedAttempts: 0 } };
if (phase === "upload") gates.video = { ok: true, evidence: { stable: true } };
const result = {
  schemaVersion: 1,
  platform,
  phase,
  taskSpaceId,
  observedAt: new Date().toISOString(),
  finalPublishClicked: false,
  gates,
  ...(phase === "mutate" ? { receipts: { cover: { mock: true } } } : {}),
};
if (process.env.VIDEO_PUBLISHER_V2_MOCK_LOG) fs.appendFileSync(process.env.VIDEO_PUBLISHER_V2_MOCK_LOG, JSON.stringify({ at: Date.now(), event: "end", platform, phase }) + "\n");
console.log("VIDEO_PUBLISHER_V2_RESULT:" + JSON.stringify(result));
