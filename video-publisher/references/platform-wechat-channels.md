# WeChat Channels Adapter Contract

Before changing the WeChat Channels adapter, read `platform-common.md` and `ego-browser-workflow.md`.

## Contents

- Wujie lifecycle
- Upload completion and draft identity
- Text, original declaration, custom covers, and required gates

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

Require cover cards and the absence of all progress signals, including percentage text, `取消上传`, `正在处理文件`, `处理中` and `生成中`, for a stable interval before the upload runner exits. If an existing target upload is in progress, wait for it; do not inject again.

## 上传中预填

当页面同时证明视频仍在上传或生成封面，并且描述、短标题控件可见时，`upload_start` 返回 `editable_uploading`。随后通过单宽 UI 队列执行 `prefill`：

1. 写入精确的视频号描述。
2. 保持短标题为空。
3. 不操作原创声明、封面、活动、定时发表和最终 `发表`。

由于视频号页面不提供可靠文件名，上传启动回执必须同时绑定包指纹和任务空间 id。只有描述已经精确匹配，或存在匹配的上传启动回执时，才允许预填。快速视频可能在预填进程启动前完成平台处理；此时仍可安全预填，但不得宣称写入发生在上传中。

## Draft Identity

The page does not expose a reliable filename. Reuse an uploaded draft only when its description exactly matches the expected package, or a package-fingerprint and task-space receipt proves this job injected or resumed that upload. Treat an already uploaded draft with an empty description and no matching receipt as `STATE_AMBIGUOUS`; never fill its metadata or declarations. A different non-empty description is foreign and must block.

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

When enabled, inspect the live cover controls. The older editor has separate personal-profile `3:4` and share-card `4:3` cards; upload both assets there. The newer editor labels one card `个人主页和分享卡片(3:4)` and has no horizontal card; upload and verify the `3:4` asset once for that unified card. Never search for or synthesize a missing `4:3` control. Use this flow for each available card:

1. Click `.vertical-cover-wrap .edit-btn` for 3:4 or `.horizon-cover-wrap .edit-btn` for 4:3.
2. If a material popover appears, use its unique visible `直接编辑` control to enter the editor. Match the parent dialog by its own heading, excluding nested crop-dialog inputs and buttons.
3. Inject the file through its CDP object id; top-document `uploadFile` cannot reach it.
4. Require the native FileList to match this slot’s filename and size. Wait for a new, fully loaded `.single-cover-uploader-wrap img` with the slot’s actual intrinsic ratio.
5. If `裁剪封面图` is visible, click its visible `确定` first.
6. Wait for the parent editor to become visible, then click its visible `确认`.
7. Keep crop confirmation scoped to the crop dialog and parent confirmation scoped to the matched parent editor.
8. Keep the lifecycle active until the editor closes and the corresponding main-card CDN URL changes.
9. Persist each URL with its asset path, native file metadata, loaded preview proof and accepted card dimensions. Independently verify each slot; on retry, skip only slots whose fresh card still matches their receipt.

The slot-specific titles `编辑个人主页卡片` and `编辑分享卡片` remain preferred. A current page variant can instead expose the same active editor as `编辑封面`; accept that fallback only when the unique visible dialog also contains `上传封面`, `取消`, and `确认`. Recovery, image-input lookup, and confirmation must search visible `.weui-desktop-dialog__wrp` roots directly instead of depending on the removed `.edit-cover-dialog` ancestor.

Only `.vertical-cover-wrap img.vertical-img-size` and, when present, `.horizon-cover-wrap img.horizon-img-size` are receipt targets. Require separate `3:4` and `4:3` receipts only when the page exposes separate cards. The unified card requires its verified `3:4` receipt.

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

实测记录和待回归边界见 `acceptance-history.md`。
