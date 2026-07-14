#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./lib/config.mjs";

const config = loadConfig();
const DEFAULT_SOURCE_DIR = process.env.VIDEO_PUBLISHER_SOURCE_DIR
  || config.sourceDirectory
  || path.join(os.homedir(), "Movies");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv"]);

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-\s]+/g, " ")
    .trim();
}

function tokens(value) {
  return normalizeName(value)
    .split(/\s+/)
    .filter(Boolean);
}

function cjkSegments(value) {
  // Extract CJK character runs (also covers common CJK punctuation neighbors).
  // latinCompact drops all CJK, so CJK overlap must be scored separately.
  return String(value || "")
    .replace(/[^\u4e00-\u9fff\u3400-\u4dbf]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function latinCompact(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/subtitled|subtitle|final|tmp|hvc1|2k/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function longestCommonSubstringLength(a, b) {
  const left = latinCompact(a);
  const right = latinCompact(b);
  if (!left || !right) return 0;
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  let best = 0;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > best) best = dp[i][j];
      }
    }
  }
  return best;
}

function sharedCjkScore(wantedValue, candidateValue) {
  // Score overlap of CJK character runs between the query and a candidate.
  // Counts each shared CJK character; rewards candidates that contain the
  // whole wanted CJK run as a contiguous substring.
  const wanted = cjkSegments(wantedValue).join("");
  const candidate = cjkSegments(candidateValue).join("");
  if (!wanted || !candidate) return 0;
  const wantedChars = new Set(wanted);
  let shared = 0;
  for (const ch of candidate) {
    if (wantedChars.has(ch)) shared += 1;
  }
  let bonus = 0;
  if (candidate.includes(wanted)) bonus += wanted.length * 3;
  return shared + bonus;
}

function scoreCandidate(wantedBase, candidateBase) {
  const wantedTokens = tokens(wantedBase);
  const candidate = normalizeName(candidateBase);
  const wantedLatin = latinCompact(wantedBase);
  const candidateLatin = latinCompact(candidateBase);
  let score = 0;
  for (const token of wantedTokens) {
    if (candidate.includes(token)) score += token.length;
  }
  const commonLatin = longestCommonSubstringLength(wantedBase, candidateBase);
  if (commonLatin >= 5) score += commonLatin * 4;
  if (wantedLatin && candidateLatin && (wantedLatin.includes(candidateLatin) || candidateLatin.includes(wantedLatin))) {
    score += 30;
  }
  // CJK overlap: previously dropped entirely by latinCompact.
  score += sharedCjkScore(wantedBase, candidateBase);
  if (candidate.includes("subtitled")) score += 5;
  if (candidate.includes("subtitle")) score += 3;
  if (candidate.includes(normalizeName(wantedBase))) score += 50;
  return score;
}

function nearbyMatches(inputPath, sourceDir) {
  if (!fs.existsSync(sourceDir)) return [];
  const wantedBase = path.basename(inputPath);
  return fs.readdirSync(sourceDir)
    .filter((name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .map((name) => {
      const fullPath = path.join(sourceDir, name);
      return {
        path: fullPath,
        name,
        score: scoreCandidate(wantedBase, name)
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 12);
}

function main() {
  const inputPath = process.argv[2];
  const sourceDir = process.argv[3] || DEFAULT_SOURCE_DIR;
  if (!inputPath) {
    throw new Error("Usage: find-video.mjs <absolute-video-path> [source-dir]");
  }
  const absolute = path.resolve(inputPath);
  const exists = fs.existsSync(absolute);
  const stat = exists ? fs.statSync(absolute) : null;
  const ok = Boolean(exists && stat.isFile());
  printJson({
    ok,
    requestedPath: absolute,
    exists,
    isFile: stat ? stat.isFile() : false,
    sizeBytes: stat ? stat.size : null,
    sourceDir,
    matches: ok ? [] : nearbyMatches(absolute, sourceDir)
  });
  if (!ok) process.exit(1);
}

try {
  main();
} catch (error) {
  printJson({ ok: false, error: error.message });
  process.exit(1);
}
