# Production And Diagnostic Commands

All paths below are relative to the Skill directory. Resolve the directory containing `SKILL.md` and use it as the working directory before running any command.

## Contents

- Configuration and package validation
- Production orchestrator and recovery
- One-platform diagnosis
- Result contract and local tests

## Configuration

Inspect onboarding state before any other command:

```bash
node scripts/config.mjs status
node scripts/config.mjs validate
```

Run onboarding as documented in `references/configuration.md`. Set `VIDEO_PUBLISHER_CONFIG` to test or use an alternate per-user configuration file.

## Package Validation

生产入口会在浏览器工作前统一校验全部所选平台。只有排查某个平台的内容包时，才单独运行：

```bash
node scripts/check-package.mjs <platform> /absolute/path/to/package.json
```

Supported platform keys:

```text
xiaohongshu
douyin
bilibili
wechat_channels
youtube
```

Validation checks the local video path, platform-specific title limits, required platform fields, package-supplied topic/tag data, YouTube audience/visibility/license, and requested cover paths and ratios. Xiaohongshu uses a weighted 20-character limit: every ASCII code point, including English letters, digits, spaces, and half-width punctuation, counts as 0.5, while every non-ASCII Unicode code point counts as 1. Preserve the original title whenever this weighted length is within the limit. Douyin requires a valid MP4/M4V/MOV duration readable from ISO BMFF metadata; unknown duration fails closed with `DOUYIN_DURATION_UNVERIFIED`. No local duration ceiling is imposed; an explicit creator-page rejection is recorded as `PLATFORM_REJECTED_ASSET`.

## Production Orchestrator

```bash
scripts/run-safe-platforms.sh \
  /absolute/path/to/package.json \
  task-suffix \
  xiaohongshu douyin bilibili wechat_channels youtube
```

When onboarding has `declarations.originalityPolicy: all_videos_original`, the runner applies truthful original/self-made declarations without another flag. With the generic `ask_each_run` policy, add `--confirm-original-rights` only after the user confirms the current video; this one-run override is not persisted. Read-only `--inspect-only` never needs either signal.

The platform list is optional; omit it to use configured `defaultPlatforms`. Explicit platform arguments may select any configured `availablePlatforms`. If the second positional argument is a platform key, the task suffix defaults to `manual`.

Read-only inspection:

```bash
scripts/run-safe-platforms.sh \
  /absolute/path/to/package.json \
  task-suffix \
  xiaohongshu bilibili \
  --inspect-only
```

Options:

```text
--inspect-only
--confirm-original-rights
--state-root <dir>
--job-id <id>
--check-concurrency <positive integer>
--upload-concurrency <positive integer>
```

UI concurrency is fixed at `1` and has no public override.

State defaults to `~/.video-publisher/v2-jobs/<job-id>/`. The job stores the package fingerprint, numeric task-space ids, exact stable task-space names, task-space-bound receipts, observations, compact verdicts, an atomic one-generation `state.backup.json`, and schema-`2` receipt checkpoints under `checkpoints/`. An invalid primary state may recover only from a fingerprint-matching backup; the corrupt file is preserved as `state.corrupt-<timestamp>.json`, after which all platform gates are read again.

上传并行执行，不设跨平台完成屏障。五个平台都先执行 `upload_start`；页面证明视频仍在上传且对应安全字段已就绪时，立即通过单宽 UI 队列执行 `prefill`，再继续等待上传完成。视频号只提前填写描述并保持短标题为空；YouTube 提前填写详情和可编辑高级设置。封面、原创声明、B 站简介与创作声明、YouTube 可见性与最终步骤、最终修复和验证不会提前。平台一旦完成上传，就进入滚动串行收尾；普通阻塞只冻结该平台。

Before state or browser work, production acquires the account-wide publisher lock under `${VIDEO_PUBLISHER_V2_LOCK_ROOT:-$HOME/.video-publisher/v2-locks}/publisher/`, then `<job-dir>/orchestrator.lock/`. The first is independent of `--state-root`; the second protects persisted state. Direct diagnosis proves parent-lock ownership or acquires the same lock, and each spawned Ego controller registers a token-bound member PID. Normal completion removes locks; crash recovery removes the publisher lock only after its owner and all registered members are dead.

Job directories use mode `0700`. State, evidence, receipt checkpoints, and lock-owner JSON use mode `0600`; opening an existing job also repairs older broader permissions.

To resume an interrupted run, repeat the same command with the same `--job-id`. The package fingerprint must match. The orchestrator reuses a persisted task space only when both its numeric id and exact stable name identify the same live space; this prevents Ego's post-crash numeric-id recycling from entering another job. It restores only checkpoints whose platform, package fingerprint, and task-space id all match, then inspects page truth again before acting. If the recorded id is missing or has another live name, the runner selects or recreates only the recorded exact platform-space name and writes its current id back. An explicit recreation invalidates receipts even when Ego assigns the replacement the same numeric id. Ownership or user-control errors never use this fallback.

`INPUT_CHANNEL_BROKEN` is invocation-wide. Once any runner records it, the orchestrator lets already-started work settle, starts no new UI mutation, preserves platforms that already completed rolling verification, and performs only still-missing final read-only verification. `USER_CONTROL` also stops the whole browser job. Other typed blockers, including `AUTH_REQUIRED`, are platform-local. The next ordinary same-job invocation resumes after Ego restarts; do not manually clean state or re-run a one-platform mutator inside the broken invocation.

Exit codes:

```text
0: every selected platform is ready, or read-only inspection completed without a hard blocker
10: at least one platform has a hard blocker, including unavailable browser input or user control
1: fatal runner/parse/environment error
2: command usage error
```

## One-Platform Adapter Runner

Use only for adapter diagnosis and targeted repair:

```bash
node scripts/v2/run-platform.mjs \
  <platform> \
  /absolute/path/to/package.json \
  <inspect|upload_start|prefill|upload|mutate|verify|quarantine> \
  [task-suffix] \
  [numeric-task-space-id]
```

`upload_start` 和 `prefill` 支持五个平台。`upload_start` 不是上传完成回执；`prefill` 只处理已实测稳定字段且不上传封面或原创声明，运行后仍必须执行正式 `upload`、`mutate` 和 `verify`。

Direct `mutate` diagnosis for Xiaohongshu, Bilibili, or WeChat Channels requires either onboarded `all_videos_original` or the one-run `--confirm-original-rights` override. `inspect`, `upload`, `verify`, and Bilibili `quarantine` remain available without either signal.

`quarantine` is valid only for Bilibili. Always reuse the numeric task-space id recorded in job state; do not invent a second task space for an active draft.

For a verify call that must check a custom-cover receipt, pass the persisted receipt JSON:

```bash
VIDEO_PUBLISHER_V2_RECEIPTS='{"cover":{...}}' \
  node scripts/v2/run-platform.mjs bilibili package.json verify suffix 12
```

## Result Contract

The adapter runner prints one line prefixed with:

```text
VIDEO_PUBLISHER_V2_RESULT:
```

Parsers accept the prefix only at the start of a trimmed output line. An exception message that merely mentions the prefix is not a result and must preserve the underlying runner error.

The payload includes:

```text
platform and phase
taskSpaceId
fresh gate evidence
typed blocker, when present
cover receipts, when produced
finalPublishClicked: false
```

Do not parse unstructured page logs as success.

## Tests

Run local validation without opening creator pages:

```bash
node --check scripts/v2/publisher.mjs
node --check scripts/v2/run-platform.mjs
for file in scripts/v2/platforms/*.mjs scripts/v2/ego/*.mjs scripts/v2/lib/*.mjs; do node --check "$file"; done
node --test scripts/tests/*.test.mjs scripts/v2/tests/*.test.mjs
```

These tests do not replace real platform acceptance.
