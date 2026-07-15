import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_SCHEMA_VERSION = 2;
const LEGACY_CONFIG_SCHEMA_VERSION = 1;
export const CONFIG_PLATFORMS = ["xiaohongshu", "douyin", "bilibili", "wechat_channels"];
export const ORIGINALITY_POLICIES = ["ask_each_run", "all_videos_original"];

function cleanList(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const item = String(value || "").trim().replace(/^#+\s*/, "").trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

export function resolveConfigPath() {
  if (process.env.VIDEO_PUBLISHER_CONFIG) return path.resolve(process.env.VIDEO_PUBLISHER_CONFIG);
  const configHome = process.env.XDG_CONFIG_HOME
    ? path.resolve(process.env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), ".config");
  return path.join(configHome, "video-publisher", "config.json");
}

export function defaultConfig() {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    onboarding: {
      completed: false,
      completedAt: "",
      updatedAt: "",
    },
    locale: "zh-CN",
    sourceDirectory: path.join(os.homedir(), "Movies"),
    availablePlatforms: [],
    defaultPlatforms: [],
    contentProfile: {
      copyStyle: "clear, conversational, specific, non-hype",
      recurringTags: [],
    },
    declarations: {
      originalityPolicy: "ask_each_run",
    },
    platforms: {
      douyin: { defaultTopics: [] },
      bilibili: { allowedAutoTags: [] },
    },
    execution: {
      checkConcurrency: 4,
      uploadConcurrency: 4,
    },
    cover: {
      uploadExistingByDefault: false,
    },
  };
}

export function normalizeConfig(raw = {}) {
  const fallback = defaultConfig();
  const rawSchemaVersion = Number(raw.schemaVersion ?? fallback.schemaVersion);
  const defaultPlatforms = Array.isArray(raw.defaultPlatforms)
    ? cleanList(raw.defaultPlatforms)
    : fallback.defaultPlatforms;
  const availablePlatforms = Array.isArray(raw.availablePlatforms)
    ? cleanList(raw.availablePlatforms)
    : rawSchemaVersion === LEGACY_CONFIG_SCHEMA_VERSION && Array.isArray(raw.defaultPlatforms)
      ? [...defaultPlatforms]
      : Object.keys(raw).length === 0
        ? fallback.availablePlatforms
        : [];
  return {
    schemaVersion: rawSchemaVersion === LEGACY_CONFIG_SCHEMA_VERSION
      ? CONFIG_SCHEMA_VERSION
      : rawSchemaVersion,
    onboarding: {
      completed: raw.onboarding?.completed === true,
      completedAt: String(raw.onboarding?.completedAt || ""),
      updatedAt: String(raw.onboarding?.updatedAt || ""),
    },
    locale: String(raw.locale || fallback.locale).trim(),
    sourceDirectory: String(raw.sourceDirectory || fallback.sourceDirectory).trim(),
    availablePlatforms,
    defaultPlatforms,
    contentProfile: {
      copyStyle: String(raw.contentProfile?.copyStyle || fallback.contentProfile.copyStyle).trim(),
      recurringTags: cleanList(raw.contentProfile?.recurringTags || []),
    },
    declarations: {
      originalityPolicy: String(raw.declarations?.originalityPolicy || fallback.declarations.originalityPolicy).trim(),
    },
    platforms: {
      douyin: {
        defaultTopics: cleanList(raw.platforms?.douyin?.defaultTopics || []),
      },
      bilibili: {
        allowedAutoTags: cleanList(raw.platforms?.bilibili?.allowedAutoTags || []),
      },
    },
    execution: {
      checkConcurrency: Number(raw.execution?.checkConcurrency ?? fallback.execution.checkConcurrency),
      uploadConcurrency: Number(raw.execution?.uploadConcurrency ?? fallback.execution.uploadConcurrency),
    },
    cover: {
      uploadExistingByDefault: raw.cover?.uploadExistingByDefault === true,
    },
  };
}

export function validateConfig(config) {
  const errors = [];
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${CONFIG_SCHEMA_VERSION}`);
  }
  if (!config.locale) errors.push("locale is required");
  if (!path.isAbsolute(config.sourceDirectory)) errors.push("sourceDirectory must be an absolute path");
  if (!config.availablePlatforms.length) errors.push("availablePlatforms must not be empty");
  const unsupportedAvailable = config.availablePlatforms.filter(platform => !CONFIG_PLATFORMS.includes(platform));
  if (unsupportedAvailable.length) errors.push(`unsupported availablePlatforms: ${unsupportedAvailable.join(", ")}`);
  if (!config.defaultPlatforms.length) errors.push("defaultPlatforms must not be empty");
  const unsupported = config.defaultPlatforms.filter(platform => !CONFIG_PLATFORMS.includes(platform));
  if (unsupported.length) errors.push(`unsupported defaultPlatforms: ${unsupported.join(", ")}`);
  const unavailableDefaults = config.defaultPlatforms.filter(platform => !config.availablePlatforms.includes(platform));
  if (unavailableDefaults.length) {
    errors.push(`defaultPlatforms must be a subset of availablePlatforms: ${unavailableDefaults.join(", ")}`);
  }
  if (config.platforms.douyin.defaultTopics.length > 5) {
    errors.push("platforms.douyin.defaultTopics supports at most 5 topics");
  }
  if (!ORIGINALITY_POLICIES.includes(config.declarations.originalityPolicy)) {
    errors.push(`declarations.originalityPolicy must be one of: ${ORIGINALITY_POLICIES.join(", ")}`);
  }
  for (const key of ["checkConcurrency", "uploadConcurrency"]) {
    const value = config.execution[key];
    if (!Number.isInteger(value) || value < 1) errors.push(`execution.${key} must be a positive integer`);
  }
  return errors;
}

export function configStatus(configPath = resolveConfigPath()) {
  const absolutePath = path.resolve(configPath);
  const exists = fs.existsSync(absolutePath);
  let raw = {};
  let parseError = "";
  if (exists) {
    try {
      const text = fs.readFileSync(absolutePath, "utf8");
      raw = text.trim() ? JSON.parse(text) : {};
    } catch (error) {
      parseError = String(error?.message || error);
    }
  }
  const empty = !raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length === 0;
  const config = normalizeConfig(empty ? {} : raw);
  const errors = [...(parseError ? [`invalid JSON: ${parseError}`] : []), ...validateConfig(config)];
  const warnings = [];
  if (path.isAbsolute(config.sourceDirectory)) {
    if (!fs.existsSync(config.sourceDirectory)) warnings.push(`sourceDirectory does not exist: ${config.sourceDirectory}`);
    else if (!fs.statSync(config.sourceDirectory).isDirectory()) warnings.push(`sourceDirectory is not a directory: ${config.sourceDirectory}`);
  }
  return {
    path: absolutePath,
    exists,
    empty,
    onboardingRequired: !exists || empty || config.onboarding.completed !== true || errors.length > 0,
    errors,
    warnings,
    config,
  };
}

export function loadConfig({ configPath = resolveConfigPath(), requireOnboarded = false } = {}) {
  const status = configStatus(configPath);
  if (requireOnboarded && status.onboardingRequired) {
    const detail = status.errors.length ? ` ${status.errors.join("; ")}` : "";
    throw new Error(`Video Publisher onboarding is incomplete. Run: node scripts/config.mjs status.${detail}`);
  }
  return status.config;
}

export function createOnboardedConfig(input = {}) {
  const now = new Date().toISOString();
  const config = normalizeConfig({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    onboarding: {
      completed: true,
      completedAt: input.completedAt || now,
      updatedAt: now,
    },
    locale: input.locale,
    sourceDirectory: input.sourceDirectory,
    availablePlatforms: input.availablePlatforms,
    defaultPlatforms: input.defaultPlatforms,
    contentProfile: input.contentProfile,
    declarations: input.declarations,
    platforms: input.platforms,
    execution: input.execution,
    cover: input.cover,
  });
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join("; "));
  return config;
}

export function writeConfig(config, configPath = resolveConfigPath()) {
  const normalized = normalizeConfig(config);
  const errors = validateConfig(normalized);
  if (normalized.onboarding.completed !== true) errors.push("onboarding.completed must be true");
  if (errors.length) throw new Error(errors.join("; "));
  const absolutePath = path.resolve(configPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, absolutePath);
  fs.chmodSync(absolutePath, 0o600);
  return absolutePath;
}
