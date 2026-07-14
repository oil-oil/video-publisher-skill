import fs from "node:fs";
import path from "node:path";

function validState(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

async function readState(filePath) {
  const parsed = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  if (!validState(parsed)) throw new Error(`Job state is not a JSON object: ${filePath}`);
  return parsed;
}

export class JobStore {
  constructor(jobDir, initialState) {
    this.jobDir = jobDir;
    this.statePath = path.join(jobDir, "state.json");
    this.backupPath = path.join(jobDir, "state.backup.json");
    this.evidenceDir = path.join(jobDir, "evidence");
    this.checkpointDir = path.join(jobDir, "checkpoints");
    this.state = initialState;
    this.sequence = 0;
    this.queue = Promise.resolve();
    this.lastRecovery = null;
  }

  async initialize() {
    await fs.promises.mkdir(this.evidenceDir, { recursive: true });
    await fs.promises.mkdir(this.checkpointDir, { recursive: true });
    const expectedFingerprint = this.state?.fingerprint || null;
    if (fs.existsSync(this.statePath)) {
      try {
        this.state = await readState(this.statePath);
      } catch (primaryError) {
        let backup;
        try {
          backup = await readState(this.backupPath);
        } catch (backupError) {
          throw new Error(
            `Job state is corrupted and no valid atomic backup is available: ${this.statePath}; `
            + `primary=${String(primaryError?.message || primaryError)}; backup=${String(backupError?.message || backupError)}`,
          );
        }
        if (expectedFingerprint && backup.fingerprint !== expectedFingerprint) {
          throw new Error(`Job state backup belongs to another package: ${this.backupPath}`);
        }
        const recoveredAt = new Date().toISOString();
        const stamp = recoveredAt.replace(/[:.]/g, "-");
        const corruptPath = path.join(this.jobDir, `state.corrupt-${stamp}.json`);
        await fs.promises.rename(this.statePath, corruptPath);
        this.state = backup;
        this.state.recoveryEvents ||= [];
        this.state.recoveryEvents.push({ recoveredAt, backupPath: this.backupPath, corruptPath });
        if (this.state.recoveryEvents.length > 20) this.state.recoveryEvents = this.state.recoveryEvents.slice(-20);
        this.lastRecovery = { recoveredAt, backupPath: this.backupPath, corruptPath };
      }
    }
    await this.save();
    return this.state;
  }

  receiptCheckpointPath(platform) {
    return path.join(this.checkpointDir, `${platform}.receipts.json`);
  }

  async loadReceiptCheckpoint(platform, fingerprint, taskSpaceId = null) {
    const checkpointPath = this.receiptCheckpointPath(platform);
    if (!fs.existsSync(checkpointPath)) return null;
    try {
      const payload = JSON.parse(await fs.promises.readFile(checkpointPath, "utf8"));
      if (![1, 2].includes(payload.schemaVersion) || payload.platform !== platform || payload.fingerprint !== fingerprint || !payload.receipts || typeof payload.receipts !== "object") return null;
      if (payload.taskSpaceId != null && taskSpaceId != null && Number(payload.taskSpaceId) !== Number(taskSpaceId)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  async clearReceiptCheckpoint(platform) {
    await fs.promises.rm(this.receiptCheckpointPath(platform), { force: true });
  }

  save() {
    this.state.updatedAt = new Date().toISOString();
    const body = JSON.stringify(this.state, null, 2) + "\n";
    const temp = `${this.statePath}.${process.pid}.${++this.sequence}.tmp`;
    const backupTemp = `${this.backupPath}.${process.pid}.${this.sequence}.tmp`;
    this.queue = this.queue.then(async () => {
      try {
        await fs.promises.writeFile(temp, body);
        if (fs.existsSync(this.statePath)) {
          await fs.promises.copyFile(this.statePath, backupTemp);
          await fs.promises.rename(backupTemp, this.backupPath);
        }
        await fs.promises.rename(temp, this.statePath);
      } catch (error) {
        await Promise.allSettled([
          fs.promises.rm(temp, { force: true }),
          fs.promises.rm(backupTemp, { force: true }),
        ]);
        throw error;
      }
    });
    return this.queue;
  }

  async record(platform, phase, observation, verdict) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = `${stamp}-${String(this.sequence).padStart(4, "0")}-${platform}-${phase}.json`;
    const evidencePath = path.join(this.evidenceDir, file);
    await fs.promises.writeFile(evidencePath, JSON.stringify({ observation, verdict }, null, 2) + "\n");
    const item = this.state.platforms[platform];
    item.lastEvidencePath = evidencePath;
    item.lastObservedAt = observation.observedAt;
    item.taskSpaceId = observation.taskSpaceId ?? item.taskSpaceId ?? null;
    item.verdict = verdict;
    item.history ||= [];
    item.history.push({ at: observation.observedAt, phase, evidencePath, ready: verdict.ready, missing: verdict.missing, blocker: verdict.blocker });
    if (item.history.length > 40) item.history = item.history.slice(-40);
    await this.save();
    return evidencePath;
  }

  async close() {
    await this.queue;
  }
}
