import fs from "node:fs";
import path from "node:path";

export const DOUYIN_MAX_DURATION_SECONDS = 15 * 60;
export const DOUYIN_DURATION_CONTAINER_TOLERANCE_SECONDS = 0.1;

const ISO_BMFF_EXTENSIONS = new Set([".mp4", ".m4v", ".mov"]);

function readAt(fileDescriptor, length, position) {
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(fileDescriptor, buffer, 0, length, position);
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
}

function uint64(buffer, offset) {
  const value = buffer.readBigUInt64BE(offset);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function readBoxHeader(fileDescriptor, offset, parentEnd) {
  if (offset + 8 > parentEnd) return null;
  const header = readAt(fileDescriptor, 16, offset);
  if (header.length < 8) return null;
  const size32 = header.readUInt32BE(0);
  const type = header.toString("ascii", 4, 8);
  let headerSize = 8;
  let size = size32;
  if (size32 === 1) {
    if (header.length < 16) return null;
    size = uint64(header, 8);
    headerSize = 16;
  } else if (size32 === 0) {
    size = parentEnd - offset;
  }
  if (!Number.isSafeInteger(size) || size < headerSize || offset + size > parentEnd) return null;
  return { type, offset, size, headerSize, dataOffset: offset + headerSize, end: offset + size };
}

function findBox(fileDescriptor, start, end, wantedType) {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBoxHeader(fileDescriptor, offset, end);
    if (!box) return null;
    if (box.type === wantedType) return box;
    offset = box.end;
  }
  return null;
}

export function readIsoBmffDuration(filePath) {
  const fileDescriptor = fs.openSync(filePath, "r");
  try {
    const fileSize = fs.fstatSync(fileDescriptor).size;
    const movie = findBox(fileDescriptor, 0, fileSize, "moov");
    if (!movie) return null;
    const header = findBox(fileDescriptor, movie.dataOffset, movie.end, "mvhd");
    if (!header) return null;
    const payload = readAt(fileDescriptor, Math.min(40, header.end - header.dataOffset), header.dataOffset);
    if (payload.length < 20) return null;
    const version = payload[0];
    let timescale;
    let duration;
    if (version === 0) {
      timescale = payload.readUInt32BE(12);
      duration = payload.readUInt32BE(16);
    } else if (version === 1 && payload.length >= 32) {
      timescale = payload.readUInt32BE(20);
      duration = uint64(payload, 24);
    } else {
      return null;
    }
    if (!timescale || duration === null || duration === 0xffffffff) return null;
    return duration / timescale;
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

export function inspectMediaFile(filePath) {
  const resolvedPath = filePath ? path.resolve(filePath) : "";
  const result = {
    path: resolvedPath,
    exists: false,
    sizeBytes: null,
    durationSeconds: null,
    durationSource: null,
    probeError: null,
  };
  if (!resolvedPath || !fs.existsSync(resolvedPath)) return result;
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) return result;
  result.exists = true;
  result.sizeBytes = stat.size;
  if (!ISO_BMFF_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) return result;
  try {
    result.durationSeconds = readIsoBmffDuration(resolvedPath);
    if (result.durationSeconds !== null) result.durationSource = "iso-bmff-mvhd";
  } catch (error) {
    result.probeError = String(error?.message || error);
  }
  return result;
}

export function validateMediaForPlatform(pkg, platform, media = inspectMediaFile(pkg.videoPath)) {
  const errors = [];
  if (!pkg.videoPath) {
    errors.push("videoPath is required");
    return errors;
  }
  if (!media.exists) {
    errors.push(`video file not found: ${media.path || pkg.videoPath}`);
    return errors;
  }
  if (platform === "douyin"
    && media.durationSeconds !== null
    && media.durationSeconds > DOUYIN_MAX_DURATION_SECONDS + DOUYIN_DURATION_CONTAINER_TOLERANCE_SECONDS) {
    errors.push(
      `DOUYIN_DURATION_LIMIT: video duration is ${media.durationSeconds.toFixed(3)}s; `
      + `the real-tested content maximum is ${DOUYIN_MAX_DURATION_SECONDS}s (15:00), `
      + `with ${DOUYIN_DURATION_CONTAINER_TOLERANCE_SECONDS.toFixed(3)}s allowed for container rounding. `
      + "Edit or export a shorter source before browser upload.",
    );
  }
  return errors;
}
