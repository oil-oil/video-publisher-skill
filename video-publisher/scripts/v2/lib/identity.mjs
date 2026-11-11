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

async function resolveVideoIdentity(videoPath, cachedVideo = null) {
  const stat = await fs.promises.stat(videoPath);
  if (cachedVideo
    && path.resolve(String(cachedVideo.path || "")) === videoPath
    && Number(cachedVideo.size) === stat.size
    && /^[0-9a-f]{64}$/.test(String(cachedVideo.sha256 || ""))) {
    return { path: videoPath, size: stat.size, sha256: String(cachedVideo.sha256) };
  }
  try {
    const stem = path.basename(videoPath, path.extname(videoPath));
    const dir = path.dirname(videoPath);
    const sidecarCandidates = [
      path.join(dir, `${stem}.video-fingerprint.json`),
      path.join(dir, `${stem}.auto-publish.json`),
    ];
    for (const sidecarPath of sidecarCandidates) {
      if (!fs.existsSync(sidecarPath)) continue;
      const statBig = await fs.promises.stat(videoPath, { bigint: true });
      const sidecar = JSON.parse(await fs.promises.readFile(sidecarPath, "utf8"));
      const fp = sidecar?.sourceFingerprint || sidecar;
      if (fp
        && path.resolve(String(fp.path || "")) === videoPath
        && Number(fp.size) === stat.size
        && String(fp.mtimeNs || "") === String(statBig.mtimeNs)
        && /^[0-9a-f]{64}$/.test(String(fp.sha256 || ""))) {
        return { path: videoPath, size: stat.size, sha256: String(fp.sha256) };
      }
    }
  } catch {
    // Fall back to full file hashing on any sidecar read/parse mismatch.
  }
  return { path: videoPath, size: stat.size, sha256: await hashFile(videoPath) };
}

export async function buildIdentity(pkg, options = {}) {
  const allowMissingCoverAssets = options.allowMissingCoverAssets === true;
  const videoPath = path.resolve(pkg.videoPath);
  const platformCovers = pkg.cover?.platforms || {};
  const paths = [...new Set([
    pkg.cover?.vertical3x4Path,
    pkg.cover?.horizontal4x3Path,
    pkg.cover?.horizontal16x9Path,
    ...Object.values(platformCovers).flatMap(value => [value?.vertical3x4Path, value?.horizontal4x3Path, value?.horizontal16x9Path]),
  ].filter(Boolean).map(value => path.resolve(value)))];
  const video = await resolveVideoIdentity(videoPath, options.cachedVideo || null);
  const assets = [];
  const missingCoverPaths = [];
  for (const assetPath of paths) {
    if (allowMissingCoverAssets && !fs.existsSync(assetPath)) {
      missingCoverPaths.push(assetPath);
      continue;
    }
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
  return { fingerprint, previousFingerprint, legacyFingerprint, contentFingerprint, coverFingerprint, coverFingerprints, video, assets, missingCoverPaths, cover };
}
