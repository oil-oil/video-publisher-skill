# Bilibili Adapter Contract

Read `platform-common.md` and `ego-browser-workflow.md` first.

## Draft Resolution

Bilibili is the only platform with a tested automatic quarantine path.

Treat `本地浏览器存在…未提交的视频 / 继续编辑` as unresolved identity:

1. Click `继续编辑`.
2. If the resumed filename or expected title matches the package, reuse the target.
3. If another video owns the editor, click `存草稿`.
4. Return to the upload URL and verify that the page is clean before uploading the target.

The detector must distinguish:

```text
anyUploaded: a completed video exists
targetUploaded: the requested filename/title owns that completed video
```

Do not equate “target not found” with “no active upload”. This false equivalence previously skipped foreign-draft quarantine.

Both same-target resume and a real foreign-draft save/clean-page flow passed live testing. A later task-space-loss test recreated the Bilibili space, resumed the same target with no video upload, and repaired only the page state that did not survive the restore.

## Metadata And Declarations

Set and independently verify:

```text
exact title
exact description
内容无需标注
内容为自制：未经作者允许，禁止转载
```

Bilibili may show the self-made value in the input while keeping `内容无需标注` in selected component state. Require both observations.

Preserve the current relevant partition unless a confirmed package requires another one. The current production ready model does not claim that it automatically chooses a partition.

## Tags

Read chips directly from `.label-item-v2-container`, not a broad body-text segment.

Remove unexpected tags through the chip component’s real close behavior. Keep only requested tags plus any exact automatic tags supplied by `bilibiliAllowedAutoTags`. The default allowlist is empty; do not embed content-category defaults in the adapter.

```text
"bilibiliAllowedAutoTags": []
```

Remove unexpected chips one at a time and wait for Vue state to settle after each close. Closing several chips synchronously from one stale DOM snapshot causes only the last batched removal to persist; this was reproduced with the automatic `学习`, `课程`, and `经验分享` chips.

Add missing tags one at a time using real focus, CDP text insertion, and real Enter. Wait for platform validation and a visible chip before continuing.

Critical rule: if the tag input is already empty, do not press Backspace; Bilibili interprets it as deleting the last committed chip.

The final tag set must contain every requested chip, no duplicate/malformed chip, and no unapproved extra chip.

## Custom Cover

Use the user-provided `4:3` asset only when enabled.

Upload through the active `.bcc-upload-wrapper` image input. The cover editor’s final control can be a `div.button.submit`, not a native button. Wait until its exact label becomes `完成`, click it through the real input channel, and require the editor to close.

On the currently tested editor, a correctly targeted real selector click may still be swallowed by the framework. First attempt the real click. If the same visible `封面制作` dialog and the same enabled `.button.submit` control remain after the settle window, the adapter may invoke that exact scoped control through the page framework once. Record `frameworkFallbackUsed`, then still require the dialog to close and the accepted main-page cover URL to appear. Never broaden this fallback to text search or to any final-publish control.

Read the accepted main cover from `.cover .cover-content .cover-img`. Persist its `archive.biliimg.com` or `biliimg.com` URL as the receipt. The same content-addressed URL may remain when re-uploading the identical file, so proof requires the upload action, enabled completion control, closed editor, and accepted main-page URL together.

A matching checkpoint is only expected identity evidence. If a restored same-target editor does not expose the checkpoint URL on the live main cover, do not mark the cover ready. Re-upload the exact asset, record the new action receipt, and independently verify the main card even when the content-addressed CDN URL is unchanged.

## Required Gates

```text
authenticated
correct target or clean quarantined state
video fully uploaded
exact title and description
exact requested tag chips plus only allowed auto-tags
both declaration states
custom 4:3 receipt when enabled
no blocking dialog
visible enabled 立即投稿 button
final publish not clicked
```

The complete draft path passed real testing on 2026-07-14, including foreign-draft quarantine, the scoped cover-completion fallback, checkpoint recovery, and repeated no-op verification.
