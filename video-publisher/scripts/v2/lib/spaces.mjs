import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export const IN_PROGRESS_STATUSES = ["running", "inspecting", "paused_user", "blocked"];
export const LEGACY_COLLECT_SPACE = "oil-collect-publish";

export function collectJobSpaces(state, platforms) {
  const ids = [];
  const names = [];
  for (const platform of platforms) {
    const item = state.platforms?.[platform];
    if (!item) continue;
    if (item.taskSpaceId != null) ids.push(Number(item.taskSpaceId));
    if (item.taskSpaceName) names.push(item.taskSpaceName);
  }
  return { ids, names };
}

export function collectRetiredSpaces(state) {
  const ids = [];
  const names = [];
  for (const item of state.retiredSpaces || []) {
    if (item?.id != null) ids.push(Number(item.id));
    if (item?.name) names.push(item.name);
  }
  return { ids, names };
}

export function collectCompletedSpaces(stateRoot, exceptJobId = "") {
  const ids = [];
  const names = [];
  if (!stateRoot || !fs.existsSync(stateRoot)) return { ids, names };
  for (const entry of fs.readdirSync(stateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === exceptJobId) continue;
    const statePath = path.join(stateRoot, entry.name, "state.json");
    if (!fs.existsSync(statePath)) continue;
    try {
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (state.status !== "ready" && state.status !== "inspected") continue;
      const retired = collectRetiredSpaces(state);
      ids.push(...retired.ids);
      names.push(...retired.names);
      if (state.keepSpace === true) continue;
      const listed = collectJobSpaces(state, Object.keys(state.platforms || {}));
      ids.push(...listed.ids);
      names.push(...listed.names);
    } catch {
      // ignore unreadable leftover state
    }
  }
  return { ids, names };
}

export function uniqueIds(values) {
  return [...new Set((values || []).map(Number).filter(Number.isFinite))];
}

export function uniqueNames(values) {
  return [...new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))];
}

export function shouldRotateSpaces(args, state) {
  if (args.cleanupOnly) return false;
  if (args.spaceName) return false;
  if (args.forceFreshSpace) return true;
  if (!args.freshSpace) return false;
  if (args.inspectOnly) return false;
  return !IN_PROGRESS_STATUSES.includes(state.status);
}

export function shouldCloseCurrentSpaces(args, state, { complete = false, incomingInProgress = false } = {}) {
  if (incomingInProgress && !args.cleanupOnly) return false;
  if (args.inspectOnly) return !incomingInProgress && args.keepSpace !== true && state.keepSpace !== true;
  if (args.cleanupOnly) {
    return complete === true && !IN_PROGRESS_STATUSES.includes(state.status);
  }
  if (args.keepSpace) return false;
  return complete === true;
}

export function buildSpaceName({ spaceName, spacePrefix, platform, taskSuffix, jobId, stamp }) {
  if (spaceName) return spaceName;
  const unique = stamp ? `-${stamp}` : "";
  return `${spacePrefix} ${platform} ${taskSuffix}-${jobId}${unique}`;
}

export function retireCurrentSpaces(state, platforms, observedAt = new Date().toISOString()) {
  state.retiredSpaces ||= [];
  for (const platform of platforms) {
    const item = state.platforms?.[platform];
    if (!item) continue;
    if (item.taskSpaceId == null && !item.taskSpaceName) continue;
    state.retiredSpaces.push({
      id: item.taskSpaceId ?? null,
      name: item.taskSpaceName || null,
      platform,
      retiredAt: observedAt,
    });
  }
  if (state.retiredSpaces.length > 80) state.retiredSpaces = state.retiredSpaces.slice(-80);
  return state.retiredSpaces;
}

export function spaceShouldClose(space, policy) {
  const name = String(space?.name || "");
  const id = space?.id;
  if (space?.ownership === "user") return false;
  if (policy.keepIds.has(id) || policy.keepNames.has(name)) return false;
  // Ego 会复用数字 ID；关闭操作必须匹配记录的名称。
  if (policy.closeNames.has(name)) return true;
  return (policy.prefixes || []).some(prefix => prefix && (name === prefix || name.startsWith(prefix)));
}

export function selectSpacesToClose(spaces, policy) {
  return (spaces || []).filter(space => spaceShouldClose(space, policy));
}

export function runEgoScript(script, command = process.env.VIDEO_PUBLISHER_V2_EGO_COMMAND || "ego-browser") {
  const isNodeScript = /\.(mjs|cjs|js)$/.test(command);
  const file = isNodeScript ? process.execPath : command;
  const args = isNodeScript ? [command] : ["nodejs"];
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(script);
  });
}

export function spaceCleanupScript({ closeNames, keepIds, keepNames, prefixes }) {
  return `
const closeNames = new Set(${JSON.stringify(closeNames)});
const keepIds = new Set(${JSON.stringify(keepIds)});
const keepNames = new Set(${JSON.stringify(keepNames)});
const prefixes = ${JSON.stringify(prefixes)};
const spaces = await listTaskSpaces();
const closed = [];
for (const space of spaces || []) {
  const name = String(space.name || "");
  const id = space.id;
  if (space.ownership === "user") continue;
  if (keepIds.has(id) || keepNames.has(name)) continue;
  const stale = prefixes.some(prefix => prefix && (name === prefix || name.startsWith(prefix)));
  const explicit = closeNames.has(name);
  if (!stale && !explicit) continue;
  try {
    await completeTaskSpace(id, { keep: false });
    closed.push({ id, name });
  } catch (error) {
    closed.push({ id, name, error: String(error && error.message || error) });
  }
}
console.log("VIDEO_PUBLISHER_SPACE_CLEANUP:" + JSON.stringify({ closed }));
`;
}

export function buildCleanupPlan(args, state, { complete, userControl, inputChannelBroken = false, incomingInProgress = false }) {
  if (userControl || inputChannelBroken) return null;
  const selectedPlatforms = (args.platforms && args.platforms.length)
    ? args.platforms
    : Object.keys(state.platforms || {});
  const selectedCurrent = collectJobSpaces(state, selectedPlatforms);
  const allCurrent = collectJobSpaces(state, Object.keys(state.platforms || {}));
  const retired = collectRetiredSpaces(state);
  const stale = args.cleanupStaleSpaces
    ? collectCompletedSpaces(args.stateRoot, state.jobId || "")
    : { ids: [], names: [] };
  const closeCurrent = shouldCloseCurrentSpaces(args, state, { complete, incomingInProgress });
  const selectedIds = new Set(selectedCurrent.ids);
  const selectedNames = new Set(selectedCurrent.names);
  const keepIds = uniqueIds(allCurrent.ids.filter(id => !closeCurrent || !selectedIds.has(id)));
  const keepNames = uniqueNames(allCurrent.names.filter(name => !closeCurrent || !selectedNames.has(name)));
  const protectedNames = new Set(keepNames);
  const closeNames = uniqueNames([
    ...(closeCurrent ? selectedCurrent.names : []),
    ...retired.names,
    ...stale.names,
    ...(args.cleanupStaleSpaces ? (args.cleanupNames || [LEGACY_COLLECT_SPACE]) : []),
  ]).filter(name => !protectedNames.has(name));
  const prefixes = args.cleanupStaleSpaces ? uniqueNames(args.cleanupPrefixes || []) : [];
  if (!closeNames.length && !prefixes.length) return null;
  return {
    closeNames,
    keepIds,
    keepNames,
    prefixes,
    closeCurrent,
  };
}

export async function cleanupTaskSpaces(options) {
  const result = await runEgoScript(spaceCleanupScript(options));
  const match = `${result.stdout}\n${result.stderr}`.match(/VIDEO_PUBLISHER_SPACE_CLEANUP:(\{.*\})/);
  return {
    ok: result.code === 0,
    closed: match ? JSON.parse(match[1]).closed : [],
    detail: result.stderr.trim().slice(-800),
  };
}
