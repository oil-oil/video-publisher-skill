---
name: video-publisher
description: Prepare and verify video drafts for Xiaohongshu, Douyin, Bilibili, and WeChat Channels with Ego Lite. Use for creator-account onboarding and platform defaults, local-video intake, content-package preparation, safe parallel uploads, draft recovery, truthful original declarations, optional upload of provided cover files, creator-page workflow maintenance, and verification that stops before final publish. Do not use for video editing, cover creation, copy-only requests, or general platform advice.
---

# Video Publisher

Prepare one confirmed video package and drive selected creator platforms to a verified draft state. Use Ego Lite for all live creator-page work.

## Invocation Routing And Paths

Resolve `SKILL_DIR` as the directory containing this `SKILL.md`. Run every relative command and script with `SKILL_DIR` as the working directory; never assume the user's current workspace contains `scripts/`.

For video intake, draft preparation, recovery, job inspection, or live browser diagnosis, load configuration before inspecting media or creator pages. For Skill review, documentation work, static tests, or adapter maintenance that does not require a live page, do not read personal configuration and do not open Ego Lite. If maintenance reaches live diagnosis, apply the normal configuration and browser gates at that point.

## Configuration And Onboarding

At the start of every publishing or live-diagnosis flow, run from `SKILL_DIR`:

```bash
node scripts/config.mjs status
```

If `onboardingRequired` is `true`, stop the publishing flow and onboard the user. Ask first which supported creator platforms the user actually has; require at least one and never assume all four. Then ask which of those available platforms should run by default, proposing all available platforms as the default subset. Ask for Douyin topics only when Douyin is available and Bilibili automatic tags only when Bilibili is available. Collect the source directory, shared copy/tag preferences, and whether every video may truthfully be declared original; keep concurrency `4/4` and platform cover as proposed defaults unless the user changes them. Summarize the choices before writing. Save available accounts with repeatable `--available-platform` flags and defaults with repeatable `--platform` flags, run `validate`, and continue only when `onboardingRequired` is `false`.

Configuration is per user at `$XDG_CONFIG_HOME/video-publisher/config.json`, or `$HOME/.config/video-publisher/config.json`. `VIDEO_PUBLISHER_CONFIG` overrides the path. Never put a user's configuration inside the shareable Skill folder.

An explicit current request overrides the package; explicit package fields override configuration defaults. A current request may select any configured available platform, but it cannot silently add an unavailable platform. After confirming the account, use the non-destructive `add-platform` command instead of rerunning onboarding and resetting existing preferences. The configuration may persist the user's truthful standing originality policy and declared platform availability, but never cookies, credentials, video-specific paths, or final-publish instructions. Read `references/configuration.md` for the schema and commands.

## Safety Boundary

This Skill never clicks the final `发布`, `发布笔记`, `发表`, or `立即投稿` control. Final publishing is outside the implemented and live-tested boundary; the user reviews and publishes manually. The maintained runner mounts a page-level capture guard for all four labels, and `READY` requires evidence that the guard is armed and blocked zero attempts.

Before enabling any `原创`, `自制`, or equivalent declaration, require one of two truthful signals: the onboarded `declarations.originalityPolicy` is `all_videos_original`, or the user confirms the current video and the run passes `--confirm-original-rights`. Never infer either signal from the video itself. If neither is available, stop: non-original declaration modes are outside the current live-tested boundary.

Treat `all_videos_original` as a reusable content policy, never as permission to publish. `ask_each_run` remains the generic onboarding default for shared installations.

Stop only when every selected platform is either:

- `ready`: every required gate is verified from fresh page evidence; or
- blocked by a typed condition that genuinely requires the user or a later retry.

Never turn “an action was attempted” into success. A title, tag, declaration, setting, or cover is complete only after a fresh verifier confirms the resulting page state.

## Production Architecture

Use the stateful production entry:

```bash
scripts/run-safe-platforms.sh <package.json> [task-suffix] [platform...]
```

This invokes `scripts/v2/publisher.mjs`. The older Agent-per-platform implementation and its runners have been removed. Do not recreate them.

Use one orchestrator and one Ego Lite task space per platform. Do not delegate live browser control to sub Agents. Agents may help prepare copy or inspect saved artifacts, but they must not control creator tabs.

The publisher first acquires one account-wide publisher lock independent of `--state-root`, then one atomic job-directory lock, before state writes or browser phases. Direct one-platform diagnosis joins the same publisher-lock ownership, and every spawned Ego controller registers a token-bound member PID. A lock is stale only when both its owner and all registered members are dead. Keep separate platform locks as defense in depth. This serialization does not reduce four-platform parallelism inside the owner job.

Schedule by resource type:

```text
read-only inspect: parallel, default 4
video upload and platform processing wait: parallel, default 4
rolling post-upload mutation and final verification: serial, exactly 1
input-channel circuit-breaker verification: parallel, default 4
```

There is no cross-platform upload barrier. As soon as one platform proves its own upload complete, enqueue that platform for metadata, topic, declaration, setting, cover mutation, and fresh verification through the single UI queue. A slow upload or typed platform blocker freezes only that platform; it must not delay a successful sibling. An upload runner may report success only after the platform proves completion. A preview card alone is insufficient when progress text, a percentage, processing text, or `取消上传` remains visible.

Treat `USER_CONTROL` and `INPUT_CHANNEL_BROKEN` as the two global stop conditions. Authentication, upload, risk-control, selector, asset, and draft blockers remain platform-local. If an active runner returns `INPUT_CHANNEL_BROKEN`, let already-started work settle, start no new quarantine, upload, or mutation, and run only the still-missing final read-only verification so the persisted job records page truth. Resume through the ordinary same-job command after Ego restarts. If Ego reports `USER_CONTROL`, stop all browser work until the user explicitly asks to continue.

Custom-cover dialogs also use the single UI queue. Isolated task spaces do not make concurrent clicking safe.

Accepted cover receipts are written to atomic, fingerprint-bound checkpoints inside the job directory before an adapter returns. This closes the crash window between a successful creator-page mutation and the orchestrator recording its result. A resumed run still has to match the checkpoint against fresh page truth.

Job state also keeps a one-generation atomic backup. If `state.json` is invalid JSON, restore only a backup whose package fingerprint matches, preserve the corrupt primary as `state.corrupt-<timestamp>.json`, and then re-inspect every platform. Job directories use `0700`; state, evidence, checkpoints, and lock-owner files use `0600`. Never turn restored state into `READY` without fresh page verification.

## Browser Rules

- Use `ego-browser`; do not fall back to Chrome control.
- Verify the exact local video and cover paths before opening creator pages.
- Inspect before acting and reuse only a draft whose identity matches the package.
- Preserve both the numeric task-space id and the exact stable task-space name in persisted job state. A recycled id whose live name differs belongs to another job; select or recreate only the recorded exact name.
- Leave task spaces open by default so the user can review drafts.
- Use hand-written Ego heredocs only after the maintained runner reports a blocker, and fold repeatable fixes back into the adapter.
- If Ego reports that the user took control, stop all browser work. Resume only after the user explicitly says to continue, then claim the recorded task space.

Read `references/ego-browser-workflow.md` before browser diagnosis or adapter changes.

## Custom Workflow Extensions

When the user asks to add, remove, reorder, or customize a publishing step—for example, “在抖音填完标题后点击某个按钮”—read `references/customizing-workflows.md` before diagnosing the page or editing an adapter.

Use the extension workflow to turn the request into an idempotent `inspect -> action -> verify` step backed by real creator-page evidence. Classify the behavior as a generic adapter repair, an explicit package/config option, or a private per-user default before choosing where it belongs. Never encode personal account data in the shareable Skill, and never let a customization bypass the no-final-publish boundary, truthful originality policy, task-space ownership, or the shared safety gate.

## Phases And Evidence

The platform runner exposes only these phases:

```text
inspect: read page truth; no mutation
quarantine: Bilibili only; resolve or preserve an old draft
upload: upload only when the target video is not already present
mutate: repair metadata, entities, declarations, settings, and covers
verify: independently re-read every required gate
```

Do not use the removed `fill`, `check-only`, `repair-only`, `upload-only`, or `quarantine-only` interfaces.

`ready` is computed centrally. Platform adapters cannot set it themselves. Every result also carries `finalPublishClicked: false` and a safety gate injected by the shared core.

Required evidence includes:

```text
authenticated session
correct draft identity
video upload fully complete
exact platform text and tag/entity state
required original/self-made declarations
required account settings
custom-cover receipt when enabled
no blocking dialog
visible, enabled final button
final publish not clicked
```

Read `references/platform-common.md` for the shared gate and blocker contract.

## Bilibili Draft Recovery

Treat Bilibili’s local restore banner as unresolved identity, not a clean upload page.

1. Open `继续编辑`.
2. If the resumed filename/title matches the package, reuse it.
3. If it is another video, click `存草稿`, return to a clean upload page, and verify the old editor is gone.
4. Upload the target only after that clean state is proven.

Distinguish “some video is uploaded” from “the target video is uploaded”. This exact distinction prevents foreign drafts from bypassing quarantine.

## Content Package

Read `references/intake-workflow.md` and `references/content-package.md`. Use configuration as defaults, then confirm the source video, platform selection from `availablePlatforms`, title, tags, unresolved rights/declaration status, and existing-cover upload intent before browser automation. Newlines in JSON fields must be real newline characters.

Use platform-native defaults:

```text
Xiaohongshu: short title, real topic entities, no prose body by default, original declaration
Douyin: title/body plus 1-5 package-supplied topic entities
Bilibili: title, concise description, tag chips, self-made declarations
WeChat Channels: description begins with title and plain hashtags; leave short title empty
```

Xiaohongshu topic entities do not support the half-width dot `.`. Reject dotted `xhsTopics` during package validation and require an explicitly chosen dot-free label such as `GPT56`; never silently rewrite the topic.

This Skill does not create or edit cover artwork. When the user supplies existing cover files and explicitly enables `cover.uploadCustomCover: true`, read `references/cover-workflow.md`, then validate the mapped file paths and ratios before upload:

```text
Xiaohongshu: 3:4
Douyin: 3:4 and 4:3
Bilibili: 16:10
WeChat Channels: 3:4 and 4:3
```

Run `scripts/check-package.mjs` for every selected platform before browser work. For Douyin, require a valid MP4/M4V/MOV duration readable from ISO BMFF metadata, fail closed when duration cannot be verified, and reject content above 900 seconds plus 0.1 seconds of container-rounding tolerance before Ego Lite starts. Do not automatically trim, transcode, or substitute media. This rule is platform-specific and must not block other valid selected platforms.

## Default Flow

1. Load configuration and complete onboarding, including available and default platform selection, when required.
2. Identify the exact local source and any subtitle variant.
3. Propose and confirm the package and selected platforms.
4. Validate any user-supplied cover assets before browser work.
5. Validate each platform package.
6. Run the production orchestrator.
7. Let it inspect in parallel and quarantine Bilibili when required.
8. Let all missing video uploads run in parallel.
9. As each platform proves upload completion, let the single rolling UI queue repair its metadata, declarations, settings, and covers, then independently verify it.
10. Freeze a typed-blocked platform without delaying or revisiting successful siblings; keep only shared input loss and explicit user control as global stops.
11. Leave every verified draft open before its final button.

For read-only job inspection:

```bash
scripts/run-safe-platforms.sh <package.json> [task-suffix] [platform...] --inspect-only
```

For one-platform adapter diagnosis, use `scripts/v2/run-platform.mjs` as documented in `references/scripts.md`.

## Current Acceptance Boundary

As of 2026-07-16, real creator-page runs have verified:

- Xiaohongshu: exact title and topic entities, original declaration, optional 3:4 cover receipt, dialog and final-button gates.
- Douyin: exact title/body and ordered topic entities, simultaneous-publication setting, optional distinct 3:4 and 4:3 cover receipts, and the verified 15-minute media boundary.
- Bilibili: exact title/description/tag chips, self-made declarations, same-target restore, foreign-draft quarantine, and upload-page recovery. The custom-cover mapping now requires a dedicated 16:10 asset; this ratio change remains pending fresh creator-page acceptance.
- WeChat Channels: stable upload completion, exact description, empty short title, original declaration, optional distinct 3:4 and 4:3 receipts, and Wujie lifecycle recovery.

System-level runs through 2026-07-16 verified four parallel uploads behind the previous cross-platform barrier, one serial UI queue, parallel final verification, atomic state and receipt recovery, account/job/platform lock contention, stale-lock recovery, task-space id recycling, browser loss during upload and mutation, and repeated no-op reruns. Every accepted run kept the final guard armed with zero attempts and did not click final publish.

The 2026-07-17 maintenance revision replaces that barrier with rolling per-platform finalization: a completed platform enters the serial UI queue immediately, while ordinary typed blockers freeze only their own platform. Local integration tests prove early successful-platform mutation, upload-blocker isolation, authentication isolation, and the retained global input-channel circuit breaker. This scheduler change, the account-wide lock path, direct-runner ownership token, fail-closed unknown Douyin duration, WeChat empty-description receipt rule, and Bilibili 16:10 custom-cover mapping remain pending the next applicable real creator-page and full selected-platform regression and must not be described as live-accepted yet.

Real creator-page evidence remains the acceptance gate for page-adapter changes. Unit tests cover orchestration, parsing, validation, persistence, and safety contracts but do not accept live selectors. When scheduler, persistence, locking, task-space recovery, shared-browser behavior, or receipts change, repeat the relevant crash/restart scenario and a full selected-platform production regression; a one-platform diagnostic is insufficient.

## Reference Map

- `references/intake-workflow.md`: source selection and package drafting.
- `references/content-package.md`: package JSON fields, precedence, and platform requirements.
- `references/configuration.md`: per-user schema, onboarding, precedence, and privacy boundary.
- `references/cover-workflow.md`: upload of existing cover assets, ratio mapping, and receipts.
- `references/ego-browser-workflow.md`: Ego Lite task spaces, upload channels, handoff, and diagnostics.
- `references/customizing-workflows.md`: idempotent creator-page workflow extensions and acceptance.
- `references/platform-common.md`: orchestration, gates, blockers, and concurrency.
- `references/scripts.md`: production and diagnostic commands.
- `references/platform-xiaohongshu.md`: Xiaohongshu adapter contract.
- `references/platform-douyin.md`: Douyin adapter contract.
- `references/platform-bilibili.md`: Bilibili adapter and draft quarantine contract.
- `references/platform-wechat-channels.md`: Wujie lifecycle activation, upload truth, original declaration, cover flow, and retry recovery.

Default source directory comes from configuration; `VIDEO_PUBLISHER_SOURCE_DIR` may override it for `find-video.mjs`.
