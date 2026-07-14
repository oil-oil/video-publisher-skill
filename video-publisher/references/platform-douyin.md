# Douyin Adapter Contract

Read `platform-common.md` and `ego-browser-workflow.md` first.

## Package Topics

Use the 1-5 topic entities supplied by `douyinTopics`, in order. Do not inject account campaigns or personal recurring tags that are absent from the package.

## Draft And Editor Recovery

If the upload page asks whether to continue the last unpublished video, discard that stale upload before starting the confirmed target. Use a real visible click; do not treat hidden dialog text as active.

Treat a visible `上传失败，重新上传` state as terminal evidence for the current upload attempt. Clear the file input, retry the same verified local asset once in the same run, and record the attempt count. Do not spend the whole processing timeout waiting after explicit failure. A second explicit failure is `PLATFORM_REJECTED_ASSET`; a progress state that simply stops advancing remains `UPLOAD_STALLED`.

Clear the rich description editor with a real click inside the editor followed by real `Meta+A` and Backspace, then verify it is empty before rebuilding content. Direct value replacement or DOM-only selection can leave duplicated framework state.

## Topic Entities

For each topic:

1. Resolve the last text node in the editor and real-click its endpoint; do not use a guessed top-right coordinate.
2. Click the real `#添加话题` control.
3. Insert the bare topic through CDP `Input.insertText`.
4. Click the exact leaf suggestion row.
5. Press real ArrowRight to leave the committed entity, insert one separator space, and verify the entity before continuing.

Accept the platform’s official activity entity form and exact selected `#话题` form. Reject plain hashtag residue and duplicates.

## Account Setting

Select `不同时发布` for the simultaneous-publication setting unless the package explicitly authorizes cross-posting. Verify the selected radio state; do not infer it from a nearby Toutiao label.

## Custom Covers

When enabled, upload both assets in this order:

```text
portrait 3:4
landscape 4:3
```

Use the platform’s portrait upload, then `设置横封面`, then complete the landscape flow. Ignore stale hidden/leave-active dialogs.

The main portrait and landscape cards must expose two distinct accepted URLs. A temporary mirrored URL in both cards is not success. Persist both receipts and require verify to match them.

The landscape card may update after the completion control closes. Wait until both cards are non-empty and distinct before building receipts. A known older receipt may be repaired only when it proves both real slot uploads, the portrait receipt still matches the live portrait card, both asset paths/ratios are exact, and the delayed live landscape card is distinct; otherwise re-upload or block.

Persist the completed two-slot receipt through the shared atomic checkpoint before returning the mutation result. If both live slots are already distinct but no matching receipt/checkpoint exists, block instead of treating URL distinctness as proof of local-asset identity.

## Required Gates

```text
authenticated
correct draft identity
video fully uploaded
exact title and body
the exact requested real topic entities, no residue or duplicates
不同时发布 selected
two distinct custom-cover receipts when enabled
no blocking dialog
visible enabled 发布 button
final publish not clicked
```

This path passed a fresh 308 MB real draft run on 2026-07-14, including recovery from an explicit upload failure, exact reconstruction of a previously corrupted rich description, and repeated no-op verification.
