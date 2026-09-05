import path from "node:path";

export function uniqueSpaceSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const VALUE_FLAGS = new Set([
  "--package",
  "--task-suffix",
  "--job-id",
  "--state-root",
  "--check-concurrency",
  "--upload-concurrency",
  "--space-prefix",
  "--space-name",
  "--space-suffix",
  "--platform",
  "--platforms",
  "--cleanup-name",
  "--cleanup-prefix",
  "--operation",
]);

const OPERATIONS = new Set(["auto", "create", "resume", "inspect", "replace-cover", "repost"]);

export function parsePublisherArgs(argv, context) {
  const { loadConfig, PLATFORMS, UsageError, positive, defaultStateRoot } = context;
  const cleanupOnly = argv.includes("--cleanup-only");
  const config = loadConfig({ requireOnboarded: !cleanupOnly });
  const options = {
    inspectOnly: false,
    operation: "auto",
    confirmNewCopy: false,
    originalRightsConfirmed: false,
    originalityPolicy: config.declarations?.originalityPolicy,
    stateRoot: defaultStateRoot,
    jobId: "",
    checkConcurrency: config.execution?.checkConcurrency ?? 1,
    uploadConcurrency: config.execution?.uploadConcurrency ?? 1,
    freshSpace: true,
    forceFreshSpace: false,
    keepSpace: true,
    cleanupStaleSpaces: true,
    cleanupOnly: false,
    spacePrefix: "video publisher v2",
    spaceName: "",
    spaceSuffix: "",
    cleanupNames: ["oil-collect-publish"],
    cleanupPrefixes: [],
    packagePath: "",
    taskSuffix: "",
  };
  const positional = [];
  const platforms = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--inspect-only") { options.inspectOnly = true; options.operation = "inspect"; continue; }
    if (arg === "--replace-cover") { options.operation = "replace-cover"; continue; }
    if (arg === "--confirm-new-copy") { options.confirmNewCopy = true; continue; }
    if (arg === "--confirm-original-rights") { options.originalRightsConfirmed = true; continue; }
    if (arg === "--fresh-space") { options.freshSpace = true; continue; }
    if (arg === "--reuse-space" || arg === "--no-fresh-space") { options.freshSpace = false; options.forceFreshSpace = false; continue; }
    if (arg === "--force-fresh-space") { options.freshSpace = true; options.forceFreshSpace = true; continue; }
    if (arg === "--keep-space" || arg === "--no-close-on-complete") { options.keepSpace = true; continue; }
    if (arg === "--close-on-complete" || arg === "--close-space" || arg === "--no-keep-space") { options.keepSpace = false; continue; }
    if (arg === "--cleanup-only") { options.cleanupOnly = true; continue; }
    if (arg === "--cleanup-stale-spaces") { options.cleanupStaleSpaces = true; continue; }
    if (arg === "--no-cleanup-stale-spaces") { options.cleanupStaleSpaces = false; continue; }
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new UsageError(`${arg} requires a value`);
      index += 1;
      if (arg === "--package") options.packagePath = path.resolve(value);
      else if (arg === "--task-suffix") options.taskSuffix = value;
      else if (arg === "--job-id") options.jobId = value;
      else if (arg === "--state-root") options.stateRoot = path.resolve(value);
      else if (arg === "--space-prefix") options.spacePrefix = value;
      else if (arg === "--space-name") options.spaceName = value.trim();
      else if (arg === "--space-suffix") options.spaceSuffix = value.trim();
      else if (arg === "--check-concurrency") options.checkConcurrency = positive(value, arg);
      else if (arg === "--upload-concurrency") options.uploadConcurrency = positive(value, arg);
      else if (arg === "--operation") options.operation = value.trim();
      else if (arg === "--platform" || arg === "--platforms") {
        platforms.push(...value.split(",").map(item => item.trim()).filter(Boolean));
      } else if (arg === "--cleanup-name") {
        options.cleanupNames.push(...value.split(",").map(item => item.trim()).filter(Boolean));
      } else if (arg === "--cleanup-prefix") {
        options.cleanupPrefixes.push(...value.split(",").map(item => item.trim()).filter(Boolean));
      }
      continue;
    }
    if (arg.startsWith("--")) throw new UsageError(`Unknown option: ${arg}`);
    positional.push(arg);
  }
  if (!options.packagePath && positional.length && !cleanupOnly) {
    options.packagePath = path.resolve(positional.shift());
  }
  if (!options.packagePath && positional.length && cleanupOnly && positional[0].endsWith(".json")) {
    options.packagePath = path.resolve(positional.shift());
  }
  if (!options.packagePath && !cleanupOnly) {
    throw new UsageError("Usage: run-safe-platforms.sh <package.json> [task-suffix] [platform...] [--package|--platform|--task-suffix|--job-id|--fresh-space|--reuse-space|--close-on-complete|--cleanup-only]");
  }
  if (!options.taskSuffix && positional.length && !PLATFORMS.includes(positional[0])) {
    options.taskSuffix = positional.shift();
  }
  if (!options.taskSuffix) options.taskSuffix = "manual";
  const selected = [...new Set(platforms.length ? platforms : positional.length ? positional : (cleanupOnly ? [] : config.defaultPlatforms))];
  if (selected.some(platform => !PLATFORMS.includes(platform))) throw new UsageError("Unsupported platform argument");
  if (!cleanupOnly) {
    const unavailablePlatforms = selected.filter(platform => !(config.availablePlatforms || []).includes(platform));
    if (unavailablePlatforms.length) {
      throw new UsageError(`Platform is not configured as available: ${unavailablePlatforms.join(", ")}. Update Video Publisher onboarding before browser work.`);
    }
  }
  if (options.jobId && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.jobId)) {
    throw new UsageError("--job-id must be 1-128 characters using only letters, numbers, dot, underscore, or hyphen, and must start with a letter or number");
  }
  if (options.spaceName && selected.length > 1) {
    throw new UsageError("--space-name can only be used with a single platform; for several platforms use --space-prefix");
  }
  if (!OPERATIONS.has(options.operation)) {
    throw new UsageError(`--operation must be one of: ${[...OPERATIONS].join(", ")}`);
  }
  if (options.operation === "inspect") options.inspectOnly = true;
  if (options.operation === "replace-cover" && !options.jobId) {
    throw new UsageError("--operation replace-cover requires --job-id for the existing READY draft");
  }
  if (options.operation === "repost" && !options.confirmNewCopy) {
    throw new UsageError("--operation repost requires --confirm-new-copy");
  }
  options.cleanupNames = [...new Set(options.cleanupNames.filter(Boolean))];
  options.cleanupPrefixes = [...new Set(options.cleanupPrefixes.filter(Boolean))];
  return { ...options, platforms: selected };
}
