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
