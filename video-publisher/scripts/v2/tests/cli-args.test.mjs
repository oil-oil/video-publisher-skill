import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parsePublisherArgs } from "../lib/cli-args.mjs";

class UsageError extends Error {}

function parse(argv, extras = {}) {
  return parsePublisherArgs(argv, {
    loadConfig: () => ({
      declarations: { originalityPolicy: "all_videos_original" },
      execution: { checkConcurrency: 2, uploadConcurrency: 2 },
      defaultPlatforms: ["douyin"],
      availablePlatforms: ["xiaohongshu", "douyin", "bilibili", "wechat_channels", "youtube"],
    }),
    PLATFORMS: ["xiaohongshu", "douyin", "bilibili", "wechat_channels", "youtube"],
    UsageError,
    positive: (raw) => Number(raw),
    defaultStateRoot: "/tmp/v2-jobs",
    ...extras,
  });
}

test("named flags select package and platforms", () => {
  const args = parse([
    "--package", "/tmp/pkg.json",
    "--platforms", "xiaohongshu,douyin",
    "--task-suffix", "demo",
    "--keep-space",
  ]);
  assert.equal(args.packagePath, path.resolve("/tmp/pkg.json"));
  assert.deepEqual(args.platforms, ["xiaohongshu", "douyin"]);
  assert.equal(args.taskSuffix, "demo");
  assert.equal(args.keepSpace, true);
  assert.equal(args.freshSpace, true);
});

test("draft spaces stay open unless close-on-complete", () => {
  assert.equal(parse(["--package", "/tmp/pkg.json"]).keepSpace, true);
  assert.equal(parse(["--package", "/tmp/pkg.json", "--close-on-complete"]).keepSpace, false);
  assert.equal(parse(["--package", "/tmp/pkg.json", "--no-keep-space"]).keepSpace, false);
});

test("positional arguments still work", () => {
  const args = parse(["/tmp/pkg.json", "suffix", "bilibili"]);
  assert.equal(args.packagePath, path.resolve("/tmp/pkg.json"));
  assert.equal(args.taskSuffix, "suffix");
  assert.deepEqual(args.platforms, ["bilibili"]);
});

test("reuse and force-fresh flags are distinct", () => {
  const reuse = parse(["--package", "/tmp/pkg.json", "--reuse-space"]);
  assert.equal(reuse.freshSpace, false);
  assert.equal(reuse.forceFreshSpace, false);
  const forced = parse(["--package", "/tmp/pkg.json", "--force-fresh-space"]);
  assert.equal(forced.freshSpace, true);
  assert.equal(forced.forceFreshSpace, true);
});

test("cleanup-only can run without a package", () => {
  const args = parse(["--cleanup-only", "--state-root", "/tmp/jobs", "--cleanup-name", "leftover"]);
  assert.equal(args.cleanupOnly, true);
  assert.equal(args.packagePath, "");
  assert.deepEqual(args.platforms, []);
  assert.ok(args.cleanupNames.includes("oil-collect-publish"));
  assert.ok(args.cleanupNames.includes("leftover"));
});

test("named space and cleanup prefixes are accepted", () => {
  const args = parse([
    "--package", "/tmp/pkg.json",
    "--platform", "bilibili",
    "--space-name", "draft-bilibili",
    "--space-suffix", "fixed",
    "--cleanup-prefix", "oil-collect-",
  ]);
  assert.equal(args.spaceName, "draft-bilibili");
  assert.equal(args.spaceSuffix, "fixed");
  assert.deepEqual(args.cleanupPrefixes, ["oil-collect-"]);
});

test("space-name cannot cover more than one platform", () => {
  assert.throws(
    () => parse(["--package", "/tmp/pkg.json", "--platforms", "xiaohongshu,douyin", "--space-name", "one"]),
    /--space-name can only be used with a single platform/,
  );
});

test("explicit operations guard cover replacement and repost", () => {
  const replace = parse(["--package", "/tmp/pkg.json", "--job-id", "ready-job", "--replace-cover"]);
  assert.equal(replace.operation, "replace-cover");
  assert.throws(() => parse(["--package", "/tmp/pkg.json", "--replace-cover"]), /requires --job-id/);
  assert.throws(() => parse(["--package", "/tmp/pkg.json", "--operation", "repost"]), /requires --confirm-new-copy/);
  const repost = parse(["--package", "/tmp/pkg.json", "--operation", "repost", "--confirm-new-copy"]);
  assert.equal(repost.operation, "repost");
});
