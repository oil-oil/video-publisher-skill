# Platform Common Contract

Read this file and the exact platform reference before changing a live adapter.

## Ownership And Safety

One orchestrator owns all platform task spaces. Do not use sub Agents for live creator-page control.

Never click a final `发布`, `发布笔记`, `发表`, or `立即投稿` button without explicit authorization in the current run. Every adapter result must leave `finalPublishClicked: false`. The shared core installs a capture-phase click/submit guard; safety passes only when `guardArmed: true` and `blockedAttempts: 0` are observed from the live page.

If Ego reports that the user controls a task space, stop the whole browser job. Do not retry, create a replacement task space, or claim it without explicit user confirmation.

## Production Sequence

Use `scripts/run-safe-platforms.sh`, which invokes `scripts/v2/publisher.mjs`.

```text
1. inspect all selected platforms in parallel
2. resolve Bilibili restore/foreign-draft state through the serial UI queue
3. upload missing videos in parallel
4. wait for every upload runner to exit
5. mutate metadata, entities, declarations, settings, and covers serially
6. verify platforms independently in parallel
```

Do not pipeline UI mutations behind unfinished uploads. Live testing showed that overlapping upload processes and UI control can freeze the shared Ego input channel even across isolated task spaces.

Before step 1, validate the exact local media for every selected platform. The shared media preflight checks file existence and reads MP4/M4V/MOV duration from ISO BMFF metadata without an external `ffprobe` dependency. Douyin permits only 0.1 seconds of container rounding above its real-tested 900-second content limit; anything longer must be excluded before browser work and recorded as `PLATFORM_REJECTED_ASSET`. Other valid selected platforms continue through the same run. If no selected platform is eligible, fail before job creation. Never silently trim, transcode, or substitute another source.

The maintained adapter runner also takes an atomic per-platform filesystem lock. A second process targeting the same platform fails before opening Ego instead of overlapping with an active upload, mutation, inspection, or verification. Stale locks from dead processes are removed automatically. This still permits the intended four-platform parallel upload/check phases.

## Platform Phases

```text
inspect: read-only page observation
quarantine: Bilibili-only draft resolution
upload: target video upload and full completion wait
mutate: idempotent UI repair
verify: fresh independent observation using stored receipts
```

Removed legacy modes must not reappear: `fill`, `check-only`, `repair-only`, `upload-only`, and `quarantine-only`.

## Upload Truth

File injection is never success by itself. Treat an upload as complete only when platform-specific completion evidence is visible and no progress/failure signal remains.

Strong incomplete signals include:

```text
uploading / processing text
percentage progress
取消上传
转码中
上传失败 or network/file-format errors
```

Preview cards may appear before completion. WeChat Channels was observed showing cover cards at 50%; that state is still uploading.

WeChat Channels may also be logically focused but browser-lifecycle hidden. Its adapter must reactivate the page lifecycle while waiting so upload progress and dialog transitions can advance.

Every upload adapter must be idempotent:

- reuse a confirmed target draft;
- wait when that target is already uploading;
- do not inject the same file again merely because metadata is incomplete;
- block or quarantine when another draft owns the editor.

Every upload observation records one of these action modes:

```text
already_ready: the target was complete before the upload phase
resume_existing: the target was already uploading, so the adapter only waited
injected: this runner injected the verified local file
```

On process restart, `resume_existing` is the required evidence that an active browser upload was not reinjected. If that resumed upload later shows an explicit platform failure, end the wait with the typed platform failure; a later bounded retry may use `injected` only after the active upload has ended.

## Draft Identity

Use filename first when the platform exposes it, then confirmed title/description evidence as a fallback.

Bilibili must track both:

```text
anyUploaded: some completed video exists in the editor
targetUploaded: that completed video matches the requested filename/title
```

If `anyUploaded` is true and `targetUploaded` is false, the editor is foreign even though the target video gate is false.

WeChat Channels does not expose the filename. Reuse an uploaded draft only when the description is empty or matches the package; a different non-empty description is foreign.

## Central Ready Model

Platform adapters return observations and receipts, never `ready`. `scripts/v2/lib/model.mjs` computes readiness from required gates.

Shared gates:

```text
authenticated
draftIdentity
video
platform metadata and tag/entity gates
required declarations/settings
cover
noBlockingDialog
finalButton
safety
```

A mutation result is not enough. The final `verify` phase must re-read the page and match stored cover receipts.

The production runner also writes accepted cover receipts to an atomic per-job, per-platform checkpoint. On restart, the orchestrator loads only checkpoints whose platform and package fingerprint match the current job, then performs the same fresh page verification. Checkpoints are recovery evidence, not a substitute for `verify`.

## Cover Receipts

When custom covers are enabled, persist a receipt containing:

```text
assetPath
ratio
before URL(s)
accepted main-page URL
```

The verifier must find the accepted URL in the platform’s main cover card or preview. A successful `uploadFile` call, a modal canvas, or a temporary mirrored preview is insufficient.

For WeChat Channels, only the main `.vertical-cover-wrap img.vertical-img-size` and `.horizon-cover-wrap img.horizon-img-size` card URLs count. Avatars, video-frame URLs elsewhere on the page, data-URL crop previews, and phone-preview mirrors are not receipts.

Douyin requires separate portrait and landscape receipts with distinct accepted card URLs.

If the page already contains two distinct Douyin custom covers but neither job state nor a matching checkpoint contains receipts, do not infer that the images are the requested assets and do not blindly re-upload them. Return a typed ambiguous-state blocker.

## Typed Blockers

Use stable blocker codes from `scripts/v2/lib/model.mjs`, including:

```text
AUTH_REQUIRED
USER_CONTROL
FOREIGN_DRAFT
UPLOAD_NOT_STARTED
UPLOAD_STALLED
RISK_CONTROL
SELECTOR_DRIFT
STATE_AMBIGUOUS
INPUT_CHANNEL_BROKEN
PLATFORM_REJECTED_ASSET
ACTION_FAILED
```

Do not hide a typed blocker behind a generic “not ready” message. Only authentication and explicit user control require the user immediately; Bilibili foreign drafts route to quarantine.

## Platform Text And Tags

```text
Xiaohongshu: selected topic entities; no prose body by default.
Douyin: exact package-supplied topics as real entities, with no residue or duplicates.
Bilibili: exact requested tag chips; allow only relevant platform auto-tags declared by the adapter.
WeChat Channels: plain hashtags inside the description; short title empty by default.
```

Never fake topic/entity HTML. Use the visible editor, real suggestion row, and a fresh entity check.

## Acceptance

Unit tests may prove scheduler barriers, persistence, and gate evaluation. Only a real creator-page run can accept selectors, topic entities, declaration dialogs, settings, draft quarantine, and cover flows.

On 2026-07-14, the production scheduler passed a real four-platform run with four parallel uploads, serialized mutation, persisted task-space/cover state, interruption recovery, and four parallel fresh verifiers all `READY` before the final publish controls.
