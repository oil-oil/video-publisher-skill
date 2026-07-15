#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_PLATFORMS,
  ORIGINALITY_POLICIES,
  configStatus,
  createOnboardedConfig,
  resolveConfigPath,
  writeConfig,
} from "./lib/config.mjs";

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function usage() {
  return [
    "Usage:",
    "  node scripts/config.mjs status",
    "  node scripts/config.mjs validate",
    "  node scripts/config.mjs onboard --source-dir <path> [options]",
    "",
    "Repeatable options:",
    "  --available-platform <xiaohongshu|douyin|bilibili|wechat_channels>",
    "  --platform <xiaohongshu|douyin|bilibili|wechat_channels>  Default platform; must be available",
    "  --recurring-tag <tag>",
    "  --douyin-topic <topic>",
    "  --bilibili-auto-tag <tag>",
    "",
    "Other options:",
    "  --locale <locale>",
    "  --copy-style <text>",
    "  --originality-policy <ask_each_run|all_videos_original>",
    "  --check-concurrency <integer>",
    "  --upload-concurrency <integer>",
    "  --upload-existing-cover-by-default",
  ].join("\n");
}

function parseOptions(argv) {
  const repeatable = new Set(["--available-platform", "--platform", "--recurring-tag", "--douyin-topic", "--bilibili-auto-tag"]);
  const single = new Set(["--source-dir", "--locale", "--copy-style", "--originality-policy", "--check-concurrency", "--upload-concurrency"]);
  const boolean = new Set(["--upload-existing-cover-by-default"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (boolean.has(flag)) {
      result[flag] = true;
      continue;
    }
    if (!repeatable.has(flag) && !single.has(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value`);
    if (repeatable.has(flag)) (result[flag] ||= []).push(value);
    else result[flag] = value;
  }
  return result;
}

function positive(value, fallback, name) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

const [command = "status", ...argv] = process.argv.slice(2);
const configPath = resolveConfigPath();

try {
  if (command === "status" || command === "show") {
    print(configStatus(configPath));
  } else if (command === "validate") {
    const status = configStatus(configPath);
    print(status);
    if (status.onboardingRequired || status.warnings.length) process.exitCode = 1;
  } else if (command === "onboard") {
    const options = parseOptions(argv);
    const sourceDirectory = path.resolve(String(options["--source-dir"] || ""));
    if (!options["--source-dir"]) throw new Error("--source-dir is required");
    if (!fs.existsSync(sourceDirectory) || !fs.statSync(sourceDirectory).isDirectory()) {
      throw new Error(`source directory does not exist: ${sourceDirectory}`);
    }
    const requestedAvailablePlatforms = options["--available-platform"];
    const requestedDefaultPlatforms = options["--platform"];
    if (!requestedAvailablePlatforms?.length && !requestedDefaultPlatforms?.length) {
      throw new Error("select at least one platform with --available-platform");
    }
    const availablePlatforms = requestedAvailablePlatforms || requestedDefaultPlatforms;
    const defaultPlatforms = requestedDefaultPlatforms || [...availablePlatforms];
    const unsupportedAvailable = availablePlatforms.filter(platform => !CONFIG_PLATFORMS.includes(platform));
    if (unsupportedAvailable.length) throw new Error(`unsupported available platform: ${unsupportedAvailable.join(", ")}`);
    const unsupportedDefault = defaultPlatforms.filter(platform => !CONFIG_PLATFORMS.includes(platform));
    if (unsupportedDefault.length) throw new Error(`unsupported default platform: ${unsupportedDefault.join(", ")}`);
    const unavailableDefaults = defaultPlatforms.filter(platform => !availablePlatforms.includes(platform));
    if (unavailableDefaults.length) {
      throw new Error(`default platform is not configured as available: ${unavailableDefaults.join(", ")}`);
    }
    const originalityPolicy = options["--originality-policy"] || "ask_each_run";
    if (!ORIGINALITY_POLICIES.includes(originalityPolicy)) {
      throw new Error(`--originality-policy must be one of: ${ORIGINALITY_POLICIES.join(", ")}`);
    }
    const config = createOnboardedConfig({
      locale: options["--locale"] || "zh-CN",
      sourceDirectory,
      availablePlatforms,
      defaultPlatforms,
      contentProfile: {
        copyStyle: options["--copy-style"] || "clear, conversational, specific, non-hype",
        recurringTags: options["--recurring-tag"] || [],
      },
      declarations: { originalityPolicy },
      platforms: {
        douyin: { defaultTopics: options["--douyin-topic"] || [] },
        bilibili: { allowedAutoTags: options["--bilibili-auto-tag"] || [] },
      },
      execution: {
        checkConcurrency: positive(options["--check-concurrency"], 4, "--check-concurrency"),
        uploadConcurrency: positive(options["--upload-concurrency"], 4, "--upload-concurrency"),
      },
      cover: {
        uploadExistingByDefault: options["--upload-existing-cover-by-default"] === true,
      },
    });
    writeConfig(config, configPath);
    print(configStatus(configPath));
  } else {
    console.error(usage());
    process.exitCode = 2;
  }
} catch (error) {
  print({ ok: false, path: configPath, error: String(error?.message || error) });
  process.exitCode = 1;
}
