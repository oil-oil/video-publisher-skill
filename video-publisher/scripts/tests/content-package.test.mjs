import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  coverAssetsForPlatform,
  readPackage,
  validateBilibiliPackage,
  validateDouyinPackage,
  validateXiaohongshuPackage,
  validateYoutubePackage,
  xiaohongshuTitleLength,
} from "../lib/content-package.mjs";
import { defaultConfig, normalizeConfig } from "../lib/config.mjs";
import {
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

test("Bilibili maps and validates the 4:3 homepage master", async () => {
  await withTempDir(async root => {
    const bilibiliCoverPath = path.join(root, "cover-4x3.png");
    const companionPath = path.join(root, "cover-16x9.png");
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(bilibiliCoverPath, pngHeader(1440, 1080));
    await fs.promises.writeFile(companionPath, pngHeader(1280, 720));
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Bilibili cover test",
      bilibiliDescription: "Description",
      bilibiliTags: ["Test"],
      cover: {
        uploadCustomCover: true,
        horizontal4x3Path: bilibiliCoverPath,
        horizontal16x9Path: companionPath,
      },
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(validateBilibiliPackage(pkg), []);
    assert.deepEqual(coverAssetsForPlatform(pkg, "bilibili"), [
      { slot: "homepage-master", ratio: "4:3", path: bilibiliCoverPath },
    ]);

    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Bilibili cover test",
      bilibiliDescription: "Description",
      bilibiliTags: ["Test"],
      cover: {
        uploadCustomCover: true,
        horizontal16x9Path: companionPath,
      },
    }));
    const companionOnlyPackage = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(coverAssetsForPlatform(companionOnlyPackage, "bilibili"), []);
    assert.match(
      validateBilibiliPackage(companionOnlyPackage).join("; "),
      /requires an exact 4:3 horizontal4x3Path/,
    );
  });
});

test("platform cover overrides do not change sibling platform mappings", async () => {
  await withTempDir(async root => {
    const sharedPath = path.join(root, "shared-4x3.png");
    const bilibiliPath = path.join(root, "bilibili-4x3.png");
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(sharedPath, pngHeader(1440, 1080));
    await fs.promises.writeFile(bilibiliPath, pngHeader(1440, 1080));
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Platform cover override",
      bilibiliDescription: "Description",
      bilibiliTags: ["Test"],
      cover: {
        uploadCustomCover: true,
        horizontal4x3Path: sharedPath,
        platforms: { bilibili: { horizontal4x3Path: bilibiliPath } },
      },
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.equal(coverAssetsForPlatform(pkg, "bilibili")[0].path, bilibiliPath);
    assert.equal(coverAssetsForPlatform(pkg, "douyin").find(asset => asset.slot === "landscape").path, sharedPath);
  });
});

test("Bilibili rejects a 16:9 image in the 4:3 primary cover field", async () => {
  await withTempDir(async root => {
    const wrongCoverPath = path.join(root, "cover-16x9.png");
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(wrongCoverPath, pngHeader(1280, 720));
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Bilibili cover test",
      bilibiliDescription: "Description",
      bilibiliTags: ["Test"],
      cover: {
        uploadCustomCover: true,
        horizontal4x3Path: wrongCoverPath,
      },
    }));
    const errors = validateBilibiliPackage(readPackage(packagePath, { config: defaultConfig() }));
    assert.match(errors.join("; "), /expected 4:3, got 1280x720/);
  });
});

test("Bilibili accepts its own 4:3 cover when only a shared 16:9 cover exists", async () => {
  await withTempDir(async root => {
    const bilibiliPath = path.join(root, "bilibili-4x3.png");
    const sharedPath = path.join(root, "shared-16x9.png");
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(bilibiliPath, pngHeader(1440, 1080));
    await fs.promises.writeFile(sharedPath, pngHeader(1280, 720));
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "独立封面",
      bilibiliDescription: "说明",
      bilibiliTags: ["测试"],
      cover: {
        uploadCustomCover: true,
        horizontal16x9Path: sharedPath,
        platforms: { bilibili: { horizontal4x3Path: bilibiliPath } },
      },
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(validateBilibiliPackage(pkg), []);
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

test("Bilibili titles and non-ASCII Xiaohongshu titles use Unicode code points", async () => {
  await withTempDir(async root => {
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Generic",
      bilibiliTitle: "长".repeat(81),
      bilibiliDescription: "Description",
      bilibiliTags: ["Test"],
      xhsTitle: "😀".repeat(20),
      xhsTopics: ["Test"],
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.match(validateBilibiliPackage(pkg).join("; "), /bilibili title is 81\/80/);
    assert.deepEqual(validateXiaohongshuPackage(pkg), []);

    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "通".repeat(81),
      bilibiliTitle: "Valid Bilibili title",
      bilibiliDescription: "Description",
      bilibiliTags: ["Test"],
    }));
    assert.deepEqual(validateBilibiliPackage(readPackage(packagePath, { config: defaultConfig() })), []);
  });
});

test("Xiaohongshu title counts every ASCII character as half a character", async () => {
  await withTempDir(async root => {
    const packagePath = path.join(root, "package.json");
    const originalTitle = "DeepSeek Harness 安装上手和使用心得";
    assert.equal(xiaohongshuTitleLength(originalTitle), 17.5);
    assert.equal(xiaohongshuTitleLength("A1 !".repeat(10)), 20);
    assert.equal(xiaohongshuTitleLength("A".repeat(41)), 20.5);

    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: originalTitle,
      xhsTopics: ["Test"],
    }));
    assert.deepEqual(
      validateXiaohongshuPackage(readPackage(packagePath, { config: defaultConfig() })),
      [],
    );

    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "A".repeat(40),
      xhsTopics: ["Test"],
    }));
    assert.deepEqual(
      validateXiaohongshuPackage(readPackage(packagePath, { config: defaultConfig() })),
      [],
    );

    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "A".repeat(41),
      xhsTopics: ["Test"],
    }));
    assert.match(
      validateXiaohongshuPackage(readPackage(packagePath, { config: defaultConfig() })).join("; "),
      /xiaohongshu title is 20\.5\/20/,
    );
  });
});

test("Xiaohongshu topics reject the unsupported half-width dot before browser work", async () => {
  await withTempDir(async root => {
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "Model guide",
      xhsTopics: ["Codex", "GPT5.6"],
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.match(
      validateXiaohongshuPackage(pkg).join("; "),
      /xiaohongshu topics do not support "\.".*GPT5\.6/,
    );
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

test("Douyin preflight accepts verified long-form media without a local duration ceiling", async () => {
  await withTempDir(async root => {
    const longPath = path.join(root, "long.mp4");
    await fs.promises.writeFile(longPath, mp4WithDuration(1800));
    assert.deepEqual(validateMediaForPlatform({ videoPath: longPath }, "douyin"), []);
    assert.deepEqual(validateMediaForPlatform({ videoPath: longPath }, "xiaohongshu"), []);
  });
});

test("Douyin preflight fails closed when duration cannot be verified", async () => {
  await withTempDir(async root => {
    const unreadableMp4 = path.join(root, "unreadable.mp4");
    const unsupportedContainer = path.join(root, "sample.mkv");
    await fs.promises.writeFile(unreadableMp4, "not an ISO BMFF file");
    await fs.promises.writeFile(unsupportedContainer, "not an ISO BMFF file");
    assert.match(validateMediaForPlatform({ videoPath: unreadableMp4 }, "douyin")[0], /DOUYIN_DURATION_UNVERIFIED/);
    assert.match(validateMediaForPlatform({ videoPath: unsupportedContainer }, "douyin")[0], /DOUYIN_DURATION_UNVERIFIED/);
    assert.deepEqual(validateMediaForPlatform({ videoPath: unsupportedContainer }, "bilibili"), []);
  });
});

test("YouTube package validates full metadata and an exact 16:9 custom thumbnail", async () => {
  await withTempDir(async root => {
    const thumbnailPath = path.join(root, "thumbnail-16x9.png");
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(thumbnailPath, pngHeader(1920, 1080));
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "YouTube upload test",
      youtubeDescription: "A complete YouTube description.",
      youtubeTags: [],
      youtubeAudience: "not_made_for_kids",
      youtubeVisibility: "public",
      youtubeCategory: "科学与技术",
      youtubeLanguage: "中文（简体）",
      youtubeAlteredContent: false,
      cover: {
        uploadCustomCover: true,
        horizontal16x9Path: thumbnailPath,
      },
    }));
    const pkg = readPackage(packagePath, { config: defaultConfig() });
    assert.deepEqual(validateYoutubePackage(pkg), []);
    assert.deepEqual(coverAssetsForPlatform(pkg, "youtube"), [
      { slot: "thumbnail", ratio: "16:9", path: thumbnailPath },
    ]);
    assert.equal(pkg.youtubeVisibility, "public");
    assert.equal(pkg.youtubeAudience, "not_made_for_kids");
    assert.deepEqual(pkg.youtubeTags, []);
  });
});

test("YouTube package fails closed on audience, visibility, limits, and thumbnail ratio", async () => {
  await withTempDir(async root => {
    const wrongThumbnailPath = path.join(root, "thumbnail-4x3.png");
    const packagePath = path.join(root, "package.json");
    await fs.promises.writeFile(wrongThumbnailPath, pngHeader(1440, 1080));
    await fs.promises.writeFile(packagePath, JSON.stringify({
      title: "T".repeat(101),
      youtubeDescription: "Read more at https://example.com/video",
      youtubeTags: [],
      youtubeAudience: "",
      youtubeVisibility: "scheduled",
      cover: {
        uploadCustomCover: true,
        horizontal16x9Path: wrongThumbnailPath,
      },
    }));
    const invalid = readPackage(packagePath, { config: defaultConfig() });
    const errors = validateYoutubePackage(invalid).join("; ");
    assert.match(errors, /youtube title is 101\/100/);
    assert.match(errors, /youtubeDescription must not contain web links/);
    assert.match(errors, /youtubeAudience must be one of/);
    assert.match(errors, /youtubeVisibility must be one of/);
    assert.match(errors, /expected 16:9, got 1440x1080/);
    invalid.youtubeDescription = "";
    assert.match(validateYoutubePackage(invalid).join("; "), /youtubeDescription is required/);
  });
});
