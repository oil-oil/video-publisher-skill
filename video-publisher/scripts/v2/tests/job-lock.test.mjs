import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { acquireJobLock, assertJobLockOwner, JobBusyError, registerJobLockMember } from "../lib/job-lock.mjs";

test("job lock permits exactly one orchestrator and releases idempotently", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-job-lock-test-"));
  const release = acquireJobLock(root, { jobId: "same-job", packagePath: "/tmp/package.json" });
  assert.equal(typeof release.token, "string");
  assert.equal(assertJobLockOwner(root, release.token).jobId, "same-job");
  assert.throws(() => assertJobLockOwner(root, "wrong-token"), JobBusyError);
  assert.equal(fs.statSync(root).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(root, "orchestrator.lock", "owner.json")).mode & 0o777, 0o600);
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

test("job lock remains busy while a token-bound child member is alive", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-member-lock-test-"));
  const release = acquireJobLock(root, { jobId: "parent-job", scope: "publisher" });
  const worker = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  registerJobLockMember(root, release.token, { pid: worker.pid, role: "test-worker" });
  const ownerPath = path.join(root, "orchestrator.lock", "owner.json");
  const owner = JSON.parse(await fs.promises.readFile(ownerPath, "utf8"));
  await fs.promises.writeFile(ownerPath, JSON.stringify({ ...owner, pid: 99999999 }), { mode: 0o600 });
  assert.throws(() => acquireJobLock(root, { jobId: "replacement", scope: "publisher" }), JobBusyError);
  worker.kill("SIGTERM");
  await new Promise(resolve => worker.once("close", resolve));
  const replacement = acquireJobLock(root, { jobId: "replacement", scope: "publisher" });
  replacement();
  release();
});
