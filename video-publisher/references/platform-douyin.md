# Douyin Adapter Contract

Read `platform-common.md` and `ego-browser-workflow.md` first.

## Package Topics

Use the 1-5 topic entities supplied by `douyinTopics`, in order. Do not inject account campaigns or personal recurring tags that are absent from the package.

## Draft And Editor Recovery

If the upload page asks whether to continue the last unpublished video, discard that stale upload before starting the confirmed target. Use a real visible click; do not treat hidden dialog text as active.

Treat a visible `上传失败，重新上传` state as terminal evidence for the current upload attempt. Clear the file input, retry the same verified local asset once in the same run, and record the attempt count. Do not spend the whole processing timeout waiting after explicit failure. A second explicit failure is `PLATFORM_REJECTED_ASSET`; a progress state that simply stops advancing remains `UPLOAD_STALLED`.

Clear the rich description editor with a real click inside the editor followed by real `Meta+A` and Backspace, then verify it is empty before rebuilding content. Direct value replacement or DOM-only selection can leave duplicated framework state.

For the native title input, use real focus, the input element's verified full-range selection, real Backspace, and one CDP `Input.insertText` call. Do not type a Chinese title character by character, and do not append unless the field has been freshly proven empty. Retry the bounded clear-and-insert sequence only when the exact value does not persist.

## Topic Entities

For each topic:

1. Resolve the last text node in the editor and real-click its endpoint; do not use a guessed top-right coordinate.
2. Click the real `#添加话题` control.
3. Insert the bare topic through CDP `Input.insertText`.
4. Click the exact leaf suggestion row.
5. Press real ArrowRight to leave the committed entity, insert one separator space, and verify the entity before continuing.

Accept the platform’s official activity entity form and exact selected `#话题` form. Reject plain hashtag residue and duplicates.

The description may truthfully contain a requested topic word such as `HTML` or `Vercel`. To detect plain topic residue, first remove committed entity nodes and the exact expected description prefix, then inspect only the remaining tail. Do not reject a correct description merely because its prose contains a topic word. An activity entity may render without a literal `#`; `data-mention="activity"` plus the exact visible entity label is valid page evidence.

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

The landscape card may update after the completion control closes. Wait until both cards are non-empty and distinct before building receipts. A known older receipt may be repaired only when it proves both real slot uploads, both asset paths/ratios are exact, and fresh page truth exposes distinct live slots. Accept either a previously mirrored two-slot capture whose portrait still matches, or a stale landscape capture where the recorded `afterUrl` was also its `beforeUrl` and the live landscape has advanced beyond that set. Otherwise re-upload or block.

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

This path passed fresh 308 MB and 208 MB real draft runs on 2026-07-14, including recovery from an explicit upload failure, exact reconstruction of a previously corrupted rich description, a long Chinese title that initially lost a character, topic words repeated in prose, delayed landscape-cover receipt repair, checkpoint recovery, and repeated no-op verification.
