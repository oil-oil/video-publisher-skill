import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class PlatformBusyError extends Error {
  constructor(platform, owner = {}) {
    super(`Platform ${platform} is already controlled by PID ${owner.pid || "unknown"} (${owner.phase || "unknown phase"}); refusing overlapping Ego control`);
    this.name = "PlatformBusyError";
    this.platform = platform;
    this.owner = owner;
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

export function acquirePlatformLock(platform, phase, options = {}) {
  const root = options.root || path.join(os.homedir(), ".video-publisher", "v2-locks");
  const lockPath = path.join(root, `${platform}.lock`);
  fs.mkdirSync(root, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(lockPath);
      const owner = { pid: process.pid, platform, phase, acquiredAt: new Date().toISOString() };
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
      if (!processAlive(Number(owner.pid))) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      throw new PlatformBusyError(platform, owner);
    }
  }
  throw new Error(`Could not acquire platform lock for ${platform}`);
}
