export const PLATFORMS = ["xiaohongshu", "douyin", "bilibili", "wechat_channels"];

export const BLOCKER = Object.freeze({
  AUTH_REQUIRED: "AUTH_REQUIRED",
  USER_CONTROL: "USER_CONTROL",
  FOREIGN_DRAFT: "FOREIGN_DRAFT",
  UPLOAD_NOT_STARTED: "UPLOAD_NOT_STARTED",
  UPLOAD_STALLED: "UPLOAD_STALLED",
  RISK_CONTROL: "RISK_CONTROL",
  SELECTOR_DRIFT: "SELECTOR_DRIFT",
  STATE_AMBIGUOUS: "STATE_AMBIGUOUS",
  INPUT_CHANNEL_BROKEN: "INPUT_CHANNEL_BROKEN",
  PLATFORM_REJECTED_ASSET: "PLATFORM_REJECTED_ASSET",
  ACTION_FAILED: "ACTION_FAILED",
});

const REQUIRED_GATES = Object.freeze({
  xiaohongshu: [
    "authenticated", "draftIdentity", "video", "title", "tags", "original",
    "cover", "noBlockingDialog", "finalButton", "safety",
  ],
  douyin: [
    "authenticated", "draftIdentity", "video", "title", "description", "tags",
    "settings", "cover", "noBlockingDialog", "finalButton", "safety",
  ],
  bilibili: [
    "authenticated", "draftIdentity", "video", "title", "description", "tags",
    "original", "cover", "noBlockingDialog", "finalButton", "safety",
  ],
  wechat_channels: [
    "authenticated", "draftIdentity", "video", "description", "shortTitle", "original",
    "cover", "noBlockingDialog", "finalButton", "safety",
  ],
});

export function gate(ok, evidence = {}, extra = {}) {
  return { ok: ok === true, evidence, ...extra };
}

export function requiredGates(platform) {
  const gates = REQUIRED_GATES[platform];
  if (!gates) throw new Error(`Unsupported platform: ${platform}`);
  return [...gates];
}

function normalizedBlocker(blocker) {
  if (!blocker) return null;
  if (typeof blocker === "string") {
    return { code: BLOCKER.ACTION_FAILED, message: blocker, retryable: false, requiresUser: false };
  }
  return {
    code: blocker.code || BLOCKER.ACTION_FAILED,
    message: blocker.message || blocker.code || "platform action failed",
    retryable: blocker.retryable === true,
    requiresUser: blocker.requiresUser === true,
    evidence: blocker.evidence || null,
  };
}

function missingGateBlocker(observation, missing) {
  const gates = observation.gates || {};
  if (gates.authenticated?.ok === false) {
    return { code: BLOCKER.AUTH_REQUIRED, message: "平台登录态无效或遇到安全验证", retryable: false, requiresUser: true };
  }
  if (gates.draftIdentity?.ok === false && gates.draftIdentity?.evidence?.foreign === true) {
    return { code: BLOCKER.FOREIGN_DRAFT, message: "当前编辑器属于其他视频草稿", retryable: observation.platform === "bilibili", requiresUser: false };
  }
  if (gates.video?.evidence?.uploading === true) {
    return { code: BLOCKER.UPLOAD_STALLED, message: "视频仍在上传或处理中", retryable: true, requiresUser: false };
  }
  return {
    code: BLOCKER.STATE_AMBIGUOUS,
    message: `以下发布条件没有被页面证据确认: ${missing.join(", ")}`,
    retryable: true,
    requiresUser: false,
    evidence: Object.fromEntries(missing.map(name => [name, gates[name] || null])),
  };
}

export function evaluateObservation(observation) {
  if (!observation || !PLATFORMS.includes(observation.platform)) {
    throw new Error("Invalid platform observation");
  }
  const required = requiredGates(observation.platform);
  const missing = required.filter(name => observation.gates?.[name]?.ok !== true);
  const actionBlocker = normalizedBlocker(observation.blocker);
  const blocker = actionBlocker || (missing.length ? missingGateBlocker(observation, missing) : null);
  const ready = missing.length === 0 && blocker === null;
  return {
    schemaVersion: 1,
    platform: observation.platform,
    taskSpaceId: observation.taskSpaceId ?? null,
    phase: observation.phase || "inspect",
    observedAt: observation.observedAt || new Date().toISOString(),
    ready,
    required,
    missing,
    blocker,
    gates: observation.gates || {},
    evidence: observation.evidence || {},
  };
}

export function classifyVerdict(verdict) {
  if (verdict.ready) return "ready";
  if (verdict.blocker?.code === BLOCKER.AUTH_REQUIRED || verdict.blocker?.code === BLOCKER.USER_CONTROL) return "blocked_user";
  if (verdict.blocker?.code === BLOCKER.FOREIGN_DRAFT) {
    return verdict.platform === "bilibili" ? "needs_quarantine" : "blocked_foreign_draft";
  }
  if (verdict.gates.video?.ok !== true) return "needs_upload";
  return "needs_mutation";
}

export function compactVerdict(verdict) {
  return {
    platform: verdict.platform,
    phase: verdict.phase,
    taskSpaceId: verdict.taskSpaceId,
    ready: verdict.ready,
    missing: verdict.missing,
    blocker: verdict.blocker,
  };
}
