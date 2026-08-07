# Platform Common Contract

Read this file and the exact platform reference before changing a live adapter.

## Contents

- Ownership, locks, and final-publish safety
- Production phases and upload truth
- Draft identity and central readiness
- Receipts, blockers, text entities, and acceptance

## Ownership And Safety

One orchestrator owns all platform task spaces. Do not use sub Agents for live creator-page control.

Before reading or writing job state or starting a platform phase, acquire the account-wide publisher lock under the fixed lock root and then the job-directory `orchestrator.lock`. The publisher lock is independent of `--state-root`; direct platform diagnosis must join the same ownership token or acquire it itself. Register every spawned Ego controller as a token-bound member PID. Treat the lock as stale only when the owner and every registered member are dead. The job lock additionally protects persisted state, and a fresh lock whose owner file is still being written remains busy.

Never click a final `发布`, `发布笔记`, `发表`, `立即投稿`, `保存`, `安排时间`, `Save`, `Publish`, or `Schedule` button. Final publishing is outside this Skill. Every adapter result must leave `finalPublishClicked: false`. The shared core installs a capture-phase click/submit guard; safety passes only when `guardArmed: true` and `blockedAttempts: 0` are observed from the live page.

If Ego reports that the user controls a task space, stop the whole browser job. Do not retry, create a replacement task space, or claim it without explicit user confirmation.

## Production Sequence

Use `scripts/run-safe-platforms.sh`, which invokes `scripts/v2/publisher.mjs`.

```text
1. inspect all selected platforms in parallel
2. resolve Bilibili restore/foreign-draft state through the serial UI queue
3. start missing videos in parallel
4. for a live-proven early-edit platform, enqueue metadata prefill through the serial UI queue while upload continues
5. resume that platform's upload-completion wait
6. whenever one platform proves upload completion, enqueue its finalization immediately
7. in the single UI queue, mutate that platform and then verify it independently
8. freeze typed-blocked platforms and continue every eligible sibling without a global upload barrier
```

`upload_start` 只在上传仍活跃且对应平台的已验证控件可见时返回 `editable_uploading`。`prefill` 的范围为：抖音标题、描述、话题和同步设置；小红书标题和话题；B 站标题和标签；视频号描述和空短标题；YouTube 标题、无链接说明、可选标签、受众和上传中可编辑的高级设置。它不碰封面、原创声明、YouTube 可见性或最终步骤，也不满足 video gate。正式 `upload` 随后继续等待上传、处理和平台检查完成。所有预填、最终修复和对应验证仍通过单宽 UI 队列执行。

Ordinary typed blockers are platform-local: stop scheduling that platform after its blocker, retain its evidence, and continue successful siblings. `AUTH_REQUIRED` therefore freezes only the unauthenticated platform. `USER_CONTROL` remains global because task-space ownership requires all browser work to stop.

The browser channel is shared across task spaces. If any runner reports `INPUT_CHANNEL_BROKEN`, treat it as an invocation-wide circuit breaker: let already-started work settle, start no new quarantine/upload/mutate action, preserve any sibling that already completed rolling verification, and run only still-missing final read-only verification. An ordinary same-job retry after Ego restarts is the recovery path.

Before step 1, validate the exact local media for every selected platform. Douyin requires a valid MP4/M4V/MOV duration readable from ISO BMFF metadata and fails closed when it cannot be verified. Do not impose a local duration ceiling; an explicit creator-page rejection becomes `PLATFORM_REJECTED_ASSET`. Other valid platforms continue through the same run. If none is eligible, fail before job creation. Never silently trim, transcode, or substitute another source.

The maintained adapter runner also takes an atomic per-platform filesystem lock. A second process targeting the same platform fails before opening Ego instead of overlapping with an active upload, mutation, inspection, or verification. Stale locks from dead processes are removed automatically. This still permits the intended selected-platform parallel upload/check phases.

The three lock levels solve different races: the account-wide publisher lock serializes video jobs across state roots, the job lock protects one persisted job, and platform locks prevent accidental same-platform overlap as defense in depth. Selected-platform upload/check parallelism remains available inside the owning job.

Persist the exact task-space name alongside its numeric id. After an Ego crash, ids may be recycled for a different job; a live name mismatch is identity loss, never permission to enter that space. Select or recreate only the stored exact name, invalidate old-space receipts, and verify fresh page truth.

## Platform Phases

```text
inspect: read-only page observation
quarantine: Bilibili-only draft resolution
upload_start: 五个平台的上传启动或恢复，直到可编辑上传中或完成证据出现
prefill: 五个平台的上传中安全字段修复
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

WeChat Channels does not expose the filename. Reuse an uploaded draft when its description exactly matches the package, or when a fingerprint- and task-space-bound receipt proves that this job injected or resumed the upload. An already uploaded draft with an empty description and no such receipt is `STATE_AMBIGUOUS`; never mutate it. A different non-empty description is foreign.

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

The production runner also writes accepted cover receipts to an atomic per-job, per-platform schema-`2` checkpoint. Each checkpoint is bound to its platform, package fingerprint, and numeric task-space id. On restart, the orchestrator loads only exact matches, then performs the same fresh page verification. If Ego explicitly recreates a task space, clear both state receipts and the checkpoint even when the replacement recycles the same numeric id. Checkpoints are recovery evidence, not a substitute for `verify`.

Every completed state save keeps the prior valid `state.json` as an atomic one-generation backup. If the primary file is invalid JSON, restore only when the backup fingerprint matches the current package, preserve the corrupt primary with a timestamped filename, and re-run normal inspect/verify. If the backup is missing, invalid, or belongs to another fingerprint, fail closed before browser work.

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

Do not hide a typed blocker behind a generic “not ready” message. Authentication and explicit user control require the user, but only explicit user control stops the whole browser job. Authentication freezes its platform while eligible siblings continue. Bilibili foreign drafts route to quarantine.

## Platform Text And Tags

```text
Xiaohongshu: selected topic entities; no prose body by default.
Douyin: exact package-supplied topics as real entities, with no residue or duplicates.
Bilibili: exact requested tag chips; allow only relevant platform auto-tags declared by the adapter.
WeChat Channels: plain hashtags inside the description; short title empty by default.
YouTube: exact title and link-free full description, exact optional tag-chip set including empty, explicit audience, and verified advanced settings.
```

Never fake topic/entity HTML. Use the visible editor, real suggestion row, and a fresh entity check.

## Acceptance

Static tests must prove package/media validation, central gate evaluation, rolling scheduler advancement, platform-blocker isolation, global circuit breaking, lock contention, permissions, state/receipt recovery, and structured failure handling. Only a real creator-page run can accept selectors, topic entities, declaration dialogs, account settings, draft quarantine, upload lifecycle, and cover flows.

For a page-adapter change, verify the exact live postcondition and a no-op rerun. For scheduler, persistence, locking, shared input, task-space recovery, or receipt changes, repeat the relevant crash/restart case and the full selected-platform production regression. Never treat a one-platform diagnostic or unit test as system-level acceptance.

历史证据、当前已接受范围和待回归项统一记录在 `acceptance-history.md`；只有验收或发布维护时读取。
