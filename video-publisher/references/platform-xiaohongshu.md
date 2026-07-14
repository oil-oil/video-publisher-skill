# Xiaohongshu Adapter Contract

Read `platform-common.md` and `ego-browser-workflow.md` first.

## Account Defaults

```text
short title, maximum 20 codepoints
real topic entities only
no prose body unless explicitly requested
原创声明 enabled for original videos
```

## Upload And Identity

Use the confirmed video file. Reuse an uploaded editor only when the filename or expected title identifies this package. A different active draft is a blocker; Xiaohongshu has no tested automatic quarantine flow.

Do not mutate metadata until the upload phase has fully completed and every selected platform upload runner has exited.

## Topic Entities

Clear the body editor completely, then add topics one at a time through the real suggestion panel. The sticky final-publish footer can cover the visually exposed toolbar near the viewport bottom, so a pointer click may land on the footer instead of `话题`. Invoke the exact native `button.contentBtn.topic-btn` control through its page handler to make the platform editor insert `#`, explicitly refocus the editor at its end, type only the compact topic query, and select the exact suggestion row. Do not inject `#话题` as one text operation; that can create a suggestion decoration without loading candidates on a cold page.

Under sustained browser load, the decoration may appear while the candidate panel remains empty. Verify the exact trailing query, poll the exact row for a finite extended window, and if it never appears clear the entire topic editor and retry the whole requested set. Use at most three whole-set attempts; never preserve a half-built set or accept plain text after an empty candidate response.

Spaces terminate Xiaohongshu topic input. When a readable package label contains whitespace, query the compact form (for example `AI Agent` -> `AIAgent`) and accept it only when the committed entity's `data-topic.name`, normalized without whitespace, matches the requested label. Preserve the readable package label in evidence. Never accept compact plain text as a substitute for an entity.

The verifier must prove:

- every requested topic exists as a committed entity;
- no requested topic remains as plain text;
- no malformed or duplicate entity exists;
- no stale body residue remains when the package has no prose body.

Do not insert `.tiptap-topic` HTML manually.

## Original Declaration

Open `内容设置`, enable `原创声明`, accept the agreement checkbox when a dialog appears, and click the dialog’s `声明原创` control. That dialog control is not the final publish button.

Verify the enabled toggle from a fresh inspection. A click attempt is insufficient.

## Custom Cover

Default to the platform cover unless the package explicitly enables an existing-cover upload. Use the user-provided `3:4` asset.

The tested editor entry is the real preview control under `.default.row` or `.default.column`. Open it with a real browser click, then poll for a visible `上传封面` tab instead of assuming a fixed render delay; one clean reopen is allowed when the asynchronous dialog does not materialize. Upload through the image input, choose the crop ratio matching the asset when exposed, and confirm the editor.

Accept the cover only when the main editor exposes the uploaded preview URL, normally on `ros-preview.xhscdn.com`, and no cover dialog blocks the page. Store that URL in the receipt and require the verify phase to find it again.

## Required Gates

```text
authenticated
correct draft identity
video fully uploaded
exact title
exact topic entities with no plain residue
原创声明 enabled
custom 3:4 receipt when enabled, otherwise default cover state
no blocking dialog
visible enabled 发布 button
visible enabled `发布笔记` final button; final publish not clicked
```

This path passed real draft runs on 2026-07-14 and 2026-07-15. The visible-tab polling path was fault-tested by discarding the receipt and re-uploading the same 3:4 asset. Later 731 MB and 533 MB runs survived orchestrator termination during upload without reinjection, and the 533 MB run verified whitespace-normalized topic lookup plus three no-op full reruns. Real Ego Lite crash/restart and sustained-load runs reproduced both the cold-page topic-decoration failure and an empty candidate panel. The native-command sequence plus bounded whole-set rebuild restored four exact entities and the 3:4 receipt; the four-platform job reached `READY` and remained no-op `READY` for three full reruns.
