import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const INVALID_OWNER_GRACE_MS = 5000;

export class JobBusyError extends Error {
  constructor(jobId, owner = {}, scope = "job") {
    const ownerText = owner.pid
      ? `under PID ${owner.pid}`
      : "by another orchestrator that is still acquiring its lock";
    const subject = scope === "publisher" ? "Another video publishing job" : `Job ${jobId}`;
    super(`${subject} is already running ${ownerText}; refusing a second orchestrator`);
    this.name = "JobBusyError";
    this.jobId = jobId;
    this.owner = owner;
    this.scope = scope;
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockPath, "owner.json"), "utf8"));
  } catch {
    return {};
  }
}

function liveMembers(lockPath, token) {
  const membersPath = path.join(lockPath, "members");
  if (!fs.existsSync(membersPath)) return [];
  const members = [];
  for (const name of fs.readdirSync(membersPath)) {
    if (!name.endsWith(".json")) continue;
    try {
      const member = JSON.parse(fs.readFileSync(path.join(membersPath, name), "utf8"));
      if (member.token === token && processAlive(Number(member.pid))) members.push(member);
    } catch {}
  }
  return members;
}

function secureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}

export function resolvePublisherLockDirectory() {
  const root = process.env.VIDEO_PUBLISHER_V2_LOCK_ROOT
    ? path.resolve(process.env.VIDEO_PUBLISHER_V2_LOCK_ROOT)
    : path.join(os.homedir(), ".video-publisher", "v2-locks");
  return path.join(root, "publisher");
}

export function assertJobLockOwner(jobDir, token) {
  const lockPath = path.join(jobDir, "orchestrator.lock");
  const owner = readOwner(lockPath);
  if (!token || owner.token !== token || !processAlive(Number(owner.pid))) {
    throw new JobBusyError(owner.jobId || path.basename(jobDir), owner, owner.scope || "publisher");
  }
  return owner;
}

export function registerJobLockMember(jobDir, token, { pid = process.pid, role = "worker" } = {}) {
  const lockPath = path.join(jobDir, "orchestrator.lock");
  assertJobLockOwner(jobDir, token);
  if (!Number.isInteger(Number(pid)) || Number(pid) < 1) throw new Error("publisher lock member pid must be a positive integer");
  const membersPath = path.join(lockPath, "members");
  secureDirectory(membersPath);
  const memberId = `${Number(pid)}-${crypto.randomUUID()}`;
  const memberPath = path.join(membersPath, `${memberId}.json`);
  const tempPath = `${memberPath}.tmp`;
  const member = { pid: Number(pid), token, role, registeredAt: new Date().toISOString() };
  fs.writeFileSync(tempPath, JSON.stringify(member, null, 2), { mode: 0o600 });
  fs.renameSync(tempPath, memberPath);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    fs.rmSync(memberPath, { force: true });
    const owner = readOwner(lockPath);
    if (owner.token === token && !processAlive(Number(owner.pid)) && liveMembers(lockPath, token).length === 0) {
      fs.rmSync(lockPath, { recursive: true, force: true });
    }
  };
}

function invalidOwnerIsStale(lockPath) {
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs > INVALID_OWNER_GRACE_MS;
  } catch {
    return false;
  }
}

export function acquireJobLock(jobDir, { jobId, packagePath, scope = "job" } = {}) {
  const lockPath = path.join(jobDir, "orchestrator.lock");
  secureDirectory(jobDir);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      const token = crypto.randomUUID();
      const owner = { pid: process.pid, token, scope, jobId, packagePath, acquiredAt: new Date().toISOString() };
      fs.writeFileSync(path.join(lockPath, "owner.json"), JSON.stringify(owner, null, 2), { mode: 0o600 });
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        const current = readOwner(lockPath);
        if (current.pid === process.pid && current.token === token && liveMembers(lockPath, token).length === 0) {
          fs.rmSync(lockPath, { recursive: true, force: true });
        }
      };
      release.token = token;
      return release;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = readOwner(lockPath);
      const ownerPid = Number(owner.pid);
      if ((Number.isInteger(ownerPid) && !processAlive(ownerPid) && liveMembers(lockPath, owner.token).length === 0)
        || (!Number.isInteger(ownerPid) && invalidOwnerIsStale(lockPath))) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      throw new JobBusyError(jobId || path.basename(jobDir), owner, scope);
    }
  }
  throw new Error(`Could not acquire orchestrator lock for job ${jobId || path.basename(jobDir)}`);
}
