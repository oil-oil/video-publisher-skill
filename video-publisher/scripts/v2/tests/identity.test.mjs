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

test("changing only Bilibili's 16:9 personal-space image changes the Bilibili fingerprint", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-bilibili-space-identity-test-"));
  try {
    const videoPath = path.join(root, "video.mp4");
    const homepagePath = path.join(root, "homepage.png");
    const firstSpacePath = path.join(root, "space-a.png");
    const secondSpacePath = path.join(root, "space-b.png");
    await fs.promises.writeFile(videoPath, "video");
    await fs.promises.writeFile(homepagePath, pngHeader(1440, 1080, 1));
    await fs.promises.writeFile(firstSpacePath, pngHeader(1280, 720, 1));
    await fs.promises.writeFile(secondSpacePath, pngHeader(1280, 720, 2));
    const base = {
      videoPath,
      title: "Two Bilibili covers",
      cover: {
        uploadCustomCover: true,
        horizontal4x3Path: homepagePath,
        platforms: { bilibili: { horizontal16x9Path: firstSpacePath } },
      },
    };
    const first = await buildIdentity(base);
    const changed = await buildIdentity({
      ...base,
      cover: {
        ...base.cover,
        platforms: { bilibili: { horizontal16x9Path: secondSpacePath } },
      },
    });

    assert.equal(first.contentFingerprint, changed.contentFingerprint);
    assert.equal(first.legacyFingerprint, changed.legacyFingerprint);
    assert.notEqual(first.coverFingerprints.bilibili, changed.coverFingerprints.bilibili);
    assert.notEqual(first.coverFingerprint, changed.coverFingerprint);
    assert.notEqual(first.fingerprint, changed.fingerprint);
    for (const platform of ["xiaohongshu", "douyin", "wechat_channels", "youtube"]) {
      assert.equal(first.coverFingerprints[platform], changed.coverFingerprints[platform]);
    }
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
