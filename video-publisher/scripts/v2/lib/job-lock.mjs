import fs from "node:fs";
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

function invalidOwnerIsStale(lockPath) {
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs > INVALID_OWNER_GRACE_MS;
  } catch {
    return false;
  }
}

export function acquireJobLock(jobDir, { jobId, packagePath, scope = "job" } = {}) {
  const lockPath = path.join(jobDir, "orchestrator.lock");
  fs.mkdirSync(jobDir, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(lockPath);
      const owner = { pid: process.pid, scope, jobId, packagePath, acquiredAt: new Date().toISOString() };
      fs.writeFileSync(path.join(lockPath, "owner.json"), JSON.stringify(owner, null, 2));
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const current = readOwner(lockPath);
        if (current.pid === process.pid) fs.rmSync(lockPath, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = readOwner(lockPath);
      const ownerPid = Number(owner.pid);
      if ((Number.isInteger(ownerPid) && !processAlive(ownerPid))
        || (!Number.isInteger(ownerPid) && invalidOwnerIsStale(lockPath))) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      throw new JobBusyError(jobId || path.basename(jobDir), owner, scope);
    }
  }
  throw new Error(`Could not acquire orchestrator lock for job ${jobId || path.basename(jobDir)}`);
}
