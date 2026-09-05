import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash("sha256").update(canonical(value)).digest("hex");
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export async function buildIdentity(pkg) {
  const videoPath = path.resolve(pkg.videoPath);
  const platformCovers = pkg.cover?.platforms || {};
  const paths = [...new Set([
    pkg.cover?.vertical3x4Path,
    pkg.cover?.horizontal4x3Path,
    pkg.cover?.horizontal16x9Path,
    ...Object.values(platformCovers).flatMap(value => [value?.vertical3x4Path, value?.horizontal4x3Path, value?.horizontal16x9Path]),
  ].filter(Boolean).map(value => path.resolve(value)))];
  const video = { path: videoPath, size: (await fs.promises.stat(videoPath)).size, sha256: await hashFile(videoPath) };
  const assets = [];
  for (const assetPath of paths) {
    const stat = await fs.promises.stat(assetPath);
    assets.push({ path: assetPath, size: stat.size, sha256: await hashFile(assetPath) });
  }
  const cover = {
    uploadCustomCover: pkg.cover?.uploadCustomCover === true,
    vertical3x4Path: String(pkg.cover?.vertical3x4Path || "").trim(),
    horizontal4x3Path: String(pkg.cover?.horizontal4x3Path || "").trim(),
    horizontal16x9Path: String(pkg.cover?.horizontal16x9Path || "").trim(),
    platforms: platformCovers,
  };
  const assetByPath = new Map(assets.map(asset => [asset.path, asset]));
  const platformAsset = (platform, key) => {
    const value = cover.platforms?.[platform]?.[key] || cover[key];
    return value ? assetByPath.get(path.resolve(value)) || null : null;
  };
  const coverFingerprints = {
    xiaohongshu: digest({ enabled: cover.uploadCustomCover, vertical: platformAsset("xiaohongshu", "vertical3x4Path") }),
    douyin: digest({ enabled: cover.uploadCustomCover, vertical: platformAsset("douyin", "vertical3x4Path"), horizontal: platformAsset("douyin", "horizontal4x3Path") }),
    bilibili: digest({ enabled: cover.uploadCustomCover, horizontal: platformAsset("bilibili", "horizontal4x3Path") }),
    wechat_channels: digest({ enabled: cover.uploadCustomCover, vertical: platformAsset("wechat_channels", "vertical3x4Path"), horizontal: platformAsset("wechat_channels", "horizontal4x3Path") }),
    youtube: digest({ enabled: cover.uploadCustomCover, horizontal: platformAsset("youtube", "horizontal16x9Path") }),
  };
  const { cover: _cover, ...contentPackage } = pkg;
  const contentFingerprint = digest({ package: contentPackage, video });
  const coverFingerprint = digest({ cover, assets });
  const legacyPackage = {
    ...pkg,
    cover: {
      uploadCustomCover: cover.uploadCustomCover,
      vertical3x4Path: cover.vertical3x4Path,
      horizontal4x3Path: cover.horizontal4x3Path,
      horizontal16x9Path: cover.horizontal16x9Path,
    },
  };
  const legacyAssets = [cover.vertical3x4Path, cover.horizontal4x3Path]
    .filter(Boolean)
    .map(value => assetByPath.get(path.resolve(value)))
    .filter(Boolean);
  const sharedAssets = [...new Set([cover.vertical3x4Path, cover.horizontal4x3Path, cover.horizontal16x9Path].filter(Boolean).map(value => path.resolve(value)))]
    .map(value => assetByPath.get(value))
    .filter(Boolean);
  const legacyFingerprint = digest({ package: legacyPackage, video, assets: legacyAssets });
  const previousFingerprint = digest({ package: legacyPackage, video, assets: sharedAssets });
  const fingerprint = digest({ package: pkg, video, assets });
  return { fingerprint, previousFingerprint, legacyFingerprint, contentFingerprint, coverFingerprint, coverFingerprints, video, assets, cover };
}
