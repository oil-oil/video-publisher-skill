#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  coverForPlatform,
  readPackage,
  validateBilibiliPackage,
  validateDouyinPackage,
  validateWechatChannelsPackage,
  validateXiaohongshuPackage,
  validateYoutubePackage,
} from "../lib/content-package.mjs";
import { loadConfig } from "../lib/config.mjs";
import { inspectMediaFile, validateMediaForPlatform } from "../lib/media.mjs";
import { acquireJobLock, assertJobLockOwner, registerJobLockMember, resolvePublisherLockDirectory } from "./lib/job-lock.mjs";
import { PLATFORMS, requiredGates } from "./lib/model.mjs";
import { acquirePlatformLock } from "./lib/platform-lock.mjs";
import { parseV2Result, V2_RESULT_PREFIX } from "./lib/result-line.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const validators = {
  xiaohongshu: validateXiaohongshuPackage,
  douyin: validateDouyinPackage,
  bilibili: validateBilibiliPackage,
  wechat_channels: validateWechatChannelsPackage,
  youtube: validateYoutubePackage,
};
const platformFiles = {
  xiaohongshu: "xiaohongshu.mjs",
  douyin: "douyin.mjs",
  bilibili: "bilibili.mjs",
  wechat_channels: "wechat-channels.mjs",
  youtube: "youtube.mjs",
};

function usage() {
  return "Usage: run-platform.mjs <platform> <package.json> <inspect|upload_start|prefill|upload|mutate|verify|quarantine> [task-suffix] [task-space-id] [--confirm-original-rights]";
}

function runEgo(script, onSpawn) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.VIDEO_PUBLISHER_V2_EGO_COMMAND || "ego-browser", ["nodejs"], { stdio: ["pipe", "pipe", "pipe"] });
    let releaseMember = () => {};
    let settled = false;
    const fail = error => {
      releaseMember();
      if (settled) return;
      settled = true;
      reject(error);
    };
    child.on("error", fail);
    try {
      releaseMember = onSpawn(child.pid);
    } catch (error) {
      child.kill("SIGTERM");
      fail(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("close", code => {
      releaseMember();
      if (settled) return;
      settled = true;
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(script);
  });
}

const rawArgs = process.argv.slice(2);
const originalRightsConfirmed = rawArgs.includes("--confirm-original-rights");
const positional = rawArgs.filter(arg => arg !== "--confirm-original-rights");
if (positional.some(arg => arg.startsWith("--"))) {
  console.error(usage());
  process.exit(2);
}
const [platform, rawPackagePath, phase, taskSuffix = "manual", taskSpaceRef = ""] = positional;
if (!PLATFORMS.includes(platform) || !rawPackagePath || !["inspect", "upload_start", "prefill", "upload", "mutate", "verify", "quarantine"].includes(phase)) {
  console.error(usage());
  process.exit(2);
}
if (phase === "quarantine" && platform !== "bilibili") {
  console.error("quarantine is supported only for bilibili");
  process.exit(2);
}
const config = loadConfig({ requireOnboarded: true });
if (!config.availablePlatforms.includes(platform)) {
  console.error(`Platform is not configured as available: ${platform}. Update Video Publisher onboarding before browser work.`);
  process.exit(2);
}
const standingOriginalityPolicy = config.declarations.originalityPolicy === "all_videos_original";
if (phase === "mutate" && ["xiaohongshu", "bilibili", "wechat_channels"].includes(platform) && !standingOriginalityPolicy && !originalRightsConfirmed) {
  console.error(`Originality confirmation is required before ${platform} mutation; set declarations.originalityPolicy=all_videos_original during onboarding, or add --confirm-original-rights after confirming this run.`);
  process.exit(2);
}
const packagePath = path.resolve(rawPackagePath);
if (!fs.existsSync(packagePath)) throw new Error(`Package JSON not found: ${packagePath}`);
const pkg = readPackage(packagePath);
const media = inspectMediaFile(pkg.videoPath);
const errors = [...validators[platform](pkg), ...validateMediaForPlatform(pkg, platform, media)];
if (errors.length) throw new Error(`Package preflight failed for ${platform}: ${errors.join("; ")}`);

const header = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  `const platform = ${JSON.stringify(platform)};`,
  `const phase = ${JSON.stringify(phase)};`,
  `const taskName = ${JSON.stringify(process.env.VIDEO_PUBLISHER_V2_TASK_NAME || `video publisher v2 ${platform} ${taskSuffix}`)};`,
  `const taskSpaceRef = ${JSON.stringify(taskSpaceRef)};`,
  `const packagePath = ${JSON.stringify(packagePath)};`,
  `const pkg = ${JSON.stringify({ ...pkg, cover: coverForPlatform(pkg, platform) })};`,
  `const videoPath = ${JSON.stringify(path.resolve(pkg.videoPath))};`,
  `const expectedReceipts = ${JSON.stringify(JSON.parse(process.env.VIDEO_PUBLISHER_V2_RECEIPTS || "{}"))};`,
  `const expectedVideoReceipt = ${JSON.stringify(JSON.parse(process.env.VIDEO_PUBLISHER_V2_VIDEO_RECEIPT || "null"))};`,
  `const receiptCheckpointPath = ${JSON.stringify(process.env.VIDEO_PUBLISHER_V2_CHECKPOINT_PATH || "")};`,
  `const jobFingerprint = ${JSON.stringify(process.env.VIDEO_PUBLISHER_V2_FINGERPRINT || "")};`,
].join("\n");
const fragments = [
  header,
  fs.readFileSync(path.join(DIR, "ego", "core.mjs"), "utf8"),
  fs.readFileSync(path.join(DIR, "platforms", platformFiles[platform]), "utf8"),
  fs.readFileSync(path.join(DIR, "platforms", "dispatch.mjs"), "utf8"),
].join("\n\n");

const publisherLockDirectory = resolvePublisherLockDirectory();
const inheritedPublisherToken = process.env.VIDEO_PUBLISHER_V2_PUBLISHER_LOCK_TOKEN || "";
const releasePublisherLock = inheritedPublisherToken
  ? (assertJobLockOwner(publisherLockDirectory, inheritedPublisherToken), () => {})
  : acquireJobLock(publisherLockDirectory, {
    jobId: `direct-${platform}-${phase}`,
    packagePath,
    scope: "publisher",
  });
const activePublisherToken = inheritedPublisherToken || releasePublisherLock.token;
let releasePlatformLock = () => {};
let execution;
try {
  releasePlatformLock = acquirePlatformLock(platform, phase);
  try {
    execution = await runEgo(fragments, pid => registerJobLockMember(publisherLockDirectory, activePublisherToken, {
      pid,
      role: `${platform}:${phase}:ego`,
    }));
  } catch (error) {
    execution = { code: 1, stdout: "", stderr: String(error?.stack || error) };
  }
} finally {
  releasePlatformLock();
  releasePublisherLock();
}
const combined = `${execution.stdout}\n${execution.stderr}`;
let result;
try {
  result = parseV2Result(combined, "Ego runner");
} catch (error) {
  const detail = combined.trim().slice(-1600);
  const userControl = /user (?:has|had) taken control|user took control|user is controlling|user controls|用户.*控制|not assigned to an agent|task space.*inactive/i.test(detail);
  if (execution.code === 0 && detail) {
    console.error(detail);
    throw error;
  }
  const failureEvidence = { reason: "ego runner unavailable", exitCode: execution.code, detail };
  const gates = Object.fromEntries(requiredGates(platform).map(name => [name, { ok: false, evidence: failureEvidence }]));
  gates.safety = { ok: false, evidence: { finalPublishClicked: false, guardArmed: false, blockedAttempts: 0 } };
  result = {
    schemaVersion: 1,
    platform,
    phase,
    taskSpaceId: Number(taskSpaceRef) || null,
    observedAt: new Date().toISOString(),
    finalPublishClicked: false,
    gates,
    blocker: {
      code: userControl ? "USER_CONTROL" : "INPUT_CHANNEL_BROKEN",
      message: userControl ? "Ego Lite 任务空间已由用户接管" : "Ego Lite 已退出或无法返回页面证据",
      retryable: !userControl,
      requiresUser: userControl,
      evidence: failureEvidence,
    },
  };
}
console.log(V2_RESULT_PREFIX + JSON.stringify(result));
