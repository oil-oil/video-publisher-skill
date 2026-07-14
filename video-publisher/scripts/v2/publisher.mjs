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
import { acquireJobLock } from "./lib/job-lock.mjs";
import { JobStore } from "./lib/job-store.mjs";
import { BLOCKER, PLATFORMS, classifyVerdict, compactVerdict, evaluateObservation } from "./lib/model.mjs";
import { parseV2Result } from "./lib/result-line.mjs";
import { runPool, SerialQueue } from "./lib/scheduler.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(os.homedir(), ".video-publisher", "v2-jobs");
const RIGHTS_PLATFORMS = new Set(["xiaohongshu", "bilibili", "wechat_channels"]);
const validators = { xiaohongshu: validateXiaohongshuPackage, douyin: validateDouyinPackage, bilibili: validateBilibiliPackage, wechat_channels: validateWechatChannelsPackage };

class UsageError extends Error {}
let releaseActiveJobLock = null;

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
  const platforms = positional.length ? positional : [...config.defaultPlatforms];
  if (platforms.some(platform => !PLATFORMS.includes(platform))) throw new UsageError("Unsupported platform argument");
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
    platforms: Object.fromEntries(args.platforms.map(platform => [platform, { status: "new", taskSpaceId: null, receipts: {}, verdict: null, history: [] }])),
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
  releaseActiveJobLock = acquireJobLock(jobDir, { jobId, packagePath: args.packagePath });
  const store = new JobStore(jobDir, initialState(jobId, identity, args));
  const state = await store.initialize();
  if (store.lastRecovery) {
    console.error(`[video-publisher-v2] restored corrupt job state from atomic backup; preserved=${store.lastRecovery.corruptPath}`);
  }
  if (state.fingerprint !== identity.fingerprint) throw new Error(`Job ${jobId} belongs to another package`);
  for (const platform of args.platforms) state.platforms[platform] ||= { status: "new", taskSpaceId: null, receipts: {}, verdict: null, history: [] };
  for (const platform of args.platforms) {
    const checkpoint = await store.loadReceiptCheckpoint(platform, state.fingerprint);
    if (checkpoint) state.platforms[platform].receipts = { ...checkpoint.receipts, ...(state.platforms[platform].receipts || {}) };
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
  async function invoke(platform, phase) {
    const item = state.platforms[platform];
    const runnerArgs = [runnerPath, platform, args.packagePath, phase, `${args.taskSuffix}-${jobId}`, item.taskSpaceId ? String(item.taskSpaceId) : ""];
    if (args.originalRightsConfirmed) runnerArgs.push("--confirm-original-rights");
    const execution = await runCapture(process.execPath, runnerArgs, {
      env: {
        ...process.env,
        VIDEO_PUBLISHER_V2_RECEIPTS: JSON.stringify(item.receipts || {}),
        VIDEO_PUBLISHER_V2_CHECKPOINT_PATH: store.receiptCheckpointPath(platform),
        VIDEO_PUBLISHER_V2_FINGERPRINT: state.fingerprint,
      },
    });
    const observation = parseV2Result(`${execution.stdout}\n${execution.stderr}`);
    if (observation.receipts) item.receipts = { ...(item.receipts || {}), ...observation.receipts };
    const verdict = evaluateObservation(observation);
    item.status = classifyVerdict(verdict);
    if (observation.blocker) item.status = verdict.blocker?.requiresUser ? "blocked_user" : "blocked";
    await store.record(platform, phase, observation, compactVerdict(verdict));
    console.error(`[video-publisher-v2] ${platform} ${phase}: ${verdict.ready ? "READY" : verdict.missing.join(",") || verdict.blocker?.code}`);
    return { observation, verdict };
  }

  console.error(`[video-publisher-v2] inspect parallel=${args.checkConcurrency}`);
  await runPool(runnablePlatforms, args.checkConcurrency, platform => invoke(platform, "inspect"));
  if (args.inspectOnly) {
    state.status = runnablePlatforms.length === args.platforms.length ? "inspected" : "blocked";
    await store.save();
    await store.close();
    console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
    if (state.status === "blocked") process.exitCode = 10;
    return;
  }

  const userBlocked = runnablePlatforms.find(platform => state.platforms[platform].status === "blocked_user");
  if (userBlocked) {
    state.status = "paused_user";
    await store.save(); await store.close();
    console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
    process.exitCode = 10; return;
  }

  const ui = new SerialQueue();
  for (const platform of runnablePlatforms.filter(key => state.platforms[key].status === "needs_quarantine")) {
    await ui.enqueue(async () => {
      const result = await invoke(platform, "quarantine");
      if (result.observation.quarantine?.safeToUpload) await invoke(platform, "inspect");
    });
  }

  const uploadTargets = runnablePlatforms.filter(platform => state.platforms[platform].status === "needs_upload");
  console.error(`[video-publisher-v2] upload parallel=${args.uploadConcurrency}: ${uploadTargets.join(",") || "none"}`);
  await runPool(uploadTargets, args.uploadConcurrency, platform => invoke(platform, "upload"));

  // No UI mutation starts until every Ego upload process has exited. Live testing proved
  // that overlap freezes the shared browser input channel even across task spaces.
  const mutationTargets = runnablePlatforms.filter(platform => state.platforms[platform].status === "needs_mutation");
  console.error(`[video-publisher-v2] UI serial: ${mutationTargets.join(",") || "none"}`);
  for (const platform of mutationTargets) await ui.enqueue(() => invoke(platform, "mutate"));
  await ui.idle();

  console.error(`[video-publisher-v2] final verify parallel=${args.checkConcurrency}`);
  await runPool(runnablePlatforms.filter(platform => state.platforms[platform].status !== "blocked_user"), args.checkConcurrency, platform => invoke(platform, "verify"));

  // One targeted retry is allowed only for an idempotent mutation whose fresh verifier
  // returned STATE_AMBIGUOUS. Typed action/auth/risk-control failures are never looped.
  const retryTargets = runnablePlatforms.filter(platform => {
    const verdict = state.platforms[platform].verdict;
    return state.platforms[platform].status === "needs_mutation" && verdict?.blocker?.code === BLOCKER.STATE_AMBIGUOUS;
  });
  for (const platform of retryTargets) await ui.enqueue(() => invoke(platform, "mutate"));
  await ui.idle();
  if (retryTargets.length) await runPool(retryTargets, args.checkConcurrency, platform => invoke(platform, "verify"));

  const complete = args.platforms.every(platform => state.platforms[platform].verdict?.ready === true);
  state.status = complete ? "ready" : "blocked";
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
  .finally(() => releaseActiveJobLock?.());
