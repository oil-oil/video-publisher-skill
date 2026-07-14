import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  configStatus,
  createOnboardedConfig,
  writeConfig,
} from "../lib/config.mjs";

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "config.mjs");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

test("missing or empty configuration requires onboarding", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-config-empty-"));
  const configPath = path.join(root, "config.json");
  assert.equal(configStatus(configPath).onboardingRequired, true);
  await fs.promises.writeFile(configPath, "{}\n");
  const empty = configStatus(configPath);
  assert.equal(empty.empty, true);
  assert.equal(empty.onboardingRequired, true);
  assert.equal(empty.config.declarations.originalityPolicy, "ask_each_run");
  await fs.promises.rm(root, { recursive: true, force: true });
});

test("completed onboarding writes a valid private per-user configuration", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-config-ready-"));
  const configPath = path.join(root, "nested", "config.json");
  const config = createOnboardedConfig({
    locale: "zh-CN",
    sourceDirectory: root,
    defaultPlatforms: ["douyin", "bilibili"],
    contentProfile: { recurringTags: ["Tutorial"] },
    declarations: { originalityPolicy: "all_videos_original" },
    platforms: {
      douyin: { defaultTopics: ["Tutorial"] },
      bilibili: { allowedAutoTags: [] },
    },
  });
  writeConfig(config, configPath);
  const ready = configStatus(configPath);
  assert.equal(ready.onboardingRequired, false);
  assert.deepEqual(ready.config.defaultPlatforms, ["douyin", "bilibili"]);
  assert.deepEqual(ready.config.platforms.douyin.defaultTopics, ["Tutorial"]);
  assert.equal(ready.config.declarations.originalityPolicy, "all_videos_original");
  assert.equal(fs.statSync(configPath).mode & 0o777, 0o600);
  await fs.promises.rm(root, { recursive: true, force: true });
});

test("onboarding CLI persists repeated platform and topic options", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-config-cli-"));
  const configPath = path.join(root, "profile", "config.json");
  const result = await run(process.execPath, [
    SCRIPT_PATH,
    "onboard",
    "--source-dir", root,
    "--platform", "douyin",
    "--platform", "bilibili",
    "--recurring-tag", "Tutorial",
    "--douyin-topic", "Tutorial",
    "--bilibili-auto-tag", "Platform tag",
    "--originality-policy", "all_videos_original",
  ], { env: { ...process.env, VIDEO_PUBLISHER_CONFIG: configPath } });
  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.onboardingRequired, false);
  assert.deepEqual(output.config.defaultPlatforms, ["douyin", "bilibili"]);
  assert.deepEqual(output.config.platforms.douyin.defaultTopics, ["Tutorial"]);
  assert.deepEqual(output.config.platforms.bilibili.allowedAutoTags, ["Platform tag"]);
  assert.equal(output.config.declarations.originalityPolicy, "all_videos_original");
  await fs.promises.rm(root, { recursive: true, force: true });
});
