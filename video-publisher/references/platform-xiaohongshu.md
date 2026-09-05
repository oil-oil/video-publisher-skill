# Xiaohongshu Adapter Contract

Before changing the Xiaohongshu adapter, read `platform-common.md` and `ego-browser-workflow.md`.

## Account Defaults

```text
short title, maximum 20 codepoints
real topic entities only
no prose body unless explicitly requested
原创声明 enabled for original videos
```

## Upload And Identity

Use the confirmed video file. Reuse an uploaded editor only when the filename or expected title identifies this package. A different active draft is a blocker; Xiaohongshu has no tested automatic quarantine flow.

视频上传仍在进行时，只要 fresh inspection 同时证明标题输入框、正文话题编辑器和原生话题按钮可见，就可通过单宽 UI 队列提前填写标题和话题。原创声明、封面和最终验证仍必须等上传完成。`prefill` 不满足 video gate，之后必须继续正式 `upload` 等待。

## Topic Entities

Clear the body editor completely, then add topics one at a time through the real suggestion panel. The sticky final-publish footer can cover the visually exposed toolbar near the viewport bottom, so a pointer click may land on the footer instead of `话题`. Invoke the exact native `button.contentBtn.topic-btn` control through its page handler to make the platform editor insert `#`, explicitly refocus the editor at its end, type only the compact topic query, and select the exact suggestion row. Do not inject `#话题` as one text operation; that can create a suggestion decoration without loading candidates on a cold page.

Under sustained browser load, the decoration may appear while the candidate panel remains empty. Verify the exact trailing query, poll the exact row for a finite extended window, and if it never appears clear the entire topic editor and retry the whole requested set. Use at most three whole-set attempts; never preserve a half-built set or accept plain text after an empty candidate response.

After an Ego restart, the selected Xiaohongshu tab may report `document.visibilityState: hidden` even though its DOM is readable. Hidden-page timer throttling can delay a real topic candidate response far beyond the bounded wait. Immediately before a serialized topic rebuild, bring the page to front, set its web lifecycle to `active`, enable focus emulation, and prove `visible` plus `document.hasFocus()`. Do not add longer blind waits to compensate for a hidden lifecycle.

Spaces terminate Xiaohongshu topic input. When a readable package label contains whitespace, query the compact form (for example `AI Agent` -> `AIAgent`) and accept it only when the committed entity's `data-topic.name`, normalized without whitespace, matches the requested label. Preserve the readable package label in evidence. Never accept compact plain text as a substitute for an entity.

Xiaohongshu topic entities do not support the half-width dot `.`. Reject any dotted `xhsTopics` label during package preflight instead of opening the creator page or silently rewriting the label. Use an explicitly chosen dot-free label such as `GPT56` when that still represents the intended topic.

The verifier must prove:

- every requested topic exists as a committed entity;
- no requested topic remains as plain text;
- no malformed or duplicate entity exists;
- no stale body residue remains when the package has no prose body.

Do not insert `.tiptap-topic` HTML manually.

## Original Declaration

Open `内容设置`, enable `原创声明`, accept the agreement checkbox when a dialog appears, and click the dialog’s `声明原创` control. That dialog control is not the final publish button.

The current switch uses `.d-switch-simulator.checked` and `.d-switch-simulator.unchecked`. Read the nested checkbox first and otherwise compare class tokens exactly; substring matching is forbidden because `unchecked` contains `checked`.

After accepting the agreement, wait for Vue to enable `声明原创` before clicking it. A disabled confirmation is a blocker, not a successful toggle. Verify both the enabled switch and the closed agreement dialog from a fresh inspection.

## Custom Cover

Default to the platform cover unless the package explicitly enables an existing-cover upload. Use the user-provided `3:4` asset.

The current editor exposes a hover-only `.cover-edit-entry`. Pointer movement can remove that element before the click event completes, so this is a live-proven native-handler exception: invoke that exact entry’s page click handler before falling back to a stable preview click. Then poll for `.main-cover-editor-modal` and prefer its direct image input; the current editor may show only `上传` and `完成`, without a separate `上传封面` tab. Choose the crop ratio matching the asset when exposed and confirm the editor.

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
one visible enabled final control labeled `发布` or `发布笔记`
final publish not clicked
```

实测记录和待回归边界见 `acceptance-history.md`。
