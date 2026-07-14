import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  coverAssetsForPlatform,
  readPackage,
  validateDouyinPackage,
  validateXiaohongshuPackage,
} from "../lib/content-package.mjs";
import { defaultConfig, normalizeConfig } from "../lib/config.mjs";
import {
  DOUYIN_MAX_DURATION_SECONDS,
  inspectMediaFile,
  readIsoBmffDuration,
  validateMediaForPlatform,
} from "../lib/media.mjs";

async function withTempDir(callback) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-package-test-"));
  try {
    await callback(root);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
}

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  buffer[0] = 0x89;
  buffer.write("PNG", 1, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function box(type, payload) {
  const buffer = Buffer.alloc(8 + payload.length);
  buffer.writeUInt32BE(buffer.length, 0);
  buffer.write(type, 4, "ascii");
  payload.copy(buffer, 8);
  return buffer;
}

function mp4WithDuration(durationSeconds, timescale = 1000) {
  const payload = Buffer.alloc(20);
  payload[0] = 0;
  payload.writeUInt32BE(timescale, 12);
  payload.writeUInt32BE(Math.round(durationSeconds * timescale), 16);
  return Buffer.concat([box("ftyp", Buffer.alloc(4)), box("moov", box("mvhd", payload))]);
}

test("Douyin topics come from the package instead of account-specific defaults", async () => {
  await withTempDir(async root => {
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Generic video",
      douyinTopics: ["Automation", "Tutorial"],
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(pkg.douyinTopics, ["Automation", "Tutorial"]);
    assert.deepEqual(validateDouyinPackage(pkg), []);
  });
});

test("Bilibili automatic-tag allowlist is empty unless the package supplies it", async () => {
  await withTempDir(async root => {
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Generic video",
      bilibiliTags: ["Automation"],
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(pkg.bilibiliAllowedAutoTags, []);
  });
});

test("an existing cover asset needs only its file path and ratio", async () => {
  await withTempDir(async root => {
    const coverPath = path.join(root, "cover-3x4.png");
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(coverPath, pngHeader(1080, 1440));
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Generic video",
      xhsTopics: ["Automation"],
      cover: {
        uploadCustomCover: true,
        vertical3x4Path: coverPath,
      },
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(validateXiaohongshuPackage(pkg), []);
    assert.deepEqual(coverAssetsForPlatform(pkg, "xiaohongshu"), [
      { slot: "portrait", ratio: "3:4", path: coverPath },
    ]);
  });
});

test("account defaults fill only fields omitted from the package", async () => {
  await withTempDir(async root => {
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Generic video",
      bilibiliTags: ["Tutorial"],
    }));
    const config = normalizeConfig({
      platforms: {
        douyin: { defaultTopics: ["Default topic"] },
        bilibili: { allowedAutoTags: ["Platform tag"] },
      },
    });
    const pkg = readPackage(packagePath, { config });
    assert.deepEqual(pkg.douyinTopics, ["Default topic"]);
    assert.deepEqual(pkg.bilibiliAllowedAutoTags, ["Platform tag"]);
  });
});

test("ISO BMFF duration parser reads mvhd without ffprobe", async () => {
  await withTempDir(async root => {
    const videoPath = path.join(root, "long.mp4");
    await fs.promises.writeFile(videoPath, mp4WithDuration(909.162));
    assert.equal(readIsoBmffDuration(videoPath), 909.162);
    const media = inspectMediaFile(videoPath);
    assert.equal(media.durationSource, "iso-bmff-mvhd");
    assert.equal(media.durationSeconds, 909.162);
  });
});

test("Douyin preflight accepts 15:00 and rejects longer media only for Douyin", async () => {
  await withTempDir(async root => {
    const acceptedPath = path.join(root, "accepted.mp4");
    const rejectedPath = path.join(root, "rejected.mp4");
    await fs.promises.writeFile(acceptedPath, mp4WithDuration(DOUYIN_MAX_DURATION_SECONDS));
    await fs.promises.writeFile(rejectedPath, mp4WithDuration(DOUYIN_MAX_DURATION_SECONDS + 1));
    assert.deepEqual(validateMediaForPlatform({ videoPath: acceptedPath }, "douyin"), []);
    assert.match(validateMediaForPlatform({ videoPath: rejectedPath }, "douyin")[0], /DOUYIN_DURATION_LIMIT/);
    assert.deepEqual(validateMediaForPlatform({ videoPath: rejectedPath }, "xiaohongshu"), []);
  });
});
