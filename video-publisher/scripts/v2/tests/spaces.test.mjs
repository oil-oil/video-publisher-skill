import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildCleanupPlan,
  buildSpaceName,
  collectCompletedSpaces,
  collectJobSpaces,
  retireCurrentSpaces,
  selectSpacesToClose,
  shouldCloseCurrentSpaces,
  shouldRotateSpaces,
  spaceCleanupScript,
  spaceShouldClose,
} from "../lib/spaces.mjs";

test("shouldRotateSpaces opens a new space for new or ready jobs", () => {
  assert.equal(shouldRotateSpaces({ freshSpace: true }, { status: "new" }), true);
  assert.equal(shouldRotateSpaces({ freshSpace: true }, { status: "ready" }), true);
  assert.equal(shouldRotateSpaces({ freshSpace: true }, { status: "running" }), false);
  assert.equal(shouldRotateSpaces({ freshSpace: true }, { status: "blocked" }), false);
  assert.equal(shouldRotateSpaces({ freshSpace: true, inspectOnly: true }, { status: "ready" }), false);
  assert.equal(shouldRotateSpaces({ freshSpace: false }, { status: "new" }), false);
  assert.equal(shouldRotateSpaces({ forceFreshSpace: true }, { status: "running" }), true);
  assert.equal(shouldRotateSpaces({ spaceName: "fixed", freshSpace: true }, { status: "new" }), false);
  assert.equal(shouldRotateSpaces({ cleanupOnly: true, freshSpace: true }, { status: "ready" }), false);
});

test("buildSpaceName uses an explicit name or a unique suffix", () => {
  assert.equal(buildSpaceName({
    spaceName: "fixed-space",
    spacePrefix: "video publisher v2",
    platform: "douyin",
    taskSuffix: "demo",
    jobId: "abc",
    stamp: "stamp",
  }), "fixed-space");
  assert.equal(buildSpaceName({
    spacePrefix: "video publisher v2",
    platform: "xiaohongshu",
    taskSuffix: "demo",
    jobId: "abc",
    stamp: "msv1-zz",
  }), "video publisher v2 xiaohongshu demo-abc-msv1-zz");
});

test("space cleanup never closes user-owned or live current spaces", () => {
  const listed = [
    { id: 1, name: "video publisher v2 xiaohongshu live", ownership: "agent" },
    { id: 2, name: "video publisher v2 douyin ready-old", ownership: "agent" },
    { id: 3, name: "oil-collect-publish", ownership: "agent" },
    { id: 4, name: "user draft", ownership: "user" },
    { id: 5, name: "oil-collect-other", ownership: "agent" },
  ];
  const selected = selectSpacesToClose(listed, {
    closeNames: new Set(["video publisher v2 douyin ready-old", "oil-collect-publish"]),
    keepIds: new Set([1]),
    keepNames: new Set(["video publisher v2 xiaohongshu live"]),
    prefixes: [],
  });
  assert.deepEqual(selected.map(item => item.id), [2, 3]);
  assert.equal(spaceShouldClose(listed[4], {
    closeNames: new Set(),
    keepIds: new Set(),
    keepNames: new Set(),
    prefixes: [],
  }), false);
});

test("buildCleanupPlan closes the current job after ready and only explicit leftovers", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-spaces-"));
  const other = path.join(root, "other-job");
  await fs.promises.mkdir(other, { recursive: true });
  await fs.promises.writeFile(path.join(other, "state.json"), JSON.stringify({
    status: "ready",
    platforms: { douyin: { taskSpaceId: 9, taskSpaceName: "old douyin" } },
  }));
  const running = path.join(root, "running-job");
  await fs.promises.mkdir(running, { recursive: true });
  await fs.promises.writeFile(path.join(running, "state.json"), JSON.stringify({
    status: "running",
    platforms: { xiaohongshu: { taskSpaceId: 8, taskSpaceName: "live xhs" } },
  }));
  const state = {
    jobId: "this-job",
    platforms: { xiaohongshu: { taskSpaceId: 11, taskSpaceName: "current xhs" } },
    retiredSpaces: [{ id: 10, name: "previous xhs" }],
  };
  const plan = buildCleanupPlan({
    platforms: ["xiaohongshu"],
    keepSpace: false,
    cleanupStaleSpaces: true,
    cleanupNames: ["oil-collect-publish"],
    cleanupPrefixes: [],
    stateRoot: root,
  }, state, { complete: true, userControl: false });
  assert.ok(plan);
  assert.ok(plan.closeNames.includes("current xhs"));
  assert.ok(plan.closeNames.includes("old douyin"));
  assert.ok(plan.closeNames.includes("previous xhs"));
  assert.ok(plan.closeNames.includes("oil-collect-publish"));
  assert.equal(plan.closeNames.includes("live xhs"), false);
  assert.deepEqual(plan.prefixes, []);
  const listed = collectCompletedSpaces(root, "this-job");
  assert.deepEqual(collectJobSpaces({ platforms: { douyin: { taskSpaceId: 9, taskSpaceName: "old douyin" } } }, ["douyin"]), {
    ids: [9],
    names: ["old douyin"],
  });
  assert.equal(listed.names.includes("live xhs"), false);
});

test("cleanup cannot close another draft after a retired numeric ID is recycled", async () => {
  const plan = buildCleanupPlan({
    platforms: ["xiaohongshu"], keepSpace: true, cleanupStaleSpaces: false,
  }, {
    jobId: "current-job",
    platforms: { xiaohongshu: { taskSpaceId: 11, taskSpaceName: "current draft" } },
    retiredSpaces: [{ id: 7, name: "retired draft" }],
  }, { complete: true, userControl: false });
  const listed = [
    { id: 7, name: "another job's draft", ownership: "agent" },
    { id: 19, name: "retired draft", ownership: "agent" },
    { id: 11, name: "current draft", ownership: "agent" },
  ];
  const policy = { ...plan, ...Object.fromEntries(
    ["closeNames", "keepIds", "keepNames"].map(key => [key, new Set(plan[key] || [])]),
  ) };
  assert.deepEqual(selectSpacesToClose(listed, policy).map(item => item.id), [19]);
  const closed = [];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("listTaskSpaces", "completeTaskSpace", "console", spaceCleanupScript(plan))(
    async () => listed, async id => closed.push(id), { log() {} },
  );
  assert.deepEqual(closed, [19], "实际清理脚本也必须按名称核对，不能只看旧 ID");
});

test("subset cleanup protects every current space in the same job", () => {
  const state = {
    jobId: "multi-platform-job",
    platforms: {
      xiaohongshu: { taskSpaceId: 9, taskSpaceName: "current xhs" },
      douyin: { taskSpaceId: 10, taskSpaceName: "current douyin" },
      bilibili: { taskSpaceId: 8, taskSpaceName: "current bilibili" },
      wechat_channels: { taskSpaceId: 11, taskSpaceName: "current wechat" },
    },
    retiredSpaces: [
      { id: 9, name: "current xhs" },
      { id: 10, name: "current douyin" },
      { id: 8, name: "current bilibili" },
      { id: 7, name: "old wechat" },
    ],
  };
  const plan = buildCleanupPlan({
    platforms: ["wechat_channels"],
    keepSpace: true,
    cleanupStaleSpaces: true,
    cleanupNames: [],
    cleanupPrefixes: ["video publisher v2"],
    stateRoot: "",
  }, state, { complete: true, userControl: false });

  assert.deepEqual([...plan.keepIds].sort((left, right) => left - right), [8, 9, 10, 11]);
  assert.deepEqual([...plan.keepNames].sort(), [
    "current bilibili",
    "current douyin",
    "current wechat",
    "current xhs",
  ]);
  assert.deepEqual(plan.closeNames, ["old wechat"]);
  assert.deepEqual(selectSpacesToClose([
    { id: 9, name: "current xhs", ownership: "agent" },
    { id: 10, name: "current douyin", ownership: "agent" },
    { id: 8, name: "current bilibili", ownership: "agent" },
    { id: 11, name: "current wechat", ownership: "agent" },
    { id: 7, name: "old wechat", ownership: "agent" },
  ], {
    closeNames: new Set(plan.closeNames),
    keepIds: new Set(plan.keepIds),
    keepNames: new Set(plan.keepNames),
    prefixes: plan.prefixes,
  }).map(item => item.id), [7]);
});

test("closing a selected subset still protects unselected current spaces", () => {
  const plan = buildCleanupPlan({
    platforms: ["wechat_channels"],
    keepSpace: false,
    cleanupStaleSpaces: false,
    stateRoot: "",
  }, {
    jobId: "multi-platform-job",
    platforms: {
      xiaohongshu: { taskSpaceId: 9, taskSpaceName: "current xhs" },
      wechat_channels: { taskSpaceId: 11, taskSpaceName: "current wechat" },
    },
    retiredSpaces: [{ id: 9, name: "current xhs" }],
  }, { complete: true, userControl: false });

  assert.deepEqual(plan.closeNames, ["current wechat"]);
  assert.deepEqual(plan.keepIds, [9]);
  assert.deepEqual(plan.keepNames, ["current xhs"]);
});

test("READY keeps the current draft space unless close-on-complete", () => {
  assert.equal(shouldCloseCurrentSpaces(
    { keepSpace: true },
    {},
    { complete: true, incomingInProgress: false },
  ), false);
  assert.equal(shouldCloseCurrentSpaces(
    { keepSpace: false },
    {},
    { complete: true, incomingInProgress: false },
  ), true);
});

test("inspect-only does not close an in-progress job or a kept ready job", () => {
  assert.equal(shouldCloseCurrentSpaces(
    { inspectOnly: true, keepSpace: false },
    { keepSpace: false },
    { complete: false, incomingInProgress: true },
  ), false);
  assert.equal(shouldCloseCurrentSpaces(
    { inspectOnly: true, keepSpace: false },
    { keepSpace: true },
    { complete: false, incomingInProgress: false },
  ), false);
  assert.equal(shouldCloseCurrentSpaces(
    { inspectOnly: true, keepSpace: false },
    { keepSpace: false },
    { complete: false, incomingInProgress: false },
  ), true);
});

test("collectCompletedSpaces skips current spaces of a kept job", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-keep-space-"));
  const kept = path.join(root, "kept-job");
  await fs.promises.mkdir(kept, { recursive: true });
  await fs.promises.writeFile(path.join(kept, "state.json"), JSON.stringify({
    status: "ready",
    keepSpace: true,
    platforms: { douyin: { taskSpaceId: 5, taskSpaceName: "kept douyin" } },
    retiredSpaces: [{ id: 4, name: "old kept leftover" }],
  }));
  const listed = collectCompletedSpaces(root, "other");
  assert.equal(listed.names.includes("kept douyin"), false);
  assert.ok(listed.names.includes("old kept leftover"));
  assert.deepEqual(listed.ids, [4]);
});

test("cleanup-only of a running job does not close current spaces", () => {
  assert.equal(shouldCloseCurrentSpaces(
    { cleanupOnly: true, keepSpace: false },
    { status: "running", keepSpace: false },
    { complete: false, incomingInProgress: true },
  ), false);
  assert.equal(shouldCloseCurrentSpaces(
    { cleanupOnly: true, keepSpace: false },
    { status: "ready", keepSpace: true },
    { complete: true, incomingInProgress: false },
  ), true);
});

test("retireCurrentSpaces records the previous identity before a fresh space is assigned", () => {
  const state = {
    platforms: { douyin: { taskSpaceId: 4, taskSpaceName: "old" } },
  };
  retireCurrentSpaces(state, ["douyin"], "2026-08-16T00:00:00.000Z");
  assert.equal(state.retiredSpaces[0].name, "old");
  assert.equal(state.retiredSpaces[0].id, 4);
});
