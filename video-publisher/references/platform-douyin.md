# Douyin Adapter Contract

Read `platform-common.md` and `ego-browser-workflow.md` first.

## Package Topics

Use the 1-5 topic entities supplied by `douyinTopics`, in order. Do not inject account campaigns or personal recurring tags that are absent from the package.

## Draft And Editor Recovery

If the upload page asks whether to continue the last unpublished video, discard that stale upload before starting the confirmed target. Use a real visible click; do not treat hidden dialog text as active.

Clear the rich description editor with real focus, a programmatic selection, and real Backspace. Direct value replacement can leave duplicated framework state.

## Topic Entities

For each topic:

1. Focus the description at the end.
2. Click the real `#添加话题` control.
3. Insert the bare topic through CDP `Input.insertText`.
4. Click the exact leaf suggestion row.
5. Verify a committed topic entity before continuing.

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

This path passed a fresh real draft run on 2026-07-14.
