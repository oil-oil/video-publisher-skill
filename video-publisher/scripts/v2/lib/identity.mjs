import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
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
  const paths = [
    pkg.cover?.vertical3x4Path,
    pkg.cover?.horizontal4x3Path,
  ].filter(Boolean).map(value => path.resolve(value));
  const video = { path: videoPath, size: (await fs.promises.stat(videoPath)).size, sha256: await hashFile(videoPath) };
  const assets = [];
  for (const assetPath of paths) {
    const stat = await fs.promises.stat(assetPath);
    assets.push({ path: assetPath, size: stat.size, sha256: await hashFile(assetPath) });
  }
  const fingerprint = crypto.createHash("sha256").update(canonical({ package: pkg, video, assets })).digest("hex");
  return { fingerprint, video, assets };
}
