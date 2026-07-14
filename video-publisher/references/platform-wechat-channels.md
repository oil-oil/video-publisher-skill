# WeChat Channels Adapter Contract

Read `platform-common.md` and `ego-browser-workflow.md` first.

## Current Acceptance Boundary

As of 2026-07-14, the platform-specific path passed real runs for upload completion, exact description, empty short title, original declaration, 3:4 personal-profile and 4:3 share-card custom covers, no blocking dialog, enabled `发表`, and `finalPublishClicked: false`. Stale cover-editor recovery was also exercised by a real retry.

The remaining system-level boundary is the four-platform production-orchestrator regression described in the root Skill.

## Wujie Lifecycle

The creator editor can be focused while `document.visibilityState` remains `hidden`. That state left `页面初始化中` and fade transitions stuck. Before readiness checks and during upload/dialog waits, call:

```text
Page.bringToFront
Page.setWebLifecycleState { state: active }
Emulation.setFocusEmulationEnabled { enabled: true }
```

Readiness requires the initialization toast to be gone and the real video input to exist, or an already uploaded editor to be proven. Perform at most one gentle reload after the initial activation window.

## Wujie Upload

Search `document` and all open shadow roots for the hidden video input whose `accept` contains `video`. Obtain the input’s CDP object id and use `DOM.setFileInputFiles` with the confirmed source path.

`页面初始化中` is a warning, not sufficient truth by itself. Do not inject while it is present merely because a stale input node exists.

After injection, dispatch one fallback change event only if no upload state appears. Never repeatedly inject the same file.

## Upload Completion

Cover cards can appear before upload completes. A real run displayed:

```text
50%
取消上传
封面预览
个人主页卡片
分享卡片
```

That state is uploading, not ready.

Require cover cards and the absence of all progress signals, including percentage text and `取消上传`, for a stable interval before the upload runner exits. If an existing target upload is in progress, wait for it; do not inject again.

A 533 MB fault test terminated the orchestrator during the Wujie upload. The same task space resumed with action mode `resume_existing`, reactivated the page lifecycle while waiting, completed without reinjection, and later reached `READY` with both cover slots verified.

A later 534 MB run deleted the ready WeChat Channels task space. The same job created a replacement numeric space, re-uploaded and rebuilt only WeChat Channels, generated fresh vertical and horizontal cover receipts, preserved the other three ready drafts, and passed repeated no-op verification.

## Draft Identity

The page does not expose a reliable filename. Reuse an uploaded draft only when the description is empty or matches the expected package. A different non-empty description is foreign and must block.

## Text Defaults

Use the description field as:

```text
TITLE

#TOPIC_1 #TOPIC_2 #TOPIC_3
```

Leave `短标题` empty unless explicitly requested.

## Original Declaration

Enable `声明原创`. If an agreement dialog appears, accept its checkbox and click the dialog’s `声明原创` action. This is not the final `发表` control.

The adapter must verify the checked state after the dialog closes.

## Custom Cover

When enabled, upload both user-provided assets. Use the same flow first for the personal-profile `3:4` card and then for the share-card `4:3` card:

1. Click `.vertical-cover-wrap .edit-btn` for 3:4 or `.horizon-cover-wrap .edit-btn` for 4:3.
2. In the active edit-cover dialog, locate its existing image file input across open roots.
3. Inject the file through its CDP object id; top-document `uploadFile` cannot reach it.
4. Wait for `.single-cover-uploader-wrap img` to show a real preview.
5. If `裁剪封面图` is visible, click its visible `确定` first.
6. Wait for the parent editor to become visible, then click its visible `确认`.
7. On the share-card path, handle the intermediate `使用此素材` confirmation before the parent `确认` control.
8. Keep the lifecycle active until the editor closes and the corresponding main-card CDN URL changes.
9. Persist each URL with its absolute asset path and ratio, then require a separate verify process to find both again.

Only `.vertical-cover-wrap img.vertical-img-size` and `.horizon-cover-wrap img.horizon-img-size` are receipt targets. Require separate `3:4` and `4:3` receipts.

If a prior attempt leaves `编辑个人主页卡片` or `裁剪封面图` open, safely cancel that known editor, wait for it to close, and retry once. Do not misclassify an unrelated cover dialog as an original-declaration failure.

## Required Gates

```text
authenticated
correct draft identity
upload fully complete, with no percentage or 取消上传
exact description and hashtags
short title empty
original declaration enabled
custom 3:4 and 4:3 receipts when enabled
no blocking dialog
visible enabled 发表 button
final publish not clicked
```
