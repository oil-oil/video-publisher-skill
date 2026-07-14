# Douyin Adapter Contract

Read `platform-common.md` and `ego-browser-workflow.md` first.

## Package Topics

Use the 1-5 topic entities supplied by `douyinTopics`, in order. Do not inject account campaigns or personal recurring tags that are absent from the package.

## Draft And Editor Recovery

Before opening Ego Lite, read MP4/M4V/MOV duration from its ISO BMFF `mvhd` metadata. Reject content longer than 900 seconds with `DOUYIN_DURATION_LIMIT`, allowing only 0.1 seconds for container-metadata rounding. This boundary is real-tested: a 15:09 HEVC source produced two explicit platform upload failures, a 14:59 stream copy from the same file uploaded successfully, and an exact 15:00 stream copy reported 900.010 seconds yet also uploaded successfully. All three kept the same codec, resolution, frame rate, bitrate, and approximately 1.11 GB size. Do not auto-trim or transcode; ask for a shorter export. Do not apply this Douyin-only limit to other platforms.

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

Count only committed `[data-mention="#"]` or `[data-mention="activity"]` nodes as selected topics. A matching `#topic` string in editor text is residue, not an entity. When a readable package label contains whitespace, query the compact form (for example `AI Agent` -> `AIAgent`) and compare committed entity names after removing whitespace; retain the readable package label in evidence.

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

This path passed fresh 308 MB, 208 MB, 731 MB, and 533 MB real draft runs on 2026-07-14 and 2026-07-15, including interrupted-upload takeover without reinjection, recovery from explicit upload failures, exact reconstruction of corrupted rich descriptions, whitespace-normalized topic lookup, a long Chinese title that initially lost a character, topic words repeated in prose, delayed landscape-cover receipt repair, checkpoint recovery, and repeated no-op verification.

A later 534 MB run deleted the ready Douyin task space. The same job created a replacement numeric space, re-uploaded and rebuilt only Douyin, produced fresh distinct portrait and landscape cover receipts, preserved the other three ready drafts, and passed repeated no-op verification.

A 1.12 GB default-cover regression then isolated the 15-minute duration boundary: 15:09 failed explicitly twice, while the 14:59 near-equivalent source reached `READY` and stayed no-op `READY` for three reruns. The production preflight now blocks the known-invalid source before any browser work.

An exact 15:00 stream copy reported 900.010 seconds in ISO BMFF metadata, uploaded on the first diagnostic attempt, and passed exact metadata, five topics, settings, default-cover, final-button, and safety verification. After the 0.1-second tolerance was added, the production orchestrator repeated the upload in a fresh task space, reached `READY`, and passed three no-op reruns. The tolerance exists only for this verified container-rounding behavior.
