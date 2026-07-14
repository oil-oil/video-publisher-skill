import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquirePlatformLock, PlatformBusyError } from "../lib/platform-lock.mjs";

test("platform lock refuses overlapping control and releases idempotently", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-lock-test-"));
  const release = acquirePlatformLock("douyin", "mutate", { root });
  assert.throws(() => acquirePlatformLock("douyin", "inspect", { root }), PlatformBusyError);
  release();
  release();
  const releaseAgain = acquirePlatformLock("douyin", "inspect", { root });
  releaseAgain();
});

test("platform lock removes a stale dead-owner lock", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-stale-lock-test-"));
  const lockPath = path.join(root, "bilibili.lock");
  await fs.promises.mkdir(lockPath);
  await fs.promises.writeFile(path.join(lockPath, "owner.json"), JSON.stringify({ pid: 99999999, phase: "upload" }));
  const release = acquirePlatformLock("bilibili", "inspect", { root });
  release();
  assert.equal(fs.existsSync(lockPath), false);
});
