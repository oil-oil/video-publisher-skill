import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JobStore } from "../lib/job-store.mjs";

test("job store restores only matching receipt checkpoints", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-checkpoint-test-"));
  const store = new JobStore(root, { schemaVersion: 3, updatedAt: "", platforms: { douyin: {} } });
  await store.initialize();
  const checkpoint = {
    schemaVersion: 1,
    platform: "douyin",
    fingerprint: "matching-fingerprint",
    writtenAt: new Date().toISOString(),
    receipts: { cover: { slots: { portrait: { afterUrl: "portrait" }, landscape: { afterUrl: "landscape" } } } },
  };
  await fs.promises.writeFile(store.receiptCheckpointPath("douyin"), JSON.stringify(checkpoint));
  assert.deepEqual(await store.loadReceiptCheckpoint("douyin", "matching-fingerprint"), checkpoint);
  assert.equal(await store.loadReceiptCheckpoint("douyin", "another-package"), null);
  assert.equal(await store.loadReceiptCheckpoint("bilibili", "matching-fingerprint"), null);
});

test("job store restores a corrupt primary from its atomic backup", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-state-recovery-test-"));
  const initial = {
    schemaVersion: 3,
    fingerprint: "state-recovery-fingerprint",
    status: "new",
    platforms: { douyin: { taskSpaceId: null } },
  };
  const store = new JobStore(root, structuredClone(initial));
  const state = await store.initialize();
  state.platforms.douyin.taskSpaceId = 42;
  await store.save();
  state.status = "ready";
  await store.save();
  await store.close();

  await fs.promises.writeFile(store.statePath, "{BROKEN_STATE");
  const recoveredStore = new JobStore(root, structuredClone(initial));
  const recovered = await recoveredStore.initialize();
  await recoveredStore.close();

  assert.equal(recovered.platforms.douyin.taskSpaceId, 42);
  assert.equal(recovered.status, "new", "the backup is deliberately one completed save behind");
  assert.equal(recovered.recoveryEvents.length, 1);
  assert.equal(recoveredStore.lastRecovery.backupPath, recoveredStore.backupPath);
  assert.equal(fs.existsSync(recoveredStore.lastRecovery.corruptPath), true);
  assert.equal(await fs.promises.readFile(recoveredStore.lastRecovery.corruptPath, "utf8"), "{BROKEN_STATE");
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(recoveredStore.statePath, "utf8")));
  assert.equal(JSON.parse(await fs.promises.readFile(recoveredStore.backupPath, "utf8")).platforms.douyin.taskSpaceId, 42);
});

test("job store refuses a corrupt primary when no valid backup exists", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-state-no-backup-test-"));
  await fs.promises.mkdir(root, { recursive: true });
  await fs.promises.writeFile(path.join(root, "state.json"), "{BROKEN_STATE");
  const store = new JobStore(root, { schemaVersion: 3, fingerprint: "expected", platforms: {} });
  await assert.rejects(store.initialize(), /no valid atomic backup/);
});

test("job store never restores a backup from another package fingerprint", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-state-wrong-backup-test-"));
  await fs.promises.writeFile(path.join(root, "state.json"), "{BROKEN_STATE");
  await fs.promises.writeFile(path.join(root, "state.backup.json"), JSON.stringify({
    schemaVersion: 3,
    fingerprint: "another-package",
    platforms: {},
  }));
  const store = new JobStore(root, { schemaVersion: 3, fingerprint: "expected-package", platforms: {} });
  await assert.rejects(store.initialize(), /backup belongs to another package/);
  assert.equal(await fs.promises.readFile(path.join(root, "state.json"), "utf8"), "{BROKEN_STATE");
});
