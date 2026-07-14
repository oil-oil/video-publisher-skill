import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireJobLock, JobBusyError } from "../lib/job-lock.mjs";

test("job lock permits exactly one orchestrator and releases idempotently", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-job-lock-test-"));
  const release = acquireJobLock(root, { jobId: "same-job", packagePath: "/tmp/package.json" });
  assert.throws(() => acquireJobLock(root, { jobId: "same-job" }), JobBusyError);
  release();
  release();
  const releaseAgain = acquireJobLock(root, { jobId: "same-job" });
  releaseAgain();
});

test("job lock removes a stale dead-owner lock", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-stale-job-lock-test-"));
  const lockPath = path.join(root, "orchestrator.lock");
  await fs.promises.mkdir(lockPath);
  await fs.promises.writeFile(path.join(lockPath, "owner.json"), JSON.stringify({ pid: 99999999, jobId: "same-job" }));
  const release = acquireJobLock(root, { jobId: "same-job" });
  release();
  assert.equal(fs.existsSync(lockPath), false);
});

test("job lock treats a fresh incomplete owner as busy instead of deleting a live acquisition", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-fresh-job-lock-test-"));
  await fs.promises.mkdir(path.join(root, "orchestrator.lock"));
  assert.throws(() => acquireJobLock(root, { jobId: "same-job" }), JobBusyError);
});
