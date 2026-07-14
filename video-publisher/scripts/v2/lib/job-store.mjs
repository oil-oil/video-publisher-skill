import fs from "node:fs";
import path from "node:path";

export class JobStore {
  constructor(jobDir, initialState) {
    this.jobDir = jobDir;
    this.statePath = path.join(jobDir, "state.json");
    this.evidenceDir = path.join(jobDir, "evidence");
    this.state = initialState;
    this.sequence = 0;
    this.queue = Promise.resolve();
  }

  async initialize() {
    await fs.promises.mkdir(this.evidenceDir, { recursive: true });
    if (fs.existsSync(this.statePath)) this.state = JSON.parse(await fs.promises.readFile(this.statePath, "utf8"));
    await this.save();
    return this.state;
  }

  save() {
    this.state.updatedAt = new Date().toISOString();
    const body = JSON.stringify(this.state, null, 2) + "\n";
    const temp = `${this.statePath}.${process.pid}.${++this.sequence}.tmp`;
    this.queue = this.queue.then(async () => {
      await fs.promises.writeFile(temp, body);
      await fs.promises.rename(temp, this.statePath);
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
