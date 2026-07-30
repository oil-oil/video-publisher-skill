#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readPackage,
  validateBilibiliPackage,
  validateDouyinPackage,
  validateWechatChannelsPackage,
  validateXiaohongshuPackage,
} from "../lib/content-package.mjs";
import { loadConfig } from "../lib/config.mjs";
import { inspectMediaFile, validateMediaForPlatform } from "../lib/media.mjs";
import { buildIdentity } from "./lib/identity.mjs";
import { acquireJobLock, resolvePublisherLockDirectory } from "./lib/job-lock.mjs";
import { JobStore } from "./lib/job-store.mjs";
import { BLOCKER, PLATFORMS, classifyVerdict, compactVerdict, evaluateObservation, videoReceiptFromObservation } from "./lib/model.mjs";
import { parseV2Result } from "./lib/result-line.mjs";
import { runPool, SerialQueue } from "./lib/scheduler.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(os.homedir(), ".video-publisher", "v2-jobs");
const RIGHTS_PLATFORMS = new Set(["xiaohongshu", "bilibili", "wechat_channels"]);
const validators = { xiaohongshu: validateXiaohongshuPackage, douyin: validateDouyinPackage, bilibili: validateBilibiliPackage, wechat_channels: validateWechatChannelsPackage };

class UsageError extends Error {}
const activeLockReleases = [];
let publisherLockToken = "";

function positive(raw, name) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new UsageError(`${name} must be a positive integer`);
  return value;
}

function parseArgs(argv) {
  const config = loadConfig({ requireOnboarded: true });
  const options = {
    inspectOnly: false,
    originalRightsConfirmed: false,
    originalityPolicy: config.declarations.originalityPolicy,
    stateRoot: DEFAULT_ROOT,
    jobId: "",
    checkConcurrency: config.execution.checkConcurrency,
    uploadConcurrency: config.execution.uploadConcurrency,
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--inspect-only") { options.inspectOnly = true; continue; }
    if (arg === "--confirm-original-rights") { options.originalRightsConfirmed = true; continue; }
    const setters = {
      "--state-root": value => { options.stateRoot = path.resolve(value); },
      "--job-id": value => { options.jobId = value; },
      "--check-concurrency": value => { options.checkConcurrency = positive(value, arg); },
      "--upload-concurrency": value => { options.uploadConcurrency = positive(value, arg); },
    };
    if (setters[arg]) {
      if (!argv[index + 1]) throw new UsageError(`${arg} requires a value`);
      setters[arg](argv[++index]);
      continue;
    }
    if (arg.startsWith("--")) throw new UsageError(`Unknown option: ${arg}`);
    positional.push(arg);
  }
  if (!positional.length) throw new UsageError("Usage: publisher.mjs <package.json> [task-suffix] [platform...] [--inspect-only|--confirm-original-rights]");
  const packagePath = path.resolve(positional.shift());
  let taskSuffix = "manual";
  if (positional.length && !PLATFORMS.includes(positional[0])) taskSuffix = positional.shift();
  const platforms = [...new Set(positional.length ? positional : config.defaultPlatforms)];
  if (platforms.some(platform => !PLATFORMS.includes(platform))) throw new UsageError("Unsupported platform argument");
  const unavailablePlatforms = platforms.filter(platform => !config.availablePlatforms.includes(platform));
  if (unavailablePlatforms.length) {
    throw new UsageError(`Platform is not configured as available: ${unavailablePlatforms.join(", ")}. Update Video Publisher onboarding before browser work.`);
  }
  if (options.jobId && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.jobId)) {
    throw new UsageError("--job-id must be 1-128 characters using only letters, numbers, dot, underscore, or hyphen, and must start with a letter or number");
  }
  return { ...options, packagePath, taskSuffix, platforms };
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function initialState(jobId, identity, args) {
  return {
    schemaVersion: 3,
    jobId,
    fingerprint: identity.fingerprint,
    packagePath: args.packagePath,
    taskSuffix: args.taskSuffix,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "new",
    scheduler: { checkConcurrency: args.checkConcurrency, uploadConcurrency: args.uploadConcurrency, uiConcurrency: 1 },
    video: identity.video,
    assets: identity.assets,
    platforms: Object.fromEntries(args.platforms.map(platform => [platform, { status: "new", taskSpaceId: null, taskSpaceName: null, videoReceipt: null, receipts: {}, verdict: null, history: [] }])),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.packagePath)) throw new Error(`Package JSON not found: ${args.packagePath}`);
  const pkg = readPackage(args.packagePath);
  const media = inspectMediaFile(pkg.videoPath);
  const preflightErrors = Object.fromEntries(args.platforms.map(platform => [platform, [
    ...validators[platform](pkg),
    ...validateMediaForPlatform(pkg, platform, media),
  ]]));
  const runnablePlatforms = args.platforms.filter(platform => preflightErrors[platform].length === 0);
  if (!runnablePlatforms.length) {
    throw new Error(args.platforms
      .map(platform => `Package preflight failed for ${platform}: ${preflightErrors[platform].join("; ")}`)
      .join("\n"));
  }
  const rightsTargets = runnablePlatforms.filter(platform => RIGHTS_PLATFORMS.has(platform));
  const standingOriginalityPolicy = args.originalityPolicy === "all_videos_original";
  if (!args.inspectOnly && rightsTargets.length && !standingOriginalityPolicy && !args.originalRightsConfirmed) {
    throw new UsageError(`Originality confirmation is required before browser mutation for: ${rightsTargets.join(", ")}. Complete onboarding with declarations.originalityPolicy=all_videos_original, or confirm this run and add --confirm-original-rights.`);
  }
  const identity = await buildIdentity(pkg);
  const jobId = args.jobId || identity.fingerprint.slice(0, 16);
  const jobDir = path.join(args.stateRoot, jobId);
  const publisherRelease = acquireJobLock(resolvePublisherLockDirectory(), {
    jobId,
    packagePath: args.packagePath,
    scope: "publisher",
  });
  publisherLockToken = publisherRelease.token;
  activeLockReleases.push(publisherRelease);
  activeLockReleases.push(acquireJobLock(jobDir, { jobId, packagePath: args.packagePath }));
  const store = new JobStore(jobDir, initialState(jobId, identity, args));
  const state = await store.initialize();
  if (store.lastRecovery) {
    console.error(`[video-publisher-v2] restored corrupt job state from atomic backup; preserved=${store.lastRecovery.corruptPath}`);
  }
  if (state.fingerprint !== identity.fingerprint) throw new Error(`Job ${jobId} belongs to another package`);
  for (const platform of args.platforms) state.platforms[platform] ||= { status: "new", taskSpaceId: null, taskSpaceName: null, videoReceipt: null, receipts: {}, verdict: null, history: [] };
  for (const platform of args.platforms) {
    const item = state.platforms[platform];
    if (!item.taskSpaceName && item.lastEvidencePath && fs.existsSync(item.lastEvidencePath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(item.lastEvidencePath, "utf8"));
        const observation = saved.observation || saved;
        if (observation.taskSpace && (item.taskSpaceId == null || Number(observation.taskSpaceId) === Number(item.taskSpaceId))) {
          item.taskSpaceName = observation.taskSpace;
        }
      } catch {}
    }
    if (item.receiptTaskSpaceId != null && item.taskSpaceId != null && Number(item.receiptTaskSpaceId) !== Number(item.taskSpaceId)) {
      item.receipts = {};
      item.receiptTaskSpaceId = null;
      await store.clearReceiptCheckpoint(platform);
    }
    if (item.videoReceipt?.taskSpaceId != null && item.taskSpaceId != null
      && Number(item.videoReceipt.taskSpaceId) !== Number(item.taskSpaceId)) item.videoReceipt = null;
    const checkpoint = await store.loadReceiptCheckpoint(platform, state.fingerprint, item.taskSpaceId);
    if (checkpoint) {
      item.receipts = { ...checkpoint.receipts, ...(item.receipts || {}) };
      item.receiptTaskSpaceId = checkpoint.taskSpaceId ?? item.receiptTaskSpaceId ?? item.taskSpaceId ?? null;
    }
  }
  for (const platform of args.platforms.filter(key => preflightErrors[key].length > 0)) {
    const item = state.platforms[platform];
    const observedAt = new Date().toISOString();
    const blocker = {
      code: BLOCKER.PLATFORM_REJECTED_ASSET,
      message: preflightErrors[platform].join("; "),
      retryable: false,
      requiresUser: false,
      evidence: { errors: preflightErrors[platform], media },
    };
    const observation = {
      schemaVersion: 1,
      platform,
      phase: "preflight",
      taskSpaceId: item.taskSpaceId ?? null,
      observedAt,
      finalPublishClicked: false,
      gates: {},
      blocker,
      evidence: { media },
    };
    const verdict = { platform, phase: "preflight", taskSpaceId: item.taskSpaceId ?? null, ready: false, missing: ["preflight"], blocker };
    item.status = "blocked";
    await store.record(platform, "preflight", observation, verdict);
  }
  state.status = args.inspectOnly ? "inspecting" : "running";
  await store.save();

  const runnerPath = path.resolve(process.env.VIDEO_PUBLISHER_V2_RUNNER || path.join(DIR, "run-platform.mjs"));
  let inputChannelBroken = false;
  let userControl = false;
  const verifiedPlatforms = new Set();
  async function invoke(platform, phase) {
    const item = state.platforms[platform];
    const previousTaskSpaceId = item.taskSpaceId;
    const runnerArgs = [runnerPath, platform, args.packagePath, phase, `${args.taskSuffix}-${jobId}`, item.taskSpaceId ? String(item.taskSpaceId) : ""];
    if (args.originalRightsConfirmed) runnerArgs.push("--confirm-original-rights");
    const execution = await runCapture(process.execPath, runnerArgs, {
      env: {
        ...process.env,
        VIDEO_PUBLISHER_V2_RECEIPTS: JSON.stringify(item.receipts || {}),
        VIDEO_PUBLISHER_V2_CHECKPOINT_PATH: store.receiptCheckpointPath(platform),
        VIDEO_PUBLISHER_V2_FINGERPRINT: state.fingerprint,
        VIDEO_PUBLISHER_V2_TASK_NAME: item.taskSpaceName || "",
        VIDEO_PUBLISHER_V2_VIDEO_RECEIPT: JSON.stringify(item.videoReceipt || null),
        VIDEO_PUBLISHER_V2_PUBLISHER_LOCK_TOKEN: publisherLockToken,
      },
    });
    const observation = parseV2Result(`${execution.stdout}\n${execution.stderr}`);
    if (observation.taskSpace) item.taskSpaceName = observation.taskSpace;
    const taskSpaceChanged = previousTaskSpaceId != null && observation.taskSpaceId != null
      && Number(previousTaskSpaceId) !== Number(observation.taskSpaceId);
    const taskSpaceRecreated = observation.taskSpaceRecovery?.recreated === true;
    if (taskSpaceChanged || taskSpaceRecreated) {
      item.receipts = {};
      item.videoReceipt = null;
      item.receiptTaskSpaceId = null;
      await store.clearReceiptCheckpoint(platform);
      observation.recovery = {
        ...(observation.recovery || {}),
        taskSpaceRecreated: {
          previousTaskSpaceId: observation.taskSpaceRecovery?.previousTaskSpaceId ?? previousTaskSpaceId,
          taskSpaceId: observation.taskSpaceId,
          numericIdChanged: taskSpaceChanged,
        },
      };
    }
    if (observation.receipts) {
      item.receipts = { ...(item.receipts || {}), ...observation.receipts };
      item.receiptTaskSpaceId = observation.taskSpaceId ?? item.taskSpaceId ?? null;
    }
    const videoReceipt = phase === "upload"
      ? videoReceiptFromObservation(observation, state.fingerprint, item.taskSpaceId)
      : null;
    if (videoReceipt) item.videoReceipt = videoReceipt;
    const verdict = evaluateObservation(observation);
    if (verdict.blocker?.code === BLOCKER.INPUT_CHANNEL_BROKEN) inputChannelBroken = true;
    if (verdict.blocker?.code === BLOCKER.USER_CONTROL) userControl = true;
    if (phase === "verify"
      && verdict.blocker?.code !== BLOCKER.INPUT_CHANNEL_BROKEN
      && verdict.blocker?.code !== BLOCKER.USER_CONTROL) verifiedPlatforms.add(platform);
    item.status = classifyVerdict(verdict);
    if (observation.blocker) item.status = verdict.blocker?.requiresUser ? "blocked_user" : "blocked";
    await store.record(platform, phase, observation, compactVerdict(verdict));
    console.error(`[video-publisher-v2] ${platform} ${phase}: ${verdict.ready ? "READY" : verdict.missing.join(",") || verdict.blocker?.code}`);
    return { observation, verdict };
  }

  console.error(`[video-publisher-v2] inspect parallel=${args.checkConcurrency}`);
  await runPool(runnablePlatforms, args.checkConcurrency, platform => invoke(platform, "inspect"));
  if (args.inspectOnly) {
    const hardBlocked = args.platforms.some(platform => ["blocked", "blocked_user", "blocked_foreign_draft"].includes(state.platforms[platform].status));
    state.status = runnablePlatforms.length === args.platforms.length && !hardBlocked ? "inspected" : "blocked";
    await store.save();
    await store.close();
    console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
    if (state.status === "blocked") process.exitCode = 10;
    return;
  }

  if (userControl) {
    state.status = "paused_user";
    await store.save(); await store.close();
    console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
    process.exitCode = 10; return;
  }

  const ui = new SerialQueue();
  const quarantineTargets = inputChannelBroken ? [] : runnablePlatforms.filter(key => state.platforms[key].status === "needs_quarantine");
  for (const platform of quarantineTargets) {
    if (inputChannelBroken || userControl) break;
    await ui.enqueue(async () => {
      if (inputChannelBroken || userControl) return;
      const result = await invoke(platform, "quarantine");
      if (!inputChannelBroken && !userControl && result.observation.quarantine?.safeToUpload) await invoke(platform, "inspect");
    });
  }

  const terminalStatuses = new Set(["blocked", "blocked_user", "blocked_foreign_draft"]);
  const canAdvance = platform => !terminalStatuses.has(state.platforms[platform].status)
    && ["ready", "needs_mutation"].includes(state.platforms[platform].status);
  const advancementTasks = new Map();

  function scheduleAdvance(platform) {
    if (advancementTasks.has(platform)) return advancementTasks.get(platform);
    const task = ui.enqueue(async () => {
      if (inputChannelBroken || userControl || !canAdvance(platform)) return;

      if (state.platforms[platform].status === "needs_mutation") {
        await invoke(platform, "mutate");
        if (inputChannelBroken || userControl || terminalStatuses.has(state.platforms[platform].status)) return;
      }

      await invoke(platform, "verify");
      if (inputChannelBroken || userControl || terminalStatuses.has(state.platforms[platform].status)) return;

      // One targeted retry is allowed only for an idempotent mutation whose fresh
      // verifier returned STATE_AMBIGUOUS. Typed action/auth/risk-control failures
      // freeze only that platform and are never looped.
      const verdict = state.platforms[platform].verdict;
      if (state.platforms[platform].status === "needs_mutation"
        && verdict?.blocker?.code === BLOCKER.STATE_AMBIGUOUS) {
        await invoke(platform, "mutate");
        if (inputChannelBroken || userControl || terminalStatuses.has(state.platforms[platform].status)) return;
        await invoke(platform, "verify");
      }
    }).then(
      () => ({ platform, error: null }),
      error => ({ platform, error }),
    );
    advancementTasks.set(platform, task);
    return task;
  }

  // Start every missing upload first. Each successful runner immediately feeds the
  // single post-upload UI queue; a slow or typed-blocked sibling is not a barrier.
  const uploadTargets = inputChannelBroken || userControl ? [] : runnablePlatforms.filter(platform => state.platforms[platform].status === "needs_upload");
  console.error(`[video-publisher-v2] upload parallel=${args.uploadConcurrency}: ${uploadTargets.join(",") || "none"}`);
  const uploadPool = runPool(uploadTargets, args.uploadConcurrency, async platform => {
    if (inputChannelBroken || userControl) return;
    await invoke(platform, "upload");
    if (!inputChannelBroken && !userControl && canAdvance(platform)) scheduleAdvance(platform);
  });

  const immediateTargets = runnablePlatforms.filter(platform => canAdvance(platform));
  console.error(`[video-publisher-v2] rolling UI serial: ${immediateTargets.join(",") || "waiting for uploads"}`);
  for (const platform of immediateTargets) scheduleAdvance(platform);

  await uploadPool;
  const advancementResults = await Promise.all([...advancementTasks.values()]);
  const advancementFailure = advancementResults.find(result => result.error);
  if (advancementFailure) throw advancementFailure.error;
  await ui.idle();

  // INPUT_CHANNEL_BROKEN remains invocation-wide. Work already completed before the
  // signal stays recorded; no new mutation starts after it. One final read-only pass
  // covers only platforms that have not already completed their rolling verification.
  if (inputChannelBroken && !userControl) {
    const verifyTargets = runnablePlatforms.filter(platform => !verifiedPlatforms.has(platform));
    console.error(`[video-publisher-v2] input channel broken; final verify parallel=${args.checkConcurrency}: ${verifyTargets.join(",") || "none"}`);
    await runPool(verifyTargets, args.checkConcurrency, platform => userControl ? null : invoke(platform, "verify"));
  }

  const complete = args.platforms.every(platform => state.platforms[platform].verdict?.ready === true);
  state.status = userControl ? "paused_user" : complete ? "ready" : "blocked";
  await store.save(); await store.close();
  console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
  if (!complete) process.exitCode = 10;
}

function summary(state, platforms, statePath) {
  return {
    schemaVersion: 3,
    jobId: state.jobId,
    status: state.status,
    ready: platforms.every(platform => state.platforms[platform].verdict?.ready === true),
    statePath,
    scheduler: state.scheduler,
    platforms: Object.fromEntries(platforms.map(platform => {
      const item = state.platforms[platform];
      return [platform, { status: item.status, taskSpaceId: item.taskSpaceId, ready: item.verdict?.ready === true, missing: item.verdict?.missing || [], blocker: item.verdict?.blocker || null, evidencePath: item.lastEvidencePath || null }];
    })),
  };
}

main()
  .catch(error => {
    console.error(`[video-publisher-v2] fatal: ${String(error?.stack || error)}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  })
  .finally(() => {
    for (const release of activeLockReleases.reverse()) release();
  });
