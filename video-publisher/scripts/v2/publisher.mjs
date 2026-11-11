#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readPackage,
  requiredCoverAspectsForPlatform,
  validateBilibiliPackage,
  validateCoverPackage,
  validateDouyinPackage,
  validateWechatChannelsPackage,
  validateXiaohongshuPackage,
  validateYoutubePackage,
} from "../lib/content-package.mjs";
import { loadConfig } from "../lib/config.mjs";
import { inspectMediaFile, validateMediaForPlatform } from "../lib/media.mjs";
import { buildIdentity } from "./lib/identity.mjs";
import { acquireJobLock, JobBusyError, resolvePublisherLockDirectory } from "./lib/job-lock.mjs";
import { JobStore } from "./lib/job-store.mjs";
import { BLOCKER, PLATFORMS, classifyVerdict, compactVerdict, evaluateObservation, videoReceiptFromObservation } from "./lib/model.mjs";
import { parseV2Result } from "./lib/result-line.mjs";
import { runPool, SerialQueue } from "./lib/scheduler.mjs";
import { parsePublisherArgs, uniqueSpaceSuffix } from "./lib/cli-args.mjs";
import {
  IN_PROGRESS_STATUSES,
  buildCleanupPlan,
  buildSpaceName,
  cleanupTaskSpaces,
  retireCurrentSpaces,
  shouldRotateSpaces,
} from "./lib/spaces.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(os.homedir(), ".video-publisher", "v2-jobs");
const RIGHTS_PLATFORMS = new Set(["xiaohongshu", "bilibili", "wechat_channels"]);
const EARLY_PREFILL_PLATFORMS = new Set(["xiaohongshu", "douyin", "bilibili", "wechat_channels", "youtube"]);
const ASPECT_COVER_FIELD = Object.freeze({
  "3x4": "vertical3x4Path",
  "4x3": "horizontal4x3Path",
  "16x9": "horizontal16x9Path",
});
const validators = {
  xiaohongshu: validateXiaohongshuPackage,
  douyin: validateDouyinPackage,
  bilibili: validateBilibiliPackage,
  wechat_channels: validateWechatChannelsPackage,
  youtube: validateYoutubePackage,
};

class UsageError extends Error {}
const activeLockReleases = [];
let publisherLockToken = "";

function positive(raw, name) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new UsageError(`${name} must be a positive integer`);
  return value;
}

function parseArgs(argv) {
  return parsePublisherArgs(argv, {
    loadConfig,
    PLATFORMS,
    UsageError,
    positive,
    defaultStateRoot: DEFAULT_ROOT,
  });
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
    schemaVersion: 4,
    jobId,
    fingerprint: identity.fingerprint,
    contentFingerprint: identity.contentFingerprint,
    coverFingerprint: identity.coverFingerprint,
    coverFingerprints: identity.coverFingerprints,
    cover: identity.cover,
    packagePath: args.packagePath,
    taskSuffix: args.taskSuffix,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "new",
    scheduler: { checkConcurrency: args.checkConcurrency, uploadConcurrency: args.uploadConcurrency, uiConcurrency: 1 },
    video: identity.video,
    assets: identity.assets,
    revisions: [{ at: new Date().toISOString(), operation: args.operation, fingerprint: identity.fingerprint, packagePath: args.packagePath }],
    platforms: Object.fromEntries(args.platforms.map(platform => [platform, { status: "new", taskSpaceId: null, taskSpaceName: null, videoReceipt: null, receipts: {}, verdict: null, history: [] }])),
  };
}

function sameVideo(left, right) {
  return left?.size === right?.size && left?.sha256 === right?.sha256;
}

async function resolveStoredIdentity(state) {
  if (state.contentFingerprint && state.coverFingerprints) return state;
  if (!state.packagePath || !fs.existsSync(state.packagePath)) return null;
  const storedPackage = readPackage(state.packagePath);
  const storedIdentity = await buildIdentity(storedPackage);
  return [storedIdentity.fingerprint, storedIdentity.previousFingerprint, storedIdentity.legacyFingerprint].includes(state.fingerprint) ? storedIdentity : null;
}

async function prepareCoverReplacement(store, state, identity, args) {
  if (state.status !== "ready") throw new UsageError(`replace-cover requires a READY draft; current status is ${state.status || "unknown"}`);
  if (identity.cover?.uploadCustomCover !== true) throw new UsageError("replace-cover requires cover.uploadCustomCover=true and explicit replacement files");
  const storedIdentity = await resolveStoredIdentity(state);
  if (!storedIdentity?.contentFingerprint || !storedIdentity?.coverFingerprints) {
    throw new UsageError("This legacy job cannot prove its original content identity. Create a fresh verified draft before using replace-cover.");
  }
  if (!sameVideo(state.video || storedIdentity.video, identity.video)) {
    throw new UsageError("replace-cover cannot change the video file");
  }
  if (storedIdentity.contentFingerprint !== identity.contentFingerprint) {
    throw new UsageError("replace-cover may change only cover settings and cover files; title, description, tags, video, and other metadata must stay unchanged");
  }
  const affectedPlatforms = Object.keys(identity.coverFingerprints)
    .filter(platform => storedIdentity.coverFingerprints[platform] !== identity.coverFingerprints[platform]);
  if (!affectedPlatforms.length) throw new UsageError("replace-cover found no changed cover asset");
  const missingTargets = affectedPlatforms.filter(platform => state.platforms[platform] && !args.platforms.includes(platform));
  if (missingTargets.length) {
    throw new UsageError(`replace-cover must include every existing draft whose cover changed: ${missingTargets.join(", ")}`);
  }
  for (const platform of args.platforms) {
    if (!state.platforms[platform]) throw new UsageError(`replace-cover cannot target a platform absent from this job: ${platform}`);
    if (!affectedPlatforms.includes(platform)) throw new UsageError(`replace-cover cover is unchanged for: ${platform}`);
    const item = state.platforms[platform];
    if (!item.taskSpaceId && !item.taskSpaceName) throw new UsageError(`replace-cover has no recorded Ego draft space for: ${platform}`);
  }
  const previous = { at: new Date().toISOString(), operation: "replace-cover", from: state.fingerprint, to: identity.fingerprint, packagePath: args.packagePath, platforms: args.platforms };
  state.schemaVersion = 4;
  state.fingerprint = identity.fingerprint;
  state.contentFingerprint = identity.contentFingerprint;
  state.coverFingerprint = identity.coverFingerprint;
  state.coverFingerprints = identity.coverFingerprints;
  state.cover = identity.cover;
  state.packagePath = args.packagePath;
  state.video = identity.video;
  state.assets = identity.assets;
  state.revisions ||= [];
  state.revisions.push(previous);
  if (state.revisions.length > 20) state.revisions = state.revisions.slice(-20);
  for (const [platform, item] of Object.entries(state.platforms)) {
    if (item.videoReceipt) item.videoReceipt = { ...item.videoReceipt, fingerprint: identity.fingerprint };
    item.receipts ||= {};
    if (item.receipts.uploadStart?.fingerprint) {
      item.receipts.uploadStart = { ...item.receipts.uploadStart, fingerprint: identity.fingerprint };
    }
    await store.clearReceiptCheckpoint(platform);
  }
  for (const platform of args.platforms) {
    const item = state.platforms[platform];
    delete item.receipts.cover;
    item.verdict = null;
    item.status = "needs_mutation";
  }
  args.freshSpace = false;
  args.forceFreshSpace = false;
  await store.save();
}

async function migrateLegacyIdentity(store, state, identity, args) {
  if (![identity.previousFingerprint, identity.legacyFingerprint].includes(state.fingerprint) || state.fingerprint === identity.fingerprint) return;
  const previousFingerprint = state.fingerprint;
  state.schemaVersion = 4;
  state.fingerprint = identity.fingerprint;
  state.contentFingerprint = identity.contentFingerprint;
  state.coverFingerprint = identity.coverFingerprint;
  state.coverFingerprints = identity.coverFingerprints;
  state.cover = identity.cover;
  state.packagePath = args.packagePath;
  state.video = identity.video;
  state.assets = identity.assets;
  state.revisions ||= [];
  state.revisions.push({ at: new Date().toISOString(), operation: "identity-migration", from: previousFingerprint, to: identity.fingerprint, packagePath: args.packagePath });
  for (const [platform, item] of Object.entries(state.platforms || {})) {
    if (item.videoReceipt) item.videoReceipt = { ...item.videoReceipt, fingerprint: identity.fingerprint };
    item.receipts ||= {};
    if (item.receipts.uploadStart?.fingerprint) item.receipts.uploadStart = { ...item.receipts.uploadStart, fingerprint: identity.fingerprint };
    if (platform === "youtube" && previousFingerprint === identity.legacyFingerprint && identity.cover?.uploadCustomCover === true) {
      delete item.receipts.cover;
      item.verdict = null;
      item.status = "needs_mutation";
      state.status = "blocked";
    }
    await store.clearReceiptCheckpoint(platform);
  }
  await store.save();
}

function writeJsonAtomic(filePath, payload) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

async function applyResolvedCoverIdentity(store, state, identity, args, operation = "deferred-cover-sync") {
  const previousFingerprint = state.fingerprint;
  state.schemaVersion = 4;
  state.fingerprint = identity.fingerprint;
  state.contentFingerprint = identity.contentFingerprint;
  state.coverFingerprint = identity.coverFingerprint;
  state.coverFingerprints = identity.coverFingerprints;
  state.cover = identity.cover;
  state.packagePath = args.packagePath;
  state.video = identity.video;
  state.assets = identity.assets;
  if (previousFingerprint && previousFingerprint !== identity.fingerprint) {
    state.revisions ||= [];
    state.revisions.push({ at: new Date().toISOString(), operation, from: previousFingerprint, to: identity.fingerprint, packagePath: args.packagePath });
    if (state.revisions.length > 20) state.revisions = state.revisions.slice(-20);
  }
  for (const [platform, item] of Object.entries(state.platforms || {})) {
    if (item.videoReceipt) item.videoReceipt = { ...item.videoReceipt, fingerprint: identity.fingerprint };
    item.receipts ||= {};
    if (item.receipts.uploadStart?.fingerprint) {
      item.receipts.uploadStart = { ...item.receipts.uploadStart, fingerprint: identity.fingerprint };
    }
    const checkpointPath = store.receiptCheckpointPath(platform);
    if (fs.existsSync(checkpointPath)) {
      try {
        const checkpoint = JSON.parse(await fs.promises.readFile(checkpointPath, "utf8"));
        if (checkpoint && typeof checkpoint === "object") {
          checkpoint.fingerprint = identity.fingerprint;
          writeJsonAtomic(checkpointPath, checkpoint);
        }
      } catch {}
    }
  }
  await store.save();
}

async function persistKeepSpace(store, state, args, closeCurrent) {
  if (args.keepSpace) state.keepSpace = true;
  else if (closeCurrent) state.keepSpace = false;
  await store.save();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cleanupOnly) {
    let state = { jobId: args.jobId || "", platforms: {}, retiredSpaces: [] };
    let statePath = "";
    if (args.packagePath) {
      if (!fs.existsSync(args.packagePath)) throw new Error(`Package JSON not found: ${args.packagePath}`);
      const pkg = readPackage(args.packagePath);
      const identity = await buildIdentity(pkg);
      const jobId = args.jobId || identity.fingerprint.slice(0, 16);
      const jobDir = path.join(args.stateRoot, jobId);
      const release = acquireJobLock(jobDir, { jobId, packagePath: args.packagePath });
      try {
        const store = new JobStore(jobDir, initialState(jobId, identity, args));
        state = await store.initialize();
        statePath = store.statePath;
        const inProgress = IN_PROGRESS_STATUSES.includes(state.status);
        const plan = await maybeCleanupSpaces(args, state, {
          complete: !inProgress,
          userControl: false,
          incomingInProgress: inProgress,
        });
        if (plan?.closeCurrent) state.keepSpace = false;
        await store.save();
        await store.close();
      } finally {
        release();
      }
    } else {
      await maybeCleanupSpaces(args, state, { complete: false, userControl: false, incomingInProgress: false });
    }
    console.log(JSON.stringify({ ok: true, cleanupOnly: true, jobId: state.jobId || "", statePath, stateRoot: args.stateRoot }, null, 2));
    return;
  }
  if (!fs.existsSync(args.packagePath)) throw new Error(`Package JSON not found: ${args.packagePath}`);
  let pkg = readPackage(args.packagePath);
  const deferCoverStartup = Boolean(args.awaitCoverPath && pkg.cover?.uploadCustomCover === true);
  const media = inspectMediaFile(pkg.videoPath);
  const preflightErrors = Object.fromEntries(args.platforms.map(platform => [platform, [
    ...validators[platform](pkg, { skipCoverFiles: deferCoverStartup }),
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
  let identity = await buildIdentity(pkg, { allowMissingCoverAssets: true });
  const defaultIdSeed = deferCoverStartup ? identity.contentFingerprint : identity.fingerprint;
  const jobId = args.jobId || (args.operation === "repost"
    ? `${defaultIdSeed.slice(0, 12)}-${uniqueSpaceSuffix()}`
    : defaultIdSeed.slice(0, 16));
  const jobDir = path.join(args.stateRoot, jobId);
  const stateExisted = fs.existsSync(path.join(jobDir, "state.json"));
  if (args.operation === "replace-cover" && !stateExisted) throw new UsageError(`replace-cover job does not exist: ${jobId}`);
  if (["resume"].includes(args.operation) && !stateExisted) throw new UsageError(`${args.operation} requires an existing job: ${jobId}`);
  if (["create", "repost"].includes(args.operation) && stateExisted) throw new UsageError(`${args.operation} requires a new job id; job already exists: ${jobId}`);
  const publisherRelease = acquireJobLock(resolvePublisherLockDirectory(), {
    jobId,
    packagePath: args.packagePath,
    scope: "publisher",
  });
  publisherLockToken = publisherRelease.token;
  activeLockReleases.push(publisherRelease);
  activeLockReleases.push(acquireJobLock(jobDir, { jobId, packagePath: args.packagePath }));
  let deferredAcceptedFingerprints = [];
  if (stateExisted && args.operation !== "replace-cover") {
    try {
      const storedPreview = JSON.parse(fs.readFileSync(path.join(jobDir, "state.json"), "utf8"));
      if (storedPreview?.fingerprint
        && (storedPreview.awaitingCover === true || deferCoverStartup)
        && storedPreview.contentFingerprint === identity.contentFingerprint
        && sameVideo(storedPreview.video, identity.video)) {
        deferredAcceptedFingerprints = [storedPreview.fingerprint];
      }
    } catch {}
  }
  const expectedState = initialState(jobId, identity, args);
  if (deferCoverStartup) expectedState.awaitingCover = true;
  if (args.operation === "replace-cover") expectedState.fingerprint = null;
  const store = new JobStore(jobDir, expectedState, {
    acceptedFingerprints: args.operation === "replace-cover"
      ? []
      : [identity.previousFingerprint, identity.legacyFingerprint, ...deferredAcceptedFingerprints],
  });
  const state = await store.initialize();
  if (args.operation !== "replace-cover") {
    if (deferredAcceptedFingerprints.includes(state.fingerprint) && state.fingerprint !== identity.fingerprint) {
      await applyResolvedCoverIdentity(store, state, identity, args, "deferred-cover-resume");
    } else {
      await migrateLegacyIdentity(store, state, identity, args);
    }
  }
  const incomingStatus = state.status;
  const incomingInProgress = IN_PROGRESS_STATUSES.includes(incomingStatus);
  if (args.operation === "auto" && stateExisted && incomingStatus === "ready") {
    throw new UsageError(`Job ${jobId} is already READY. Use --operation inspect, --operation replace-cover, or --operation repost --confirm-new-copy.`);
  }
  if (args.operation === "resume" && incomingStatus === "ready") {
    throw new UsageError(`Job ${jobId} is already READY; resume will not create another draft`);
  }
  if (args.operation === "replace-cover") await prepareCoverReplacement(store, state, identity, args);
  else {
    state.schemaVersion = 4;
    state.contentFingerprint ||= identity.contentFingerprint;
    state.coverFingerprint ||= identity.coverFingerprint;
    state.coverFingerprints ||= identity.coverFingerprints;
    state.cover ||= identity.cover;
    if (deferCoverStartup) state.awaitingCover = true;
    else if (!identity.missingCoverPaths?.length) state.awaitingCover = false;
  }
  if (args.operation === "inspect" && stateExisted) args.freshSpace = false;
  if (args.keepSpace) state.keepSpace = true;
  if (shouldRotateSpaces(args, state)) {
    const stamp = args.spaceSuffix || uniqueSpaceSuffix();
    retireCurrentSpaces(state, args.platforms);
    for (const platform of args.platforms) {
      const item = state.platforms[platform];
      if (!item) continue;
      item.taskSpaceId = null;
      item.taskSpaceName = buildSpaceName({
        spaceName: args.spaceName,
        spacePrefix: args.spacePrefix,
        platform,
        taskSuffix: args.taskSuffix,
        jobId,
        stamp,
      });
      item.receipts = {};
      item.receiptTaskSpaceId = null;
      item.videoReceipt = null;
      await store.clearReceiptCheckpoint(platform);
    }
  } else if (args.spaceName) {
    for (const platform of args.platforms) {
      const item = state.platforms[platform];
      if (!item) continue;
      if (item.taskSpaceName && item.taskSpaceName !== args.spaceName) {
        retireCurrentSpaces(state, [platform]);
        item.taskSpaceId = null;
        item.receipts = {};
        item.receiptTaskSpaceId = null;
        item.videoReceipt = null;
        await store.clearReceiptCheckpoint(platform);
      }
      item.taskSpaceName = args.spaceName;
    }
  }
  await store.save();
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
  const resolvedCoverPlatforms = new Set();
  const coverSyncQueue = new SerialQueue();
  async function invoke(platform, phase) {
    const item = state.platforms[platform];
    const previousTaskSpaceId = item.taskSpaceId;
    const invokedFingerprint = state.fingerprint;
    const runnerArgs = [runnerPath, platform, args.packagePath, phase, `${args.taskSuffix}-${jobId}`, item.taskSpaceId ? String(item.taskSpaceId) : ""];
    if (args.originalRightsConfirmed) runnerArgs.push("--confirm-original-rights");
    const execution = await runCapture(process.execPath, runnerArgs, {
      env: {
        ...process.env,
        VIDEO_PUBLISHER_V2_RECEIPTS: JSON.stringify(item.receipts || {}),
        VIDEO_PUBLISHER_V2_CHECKPOINT_PATH: store.receiptCheckpointPath(platform),
        VIDEO_PUBLISHER_V2_FINGERPRINT: invokedFingerprint,
        VIDEO_PUBLISHER_V2_TASK_NAME: item.taskSpaceName || "",
        VIDEO_PUBLISHER_V2_VIDEO_RECEIPT: JSON.stringify(item.videoReceipt || null),
        VIDEO_PUBLISHER_V2_PUBLISHER_LOCK_TOKEN: publisherLockToken,
        VIDEO_PUBLISHER_V2_DEFER_COVER: deferCoverStartup && !resolvedCoverPlatforms.has(platform) && phase !== "mutate" ? "1" : "0",
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
      const mergedReceipts = { ...(item.receipts || {}), ...observation.receipts };
      if (mergedReceipts.uploadStart?.fingerprint === invokedFingerprint && state.fingerprint !== invokedFingerprint) {
        mergedReceipts.uploadStart = { ...mergedReceipts.uploadStart, fingerprint: state.fingerprint };
        const checkpointPath = store.receiptCheckpointPath(platform);
        if (fs.existsSync(checkpointPath)) {
          try {
            const checkpoint = JSON.parse(await fs.promises.readFile(checkpointPath, "utf8"));
            if (checkpoint && typeof checkpoint === "object") {
              checkpoint.fingerprint = state.fingerprint;
              if (checkpoint.receipts?.uploadStart?.fingerprint === invokedFingerprint) {
                checkpoint.receipts.uploadStart = { ...checkpoint.receipts.uploadStart, fingerprint: state.fingerprint };
              }
              writeJsonAtomic(checkpointPath, checkpoint);
            }
          } catch {}
        }
      }
      item.receipts = mergedReceipts;
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
    const allReady = Object.values(state.platforms).every(item => item.verdict?.ready === true);
    state.status = incomingStatus === "ready"
      ? (allReady ? "ready" : "blocked")
      : incomingInProgress ? incomingStatus : (hardBlocked ? "blocked" : "inspected");
    const plan = await maybeCleanupSpaces(args, state, { complete: false, userControl, inputChannelBroken, incomingInProgress });
    await persistKeepSpace(store, state, args, plan?.closeCurrent === true);
    await store.close();
    console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
    if (hardBlocked || userControl) process.exitCode = 10;
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

  async function recordCoverWaitFailure(platform, reason) {
    const item = state.platforms[platform];
    const observedAt = new Date().toISOString();
    const blocker = {
      code: BLOCKER.ACTION_FAILED,
      message: reason,
      retryable: true,
      requiresUser: false,
      evidence: { awaitCoverPath: args.awaitCoverPath, requiredAspects: requiredCoverAspectsForPlatform(platform) },
    };
    const observation = {
      schemaVersion: 1,
      platform,
      phase: "cover_wait",
      taskSpaceId: item.taskSpaceId ?? null,
      taskSpace: item.taskSpaceName || undefined,
      observedAt,
      finalPublishClicked: false,
      gates: { cover: { ok: false, evidence: { reason } } },
      blocker,
      evidence: { awaitCoverPath: args.awaitCoverPath },
    };
    const verdict = {
      platform,
      phase: "cover_wait",
      taskSpaceId: item.taskSpaceId ?? null,
      ready: false,
      missing: ["cover"],
      blocker,
    };
    item.status = "blocked";
    await store.record(platform, "cover_wait", observation, verdict);
    console.error(`[video-publisher-v2] ${platform} cover_wait: ${reason}`);
  }

  async function ensurePlatformCoverReady(platform) {
    if (!deferCoverStartup || resolvedCoverPlatforms.has(platform)) return { ok: true };
    const requiredAspects = requiredCoverAspectsForPlatform(platform);
    if (!requiredAspects.length) {
      resolvedCoverPlatforms.add(platform);
      return { ok: true };
    }
    const manifestDir = path.dirname(args.awaitCoverPath);
    const deadline = Date.now() + args.awaitCoverTimeoutSec * 1000;
    console.error(`[video-publisher-v2] ${platform} awaiting cover aspects (${requiredAspects.join(",")}) from ${args.awaitCoverPath}`);
    while (Date.now() <= deadline) {
      if (inputChannelBroken || userControl) return { ok: false, aborted: true };
      let manifest = null;
      if (fs.existsSync(args.awaitCoverPath)) {
        try {
          manifest = JSON.parse(await fs.promises.readFile(args.awaitCoverPath, "utf8"));
        } catch {
          manifest = null;
        }
      }
      if (manifest && typeof manifest === "object") {
        let pending = false;
        const resolvedPaths = {};
        for (const aspect of requiredAspects) {
          const entry = manifest.aspects?.[aspect];
          const field = ASPECT_COVER_FIELD[aspect];
          if (entry?.status === "failed") {
            return { ok: false, reason: String(entry.error || `封面生成失败 (${aspect})`) };
          }
          const isReady = entry?.status === "ready" || (!entry && manifest.status === "ready");
          if (!isReady) {
            if (manifest.status === "failed") {
              return { ok: false, reason: String(manifest.error || `封面生成失败 (${aspect})`) };
            }
            pending = true;
            break;
          }
          const candidatePath = String(entry?.path || manifest.cover?.[field] || "").trim();
          if (candidatePath) {
            resolvedPaths[field] = path.isAbsolute(candidatePath) ? candidatePath : path.resolve(manifestDir, candidatePath);
          }
        }
        if (!pending) {
          return await coverSyncQueue.enqueue(async () => {
            if (resolvedCoverPlatforms.has(platform)) return { ok: true };
            const rawPkg = JSON.parse(await fs.promises.readFile(args.packagePath, "utf8"));
            rawPkg.cover = { ...(rawPkg.cover || {}), uploadCustomCover: true };
            let packageUpdated = false;
            for (const [field, absolute] of Object.entries(resolvedPaths)) {
              if (rawPkg.cover[field] !== absolute) {
                rawPkg.cover[field] = absolute;
                packageUpdated = true;
              }
            }
            if (packageUpdated) writeJsonAtomic(args.packagePath, rawPkg);
            pkg = readPackage(args.packagePath);
            const coverErrors = validateCoverPackage(pkg, platform, { skipCoverFiles: false });
            if (coverErrors.length > 0) {
              return { ok: false, reason: coverErrors.join("; ") };
            }
            identity = await buildIdentity(pkg, { allowMissingCoverAssets: true, cachedVideo: identity.video });
            await applyResolvedCoverIdentity(store, state, identity, args);
            resolvedCoverPlatforms.add(platform);
            if (runnablePlatforms.every(key => resolvedCoverPlatforms.has(key))) {
              state.awaitingCover = false;
              await store.save();
            }
            return { ok: true };
          });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return { ok: false, reason: `等待封面超时 (${args.awaitCoverTimeoutSec}s): ${requiredAspects.join(", ")}` };
  }

  function enqueuePlatformMutationAndVerify(platform) {
    return ui.enqueue(async () => {
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
    });
  }

  function scheduleAdvance(platform) {
    if (advancementTasks.has(platform)) return advancementTasks.get(platform);
    const runTask = (!deferCoverStartup || resolvedCoverPlatforms.has(platform))
      ? enqueuePlatformMutationAndVerify(platform)
      : (async () => {
        if (inputChannelBroken || userControl || !canAdvance(platform)) return;
        const coverReady = await ensurePlatformCoverReady(platform);
        if (!coverReady.ok) {
          if (!coverReady.aborted && !inputChannelBroken && !userControl) {
            await recordCoverWaitFailure(platform, coverReady.reason);
          }
          return;
        }
        await enqueuePlatformMutationAndVerify(platform);
      })();
    const task = runTask.then(
      () => ({ platform, error: null }),
      error => ({ platform, error }),
    );
    advancementTasks.set(platform, task);
    return task;
  }

  // Start every missing upload first. Platforms with live-proven editable upload
  // states may prefill metadata through the same one-wide UI queue, then resume
  // their completion wait before final mutation and verification.
  const uploadTargets = inputChannelBroken || userControl || args.operation === "replace-cover" ? [] : runnablePlatforms.filter(platform => state.platforms[platform].status === "needs_upload");
  console.error(`[video-publisher-v2] upload parallel=${args.uploadConcurrency}: ${uploadTargets.join(",") || "none"}`);
  const uploadPool = runPool(uploadTargets, args.uploadConcurrency, async platform => {
    if (inputChannelBroken || userControl) return;
    if (EARLY_PREFILL_PLATFORMS.has(platform)) {
      const started=await invoke(platform, "upload_start");
      if (inputChannelBroken || userControl || terminalStatuses.has(state.platforms[platform].status)) return;
      if (started.observation.actions?.upload?.stage === "editable_uploading") {
        let prefillResult = null;
        await ui.enqueue(async () => {
          if (inputChannelBroken || userControl || terminalStatuses.has(state.platforms[platform].status)) return;
          prefillResult = await invoke(platform, "prefill");
        });
        if (inputChannelBroken || userControl) return;
        if (terminalStatuses.has(state.platforms[platform].status)) {
          const prefillVerdict = prefillResult?.verdict;
          const safeToDefer = prefillVerdict?.blocker?.retryable === true
            && prefillVerdict?.gates?.video?.evidence?.uploading === true
            && ![BLOCKER.AUTH_REQUIRED, BLOCKER.USER_CONTROL, BLOCKER.INPUT_CHANNEL_BROKEN, BLOCKER.RISK_CONTROL]
              .includes(prefillVerdict?.blocker?.code);
          if (!safeToDefer) return;
          state.platforms[platform].status = "needs_upload";
          await store.save();
          console.error(`[video-publisher-v2] ${platform} prefill deferred until upload completion: ${prefillVerdict.blocker.code}`);
        }
      }
      if (canAdvance(platform)) {
        scheduleAdvance(platform);
        return;
      }
      if (state.platforms[platform].status !== "needs_upload") return;
    }
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
  const allReady = Object.values(state.platforms).every(item => item.verdict?.ready === true);
  state.status = userControl ? "paused_user" : allReady ? "ready" : "blocked";
  const plan = await maybeCleanupSpaces(args, state, { complete, userControl, inputChannelBroken, incomingInProgress });
  await persistKeepSpace(store, state, args, plan?.closeCurrent === true);
  await store.close();
  console.log(JSON.stringify(summary(state, args.platforms, store.statePath), null, 2));
  if (!complete) process.exitCode = 10;
}

async function maybeCleanupSpaces(args, state, { complete, userControl, inputChannelBroken = false, incomingInProgress = false }) {
  const plan = buildCleanupPlan(args, state, { complete, userControl, inputChannelBroken, incomingInProgress });
  if (!plan) return null;
  try {
    const cleaned = await cleanupTaskSpaces(plan);
    if (cleaned.closed.length) {
      console.error(`[video-publisher-v2] closed task spaces: ${cleaned.closed.map(item => item.name || item.id).join(", ")}`);
    }
  } catch (error) {
    console.error(`[video-publisher-v2] task space cleanup skipped: ${String(error?.message || error)}`);
  }
  return plan;
}

function summary(state, platforms, statePath) {
  return {
    schemaVersion: 4,
    jobId: state.jobId,
    operation: state.revisions?.at(-1)?.operation || "unknown",
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
    process.exitCode = error instanceof UsageError ? 2 : error instanceof JobBusyError ? 1 : 1;
  })
  .finally(() => {
    for (const release of activeLockReleases.reverse()) release();
  });
