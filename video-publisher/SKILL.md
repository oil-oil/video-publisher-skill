---
name: video-publisher
description: Prepare and automate video drafts for Xiaohongshu, Douyin, Bilibili, and WeChat Channels with Ego Lite. Use for first-run onboarding, per-user publishing defaults, video intake, platform copy and tags, parallel upload scheduling, draft recovery, original declarations, optional upload of provided cover assets, and verification before final publish.
---

# Video Publisher

Prepare one confirmed video package and drive selected creator platforms to a verified draft state. Use Ego Lite for all live creator-page work.

## Configuration And Onboarding

At the start of every invocation, before inspecting a video or opening a browser, run:

```bash
node scripts/config.mjs status
```

If `onboardingRequired` is `true`, stop the publishing flow and onboard the user. Ask only for the source directory, default platforms, copy/tag preferences, Douyin default topics, and Bilibili automatic-tag allowlist; keep concurrency `4/4` and platform cover as proposed defaults unless the user changes them. Save with `scripts/config.mjs onboard`, run `status` again, and continue only when `onboardingRequired` is `false`.

Configuration is per user at `$XDG_CONFIG_HOME/video-publisher/config.json`, or `$HOME/.config/video-publisher/config.json`. `VIDEO_PUBLISHER_CONFIG` overrides the path. Never put a user's configuration inside the shareable Skill folder.

An explicit current request overrides the package; explicit package fields override configuration defaults. Never persist login state, video-specific rights confirmation, or final-publish authorization. Read `references/configuration.md` for the schema and onboarding command.

## Safety Boundary

Never click the final `发布`, `发表`, or `立即投稿` control unless the user explicitly authorizes publishing in the current run. Uploading and preparing a draft do not imply permission to publish.

Before enabling any `原创`, `自制`, or equivalent rights declaration, obtain confirmation in the current run that the video and declaration are truthful. If the user cannot confirm that, stop: non-original declaration modes are outside the current live-tested boundary.

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

Schedule by resource type:

```text
read-only inspect: parallel, default 4
video upload and platform processing wait: parallel, default 4
metadata, topic, declaration, setting, and cover mutation: serial, exactly 1
final verification: parallel, default 4
```

The upload phase is a barrier: no UI mutation starts until every selected upload runner has exited. An upload runner may exit only after the platform proves completion. A preview card alone is insufficient when progress text, a percentage, processing text, or `取消上传` remains visible.

Custom-cover dialogs also use the single UI queue. Isolated task spaces do not make concurrent clicking safe.

## Browser Rules

- Use `ego-browser`; do not fall back to Chrome control.
- Verify the exact local video and cover paths before opening creator pages.
- Inspect before acting and reuse only a draft whose identity matches the package.
- Preserve the numeric task-space id in persisted job state.
- Leave task spaces open by default so the user can review drafts.
- Use hand-written Ego heredocs only after the maintained runner reports a blocker, and fold repeatable fixes back into the adapter.
- If Ego reports that the user took control, stop all browser work. Resume only after the user explicitly says to continue, then claim the recorded task space.

Read `references/ego-browser-workflow.md` before browser diagnosis or adapter changes.

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

Use the onboarded configuration as defaults, then confirm the source video, platform selection, title, tags, rights/declaration status, and existing-cover upload intent before browser automation. Newlines in JSON fields must be real newline characters.

Use platform-native defaults:

```text
Xiaohongshu: short title, real topic entities, no prose body by default, original declaration
Douyin: title/body plus 1-5 package-supplied topic entities
Bilibili: title, concise description, tag chips, self-made declarations
WeChat Channels: description begins with title and plain hashtags; leave short title empty
```

This Skill does not create or edit cover artwork. When the user supplies existing cover files and explicitly enables `cover.uploadCustomCover: true`, validate the mapped file paths and ratios before upload:

```text
Xiaohongshu: 3:4
Douyin: 3:4 and 4:3
Bilibili: 4:3
WeChat Channels: 3:4 and 4:3
```

Run `scripts/check-package.mjs` for every selected platform before browser work.

## Default Flow

1. Load configuration and complete onboarding when required.
2. Identify the exact local source and any subtitle variant.
3. Propose and confirm the package and selected platforms.
4. Validate any user-supplied cover assets before browser work.
5. Validate each platform package.
6. Run the production orchestrator.
7. Let it inspect in parallel and quarantine Bilibili when required.
8. Let all missing video uploads run in parallel and fully settle.
9. Let the single UI queue repair metadata, declarations, settings, and covers.
10. Run independent parallel verification.
11. Leave every verified draft open before its final button.

For read-only job inspection:

```bash
scripts/run-safe-platforms.sh <package.json> [task-suffix] [platform...] --inspect-only
```

For one-platform adapter diagnosis, use `scripts/v2/run-platform.mjs` as documented in `references/scripts.md`.

## Current Live-Test Boundary

As of 2026-07-14:

- Xiaohongshu passed title, exact topic entities, original declaration, 3:4 custom cover receipt, dialog and final-button verification.
- Douyin passed title/body, exact requested topic entities, cross-post setting, distinct 3:4 and 4:3 custom-cover receipts, dialog and final-button verification.
- Bilibili passed title, description, exact requested tag chips, self-made declarations, 4:3 custom-cover receipt, same-target restore, and real foreign-draft quarantine.
- WeChat Channels passed full upload completion, exact description, empty short title, original declaration, distinct 3:4 personal-profile and 4:3 share-card custom-cover receipts, stale cover-editor recovery, independent verification, dialog and final-button checks. The upload and cover inputs both require CDP object-id injection inside Wujie open roots.

The production orchestrator then passed a real four-platform regression with upload concurrency `4`, UI concurrency `1`, persisted receipts, interruption recovery, and a final parallel verify in which all four platforms returned `READY`. No final publish control was clicked.

A passing platform-specific diagnostic still does not replace this system-level regression when scheduler, persistence, or shared-browser behavior changes.

Real creator-page evidence is the acceptance gate for adapter changes. Unit tests validate orchestration and parsing, not live selectors.

## Reference Map

- `references/intake-workflow.md`: source selection and package drafting.
- `references/configuration.md`: per-user schema, onboarding, precedence, and privacy boundary.
- `references/cover-workflow.md`: upload of existing cover assets, ratio mapping, and receipts.
- `references/ego-browser-workflow.md`: Ego Lite task spaces, upload channels, handoff, and diagnostics.
- `references/platform-common.md`: orchestration, gates, blockers, and concurrency.
- `references/scripts.md`: production and diagnostic commands.
- `references/platform-xiaohongshu.md`: Xiaohongshu adapter contract.
- `references/platform-douyin.md`: Douyin adapter contract.
- `references/platform-bilibili.md`: Bilibili adapter and draft quarantine contract.
- `references/platform-wechat-channels.md`: Wujie lifecycle activation, upload truth, original declaration, cover flow, and retry recovery.

Default source directory comes from configuration; `VIDEO_PUBLISHER_SOURCE_DIR` may override it for `find-video.mjs`.
