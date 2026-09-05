import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(skillDirectory, relativePath), "utf8");
}

test("主入口保持精简并保留发布安全边界", () => {
  const skill = read("SKILL.md");
  const lineCount = skill.trimEnd().split("\n").length;

  assert.ok(lineCount <= 110, `SKILL.md 过长：${lineCount}/110 行`);
  assert.ok(Buffer.byteLength(skill) <= 10_000, `SKILL.md 过大：${Buffer.byteLength(skill)}/10000 bytes`);
  assert.match(skill, /scripts\/run-safe-platforms\.sh <package\.json>/);
  assert.match(skill, /不点击任何平台的最终发布、保存或定时发布按钮/);
  assert.match(skill, /--confirm-original-rights/);
  assert.match(skill, /--no-cleanup-stale-spaces/);
  assert.match(skill, /部分平台/);
  assert.match(skill, /USER_CONTROL/);
  assert.match(skill, /INPUT_CHANNEL_BROKEN/);
  assert.doesNotMatch(skill, /orchestrator\.lock|state\.corrupt|Current Acceptance Boundary|2026-/);
  assert.doesNotMatch(skill, /check-package\.mjs/);
});

test("普通发布只加载精简运行文档", () => {
  const runtimeFiles = [
    "SKILL.md",
    "references/intake-workflow.md",
    "references/content-package.md",
  ];
  const totalBytes = runtimeFiles.reduce((sum, file) => sum + Buffer.byteLength(read(file)), 0);

  assert.ok(totalBytes <= 20_000, `普通发布上下文过大：${totalBytes}/20000 bytes`);
  assert.match(read("references/content-package.md"), /生产入口会在创建任务和打开页面前统一校验全部所选平台/);
  assert.doesNotMatch(read("references/intake-workflow.md"), /scripts\/check-package\.mjs/);
});

test("主入口中的按需参考文档全部存在", () => {
  const skill = read("SKILL.md");
  const references = [...skill.matchAll(/`(references\/[^`]+\.md)`/g)].map(match => match[1]);

  assert.ok(references.length >= 8);
  for (const reference of new Set(references)) {
    if (reference.includes("*")) continue;
    assert.ok(fs.existsSync(path.join(skillDirectory, reference)), `缺少参考文档：${reference}`);
  }
  assert.ok(fs.existsSync(path.join(skillDirectory, "references/acceptance-history.md")));
});

test("历史记录与运行入口分离", () => {
  const skill = read("SKILL.md");
  const history = read("references/acceptance-history.md");

  assert.doesNotMatch(skill, /## 当前验收|## 实测边界|## Current Acceptance/);
  assert.match(history, /普通视频发布不要读取/);
  assert.match(history, /2026-08-05/);
  assert.match(history, /YouTube/);
});
