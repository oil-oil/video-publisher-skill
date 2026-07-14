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
