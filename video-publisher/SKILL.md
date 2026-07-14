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

If `onboardingRequired` is `true`, stop the publishing flow and onboard the user. Ask only for the source directory, default platforms, copy/tag preferences, Douyin default topics, Bilibili automatic-tag allowlist, and whether every video may truthfully be declared original; keep concurrency `4/4` and platform cover as proposed defaults unless the user changes them. Save with `scripts/config.mjs onboard`, run `status` again, and continue only when `onboardingRequired` is `false`.

Configuration is per user at `$XDG_CONFIG_HOME/video-publisher/config.json`, or `$HOME/.config/video-publisher/config.json`. `VIDEO_PUBLISHER_CONFIG` overrides the path. Never put a user's configuration inside the shareable Skill folder.

An explicit current request overrides the package; explicit package fields override configuration defaults. The onboarding configuration may persist the user's truthful standing originality policy, but never login state, video-specific paths, or final-publish authorization. Read `references/configuration.md` for the schema and onboarding command.

## Safety Boundary

Never click the final `发布`, `发布笔记`, `发表`, or `立即投稿` control unless the user explicitly authorizes publishing in the current run. Uploading and preparing a draft do not imply permission to publish. The maintained runner mounts a page-level capture guard for all four labels; `READY` requires evidence that the guard is armed and that it blocked zero attempts.

Before enabling any `原创`, `自制`, or equivalent declaration, require one of two truthful signals: the onboarded `declarations.originalityPolicy` is `all_videos_original`, or the user confirms the current video and the run passes `--confirm-original-rights`. Never infer either signal from the video itself. If neither is available, stop: non-original declaration modes are outside the current live-tested boundary.

Treat `all_videos_original` as a reusable content policy, not permission to publish. The final publish controls still require explicit authorization in the current run and that authority is never persisted. `ask_each_run` remains the generic onboarding default for shared installations.

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

Accepted cover receipts are written to atomic, fingerprint-bound checkpoints inside the job directory before an adapter returns. This closes the crash window between a successful creator-page mutation and the orchestrator recording its result. A resumed run still has to match the checkpoint against fresh page truth.

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

Use the onboarded configuration as defaults, then confirm the source video, platform selection, title, tags, any unresolved rights/declaration status, and existing-cover upload intent before browser automation. Newlines in JSON fields must be real newline characters.

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

Run `scripts/check-package.mjs` for every selected platform before browser work. The validator reads MP4/M4V/MOV duration directly from ISO BMFF metadata without `ffprobe`. For Douyin, reject content longer than the real-tested 900-second boundary before Ego Lite starts; allow only 0.1 seconds of container-metadata rounding because a standard 15:00 stream copy reported 900.010 seconds and passed the real upload. Do not automatically trim or transcode the user's media. This duration rule is platform-specific and must not block the other selected platforms.

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

As of 2026-07-15:

- Xiaohongshu passed title, exact topic entities, original declaration, 3:4 custom cover receipt, dialog and final-button verification.
- Douyin passed title/body, exact requested topic entities, cross-post setting, distinct 3:4 and 4:3 custom-cover receipts, dialog and final-button verification.
- Bilibili passed title, description, exact requested tag chips, self-made declarations, 4:3 custom-cover receipt, same-target restore, and real foreign-draft quarantine.
- WeChat Channels passed full upload completion, exact description, empty short title, original declaration, distinct 3:4 personal-profile and 4:3 share-card custom-cover receipts, stale cover-editor recovery, independent verification, dialog and final-button checks. The upload and cover inputs both require CDP object-id injection inside Wujie open roots.

The production orchestrator then passed a real four-platform regression with upload concurrency `4`, UI concurrency `1`, persisted receipts, interruption recovery, and a final parallel verify in which all four platforms returned `READY`. No final publish control was clicked.

The onboarded `all_videos_original` policy also passed real mutation without `--confirm-original-rights`. After a targeted Xiaohongshu cover receipt reset, the maintained runner re-uploaded the 3:4 asset on its first attempt; three immediate full four-platform reruns then remained `READY` with no upload or UI mutation work.

A second cold-start regression used a different 308 MB source video and four fresh task spaces. Bilibili quarantined a real foreign draft before upload. Douyin recovered from a visible upload failure with bounded reinjection, then rebuilt a corrupted rich description into the exact body plus five topic entities. Bilibili closed a framework-swallowed cover dialog through its exact scoped completion control. Both platforms wrote fingerprint-bound cover checkpoints. After the main-state receipts were deliberately removed, the next full run restored them from those checkpoints and all four platforms returned `READY` without upload or mutation. Three additional consecutive full reruns were also no-op `READY` passes. No final publish control was clicked.

A third cold-start regression used another 208 MB source, a longer Chinese title, prose that repeated two requested topic words, a platform activity entity without a literal `#`, and different cover assets. It exposed and repaired native-title character loss, false plain-topic residue, and a delayed Douyin landscape-card URL. The repaired job reached four-platform `READY`, passed three consecutive no-op full reruns, then restored a deliberately removed Douyin state receipt from its fingerprint-bound checkpoint without mutation. No final publish control was clicked.

A fourth cold-start regression used a 344 MB source with an English-and-number mixed title, five new topic entities, and another cover pair. Bilibili quarantined the prior foreign draft, all four parallel uploads and serialized mutations reached `READY` on the first run, and three full reruns were no-op `READY` passes. After the WeChat Channels state receipt was deliberately removed, its two-slot cover checkpoint restored without mutation. The Xiaohongshu task space was then deliberately deleted to simulate browser/task-space loss; the same job created a new numeric space, re-uploaded and rebuilt only Xiaohongshu with a new cover receipt, preserved the other three ready drafts, and returned four-platform `READY`. Every final guard remained armed with zero blocked attempts, and no final publish control was clicked.

A fifth cold-start regression used a 196 MB source whose filename contained spaces, English text, and a comma, while its explicit cover paths used a different `_subtitled` naming pattern. All four platforms used the exact supplied assets and reached `READY`; Douyin's first independent verify caught a delayed landscape-card URL and the existing evidence-bound receipt repair passed the next verify. Three full reruns were no-op `READY` passes. The Bilibili state receipt and task space were then removed together: the new space resumed the same target without a video upload, refused to trust the checkpoint while no live cover URL existed, removed two restored platform tags, restored four requested tags, re-uploaded the exact 4:3 asset, and independently verified the content-addressed cover URL. Two more full reruns remained no-op `READY`. No final publish control was clicked.

A sixth regression used a 731 MB source and deliberately terminated the production process group while four uploads were active. The same persisted job reused all four numeric task-space ids. The first recovery exposed that Xiaohongshu and Bilibili could reinject while already uploading and that Douyin could misclassify its missing initial-page input as selector drift. All upload adapters now distinguish `already_ready`, `resume_existing`, and `injected`; an observed in-progress target enters the completion wait without another file injection. The repaired job recovered Xiaohongshu and Douyin from the interrupted browser uploads, handled one explicit Douyin upload failure through a bounded reinjection, reached four-platform `READY`, and passed three no-op full reruns. No final publish control was clicked.

A seventh cold-start regression used a different 533 MB source, four fresh task spaces, and deliberately terminated the orchestrator after all four file injections. Recovery evidence recorded `resume_existing` for Xiaohongshu, Bilibili, and WeChat Channels; Douyin recorded `resume_existing` followed by an explicit platform failure and then one successful `injected` retry. The sample also exposed package topic names containing spaces: Xiaohongshu and Douyin now query the platform's compact topic name while verifying only real committed entities, never plain hashtag text. The repaired job reached four-platform `READY`, every final guard was armed with zero attempts, and three consecutive full reruns were no-op `READY` passes. No final publish control was clicked.

An eighth cold-start regression used another 534 MB source with a mixed English/Chinese title and a second whitespace-bearing topic set. All four uploads and serialized mutations reached `READY` on the first production run; Douyin handled one explicit first-attempt upload failure and completed its bounded second attempt inside the same upload phase. Three full reruns were no-op `READY` passes. The WeChat Channels task space was then deliberately removed: the same job replaced id 51 with 55, rebuilt only WeChat Channels with fresh two-slot cover receipts, and passed two no-op reruns. The Douyin task space was removed next: the job replaced id 52 with 56, rebuilt only Douyin with fresh distinct portrait/landscape receipts, and passed two more no-op reruns. The other three platforms stayed `READY` during each recovery, every final guard remained armed with zero attempts, and no final publish control was clicked.

A ninth cold-start regression used a 1.12 GB, 15:09 HEVC source with custom-cover upload disabled. Xiaohongshu, Bilibili, and WeChat Channels completed the large upload, accepted platform-default covers, and reached `READY`. Douyin produced the same explicit upload failure twice. A stream-copy sample from the same source kept the codec, resolution, frame rate, bitrate, and approximately 1.11 GB size but ended at 14:59; Douyin uploaded it, accepted all fields and default covers, reached `READY`, and passed three no-op reruns. The package validator and production orchestrator now read ISO BMFF duration locally and stop a Douyin source above 900 seconds before opening its Ego Lite task space. A full four-platform rerun recorded that one platform as `PLATFORM_REJECTED_ASSET` while independently keeping the other three `READY` without upload or UI mutation; a Douyin-only run fails before job creation. Every live final guard remained armed with zero attempts, and no final publish control was clicked.

A tenth boundary regression stream-copied exactly 15:00 from that source. ISO BMFF reported 900.010 seconds because of final-packet rounding; the 1.113 GB HEVC file uploaded to Douyin on its first diagnostic attempt and passed exact title, description, five topic entities, settings, platform-default cover, final-button, and safety verification. After adding the 0.1-second tolerance, the production orchestrator repeated the upload in a fresh task space, reached `READY`, and passed three no-op reruns. The preflight therefore allows only 0.1 seconds above 900 for container rounding while still rejecting materially longer content. Every final guard remained armed with zero attempts.

An eleventh four-platform regression used a fresh 94 MB H.264 source and platform-default covers, then terminated the orchestrator during serialized Douyin topic insertion after every upload had completed and Xiaohongshu had reached `READY`. Fresh recovery evidence found the exact Douyin title and body plus exactly two of five committed topics; it reported only `tags` missing. The same job reused all four task-space ids, performed no video upload, rebuilt the Douyin rich editor without duplication, completed Bilibili and WeChat Channels serially, and reached four-platform `READY`. Three additional full reruns were no-op `READY` passes. Every final guard remained armed with zero attempts, and no final publish control was clicked.

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
