---
name: video-publisher
description: Prepare and automate video drafts for Xiaohongshu, Douyin, Bilibili, and WeChat Channels with Ego Lite. Use for first-run onboarding, per-user available/default platform selection, video intake, platform copy and tags, parallel upload scheduling, draft recovery, original declarations, optional upload of provided cover assets, custom publishing-workflow extensions, and verification before final publish.
---

# Video Publisher

Prepare one confirmed video package and drive selected creator platforms to a verified draft state. Use Ego Lite for all live creator-page work.

## Configuration And Onboarding

At the start of every invocation, before inspecting a video or opening a browser, run:

```bash
node scripts/config.mjs status
```

If `onboardingRequired` is `true`, stop the publishing flow and onboard the user. Ask first which supported creator platforms the user actually has; require at least one and never assume all four. Then ask which of those available platforms should run by default, proposing all available platforms as the default subset. Ask for Douyin topics only when Douyin is available and Bilibili automatic tags only when Bilibili is available. Collect the source directory, shared copy/tag preferences, and whether every video may truthfully be declared original; keep concurrency `4/4` and platform cover as proposed defaults unless the user changes them. Summarize the choices before writing. Save available accounts with repeatable `--available-platform` flags and defaults with repeatable `--platform` flags, run `validate`, and continue only when `onboardingRequired` is `false`.

Configuration is per user at `$XDG_CONFIG_HOME/video-publisher/config.json`, or `$HOME/.config/video-publisher/config.json`. `VIDEO_PUBLISHER_CONFIG` overrides the path. Never put a user's configuration inside the shareable Skill folder.

An explicit current request overrides the package; explicit package fields override configuration defaults. A current request may select any configured available platform, but it cannot silently add an unavailable platform: update onboarding and confirm that account first. The onboarding configuration may persist the user's truthful standing originality policy and declared platform availability, but never cookies, credentials, video-specific paths, or final-publish authorization. Read `references/configuration.md` for the schema and onboarding command.

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

The publisher first acquires one state-root publisher lock, then one atomic job-directory lock, before any state write or browser phase. Only one video job may control the shared creator accounts at a time; a second job or duplicate invocation must fail immediately while the owner continues. Locks whose recorded PID is dead are stale and may be removed automatically. Keep the separate platform locks as defense in depth. This global job serialization does not reduce the intended four-platform parallelism inside the owning video job.

Schedule by resource type:

```text
read-only inspect: parallel, default 4
video upload and platform processing wait: parallel, default 4
metadata, topic, declaration, setting, and cover mutation: serial, exactly 1
final verification: parallel, default 4
```

The upload phase is a barrier: no UI mutation starts until every selected upload runner has exited. An upload runner may exit only after the platform proves completion. A preview card alone is insufficient when progress text, a percentage, processing text, or `取消上传` remains visible.

Treat the Ego input channel as shared failure state. If any parallel phase returns `INPUT_CHANNEL_BROKEN`, wait for the other runners to exit, then skip every remaining quarantine, upload, and mutation in that invocation. Run only final read-only verification so the persisted job records page truth; resume through the ordinary same-job command after Ego restarts.

Custom-cover dialogs also use the single UI queue. Isolated task spaces do not make concurrent clicking safe.

Accepted cover receipts are written to atomic, fingerprint-bound checkpoints inside the job directory before an adapter returns. This closes the crash window between a successful creator-page mutation and the orchestrator recording its result. A resumed run still has to match the checkpoint against fresh page truth.

Job state also keeps a one-generation atomic backup. If `state.json` is invalid JSON, restore only a backup whose package fingerprint matches, preserve the corrupt primary as `state.corrupt-<timestamp>.json`, and then re-inspect every platform. Never turn restored state into `READY` without fresh page verification.

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

Use the extension workflow to turn the request into an idempotent `inspect -> action -> verify` step backed by real creator-page evidence. Classify the behavior as a generic adapter repair, an explicit package/config option, or a private per-user default before choosing where it belongs. Never encode personal account data in the shareable Skill, and never let a customization bypass final-publish authorization, truthful originality policy, task-space ownership, or the shared safety gate.

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

Use the onboarded configuration as defaults, then confirm the source video, platform selection from `availablePlatforms`, title, tags, any unresolved rights/declaration status, and existing-cover upload intent before browser automation. Newlines in JSON fields must be real newline characters.

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

1. Load configuration and complete onboarding, including available and default platform selection, when required.
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

A twelfth cold-start regression used a real 45 MB, 27-second, 120fps MOV with two whitespace-bearing topic names and platform-default covers. All four platforms accepted the MOV and reached `READY`; three full reruns were no-op passes. Deliberately corrupting the completed job's `state.json` first reproduced a fatal JSON parse. After adding atomic state backups, a second corruption was preserved as a timestamped artifact, the matching backup restored all four numeric task-space ids, and fresh inspection/verification returned four-platform `READY` with no upload or UI mutation. A further no-op rerun remained `READY`; all final guards stayed armed with zero attempts.

A thirteenth regression started two production orchestrators against that same ready four-platform job at the same instant. With only platform locks, each process acquired a different subset, both failed, and the shared job was left `running`. The new job-level atomic lock made the same real double launch deterministic: one invocation was refused before state/browser work while the owner completed four-platform `READY`. A deliberately planted dead-PID job lock was then removed automatically, the job remained no-op `READY`, and the lock was released after completion.

A fourteenth regression started two different ready four-platform video jobs at the same instant. Per-job locks alone allowed them to split platform ownership: one failed on a platform lock and was left `running`. The new state-root publisher lock made the real retry deterministic: one job was refused in 0.38 seconds before state or browser work, its existing `READY` state hash and timestamp remained unchanged, and the owner completed four-platform `READY`. The global lock disappeared on normal exit. A deliberately planted dead-PID global lock was then removed automatically; the next job stayed no-op `READY`, all final guards remained armed with zero attempts, and the lock was released after completion.

A fifteenth cold-start regression used a real 322 MB, 5:40 subtitled MP4 with custom 3:4 and 4:3 covers. After all four upload runners had acquired their platform locks, the entire production process group received `SIGKILL`. This left a real `running` state plus dead-owner publisher, job, and four platform locks. The normal same-job command removed every stale lock without manual cleanup, reused task-space ids 75/74/72/73, and all four upload adapters reported `resume_existing` rather than reinjecting the file. Serialized metadata, topic/tag, original declaration, and custom-cover repair then reached four-platform `READY`; exact per-slot cover receipts passed fresh verification. Three consecutive full reruns were pure no-op `READY` passes, every final guard remained armed with zero attempts, and no final publish control was clicked.

A sixteenth resilience regression killed the entire Ego Lite browser process group twice while reusing that same real job. The pre-fix crash exposed unstructured runner failure, stale receipts after task-space recreation, a Douyin body insertion misrouted into the title, and a Bilibili cover completion click timeout. Receipt checkpoints are now schema `2` and bound to the exact live task space; an explicit recreation signal invalidates both state and checkpoint receipts even when Ego recycles the same numeric id. Ego process loss returns retryable `INPUT_CHANNEL_BROKEN` observations rather than a fatal parse error. The post-fix crash produced that structured blocker for all four final verifiers with upload and UI mutation both `none`; ordinary recovery then rebuilt the missing spaces, reused Bilibili's restored local target without a video upload, safely repaired the known Douyin title/body misroute, and rebuilt only invalidated cover receipts. A final cold-page Xiaohongshu failure proved that its sticky publish footer can cover the visible topic toolbar: the adapter now invokes the platform's native topic command, refocuses the editor, types only the topic query, and selects the exact real suggestion. The repaired job reached four-platform `READY` and passed three further full no-op reruns. Every final guard remained armed with zero attempts, and no final publish control was clicked.

A seventeenth resilience regression killed Ego Lite while a real 322 MB four-platform job still had active uploads. The first post-crash invocation proved the shared-channel boundary; the repaired orchestrator emitted `UI serial: none (input channel broken)` and performed no mutation after the structured blocker. Ego then recycled numeric ids `1` and `2` for another job. Stable-name identity rejected both collisions, recreated or selected only the recorded task-space names, and recovered the intended four drafts. Sustained browser load also reproduced empty topic-candidate panels: Xiaohongshu now retries an exact whole-topic rebuild with finite waits, while Douyin preserves a proven ordered prefix of committed entities, deletes only a trailing failed query one real Backspace at a time, and retries only the missing topic. The same failed pages recovered all titles, descriptions, exact tags/topics, original declarations, custom covers, and safety gates to four-platform `READY`; three full reruns were pure `inspect`/`verify` no-ops. No final publish control was clicked.

An eighteenth cold-start regression used a different 201 MB source whose video and both cover filenames contained a trailing-space-style boundary before their suffixes. Four parallel uploads used the exact paths, Bilibili quarantined the prior foreign draft, and Xiaohongshu, Bilibili, and WeChat Channels reached `READY` on their first serialized mutations. Douyin exposed a new zero-entity editor shape: its exact description and first topic query shared one framework text node, so the initial tail detector treated the entire description as the query and a failed clear left `#A`. The adapter now isolates the suffix after the exact description and treats zero committed entities as a valid ordered prefix. The same damaged page proved cleanup `#A -> # -> empty`, committed all five requested entities, uploaded distinct 3:4 and 4:3 covers, and returned four-platform `READY`. Three full reruns were pure no-op `READY` passes, all final guards remained armed with zero attempts, and no final publish control was clicked.

A nineteenth resilience regression used an independent process monitor to terminate Ego Lite one second after the real Douyin `mutate` runner started. Xiaohongshu had reached `READY`; Douyin returned structured `INPUT_CHANNEL_BROKEN`; Bilibili and WeChat Channels recorded no mutation phase at all, proving the invocation-wide circuit breaker during serialized UI work. After Ego restarted, the ordinary same-job command re-read the empty replacement pages, reused Bilibili's matching local draft without a video upload, and rebuilt only lost browser state. Recovery then exposed why Xiaohongshu candidates could appear long after bounded retries: the readable task-space tab still had `document.visibilityState: hidden`, and its timers were throttled. The topic adapter now activates and focuses the page immediately before serialized topic repair. The same failed page committed all four topics on its first rebuild, restored its 3:4 receipt, and returned four-platform `READY`; three full reruns were inspect/verify-only no-ops. Every final guard remained armed with zero attempts, and no final publish control was clicked.

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
