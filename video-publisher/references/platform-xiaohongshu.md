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

Clear the body editor completely, then add topics one at a time through the real suggestion panel.

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

The tested editor entry is the real preview control under `.default.row` or `.default.column`. Upload through the image input, choose the crop ratio matching the asset when exposed, and confirm the editor.

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
final publish not clicked
```

This path passed a real draft run on 2026-07-14.
