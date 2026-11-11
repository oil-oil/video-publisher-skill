import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIdentity } from "../lib/identity.mjs";

function pngHeader(width, height, marker) {
  const buffer = Buffer.alloc(25);
  buffer[0] = 0x89;
  buffer.write("PNG", 1, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = marker;
  return buffer;
}

test("identity hashes 16:9 thumbnail contents while preserving content identity", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-identity-test-"));
  const videoPath = path.join(root, "video.mp4");
  const thumbnailPath = path.join(root, "thumbnail.png");
  await fs.promises.writeFile(videoPath, "video");
  await fs.promises.writeFile(thumbnailPath, pngHeader(1920, 1080, 1));
  const base = { videoPath, title: "Thumbnail", cover: { uploadCustomCover: true } };
  const first = await buildIdentity({ ...base, cover: { ...base.cover, horizontal16x9Path: thumbnailPath } });
  await fs.promises.writeFile(thumbnailPath, pngHeader(1920, 1080, 2));
  const second = await buildIdentity({ ...base, cover: { ...base.cover, horizontal16x9Path: thumbnailPath } });
  assert.equal(first.contentFingerprint, second.contentFingerprint);
  assert.equal(first.legacyFingerprint, second.legacyFingerprint);
  assert.notEqual(first.coverFingerprint, second.coverFingerprint);
  assert.notEqual(first.coverFingerprints.youtube, second.coverFingerprints.youtube);
  assert.notEqual(first.fingerprint, second.fingerprint);
});

test("a Bilibili cover override changes only the Bilibili cover identity", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-platform-cover-test-"));
  const videoPath = path.join(root, "video.mp4");
  const sharedPath = path.join(root, "shared.png");
  const bilibiliPath = path.join(root, "bilibili.png");
  await fs.promises.writeFile(videoPath, "video");
  await fs.promises.writeFile(sharedPath, pngHeader(1440, 1080, 1));
  await fs.promises.writeFile(bilibiliPath, pngHeader(1440, 1080, 2));
  const base = await buildIdentity({ videoPath, title: "Override", cover: { uploadCustomCover: true, horizontal4x3Path: sharedPath, platforms: {} } });
  const changed = await buildIdentity({ videoPath, title: "Override", cover: { uploadCustomCover: true, horizontal4x3Path: sharedPath, platforms: { bilibili: { horizontal4x3Path: bilibiliPath } } } });
  assert.notEqual(base.coverFingerprints.bilibili, changed.coverFingerprints.bilibili);
  assert.equal(base.coverFingerprints.douyin, changed.coverFingerprints.douyin);
  assert.equal(base.coverFingerprints.wechat_channels, changed.coverFingerprints.wechat_channels);
});

test("buildIdentity supports missing deferred covers and sidecar SHA-256 cache reuse", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-deferred-identity-test-"));
  try {
    const videoPath = path.join(root, "demo.mp4");
    const futureCover = path.join(root, "demo_3x4.png");
    await fs.promises.writeFile(videoPath, "real-video-bytes");
    const initial = await buildIdentity(
      { videoPath, title: "Deferred", cover: { uploadCustomCover: true, vertical3x4Path: futureCover } },
      { allowMissingCoverAssets: true },
    );
    assert.deepEqual(initial.missingCoverPaths, [futureCover]);
    const statBig = await fs.promises.stat(videoPath, { bigint: true });
    await fs.promises.writeFile(
      path.join(root, "demo.video-fingerprint.json"),
      JSON.stringify({
        sourceFingerprint: {
          path: videoPath,
          size: Number(statBig.size),
          mtimeNs: String(statBig.mtimeNs),
          sha256: initial.video.sha256,
        },
      }),
    );
    await fs.promises.writeFile(futureCover, pngHeader(1080, 1440, 7));
    const resolved = await buildIdentity({ videoPath, title: "Deferred", cover: { uploadCustomCover: true, vertical3x4Path: futureCover } });
    assert.equal(resolved.contentFingerprint, initial.contentFingerprint);
    assert.equal(resolved.video.sha256, initial.video.sha256);
    assert.equal(resolved.assets.length, 1);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
