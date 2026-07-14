# Existing Cover Upload Contract

Use this file only when the user explicitly asks to upload cover files that already exist. This Skill does not create, generate, redesign, or edit cover artwork.

## Package Fields

Only include the ratios required by the selected platforms. Recommended dimensions are 1080 × 1440 for 3:4 and 1440 × 1080 for 4:3.

```json
{
  "cover": {
    "uploadCustomCover": true,
    "vertical3x4Path": "/absolute/path/cover-3x4.png",
    "horizontal4x3Path": "/absolute/path/cover-4x3.png"
  }
}
```

`uploadCustomCover` must be explicitly true. Merely providing paths does not authorize upload.

Mapping:

```text
Xiaohongshu: vertical 3:4
Douyin: vertical 3:4 and horizontal 4:3
Bilibili: horizontal 4:3
WeChat Channels: vertical 3:4 and horizontal 4:3
```

Run `scripts/check-package.mjs` for every selected platform before opening creator pages.

## Receipt State Machine

For each mapped slot:

1. Record main-page cover URL(s) before opening the editor.
2. Open the platform’s real cover editor.
3. Upload the mapped asset through the editor’s existing image input.
4. Complete the platform-specific crop/save flow.
5. Wait for processing text to end and the editor to close.
6. Read the accepted main-page cover URL/card.
7. Persist `assetPath`, ratio, before URLs, and accepted URL.
8. Require the independent verify phase to find that receipt again.

Never treat `uploadFile` success, a modal canvas, or an intermediate preview as acceptance.

## Platform Evidence

```text
Xiaohongshu: 3:4 asset; accepted main preview commonly uses ros-preview.xhscdn.com.
Douyin: both main cover cards must have distinct accepted URLs.
Bilibili: editor must close; accepted main `.cover-img` uses archive.biliimg.com or biliimg.com.
WeChat Channels: both the personal-profile 3:4 and share-card 4:3 URLs must change, each editor must close, and both accepted URLs must survive an independent verify process. Ignore data-URL crop previews and phone-preview mirrors.
```

Existing-cover upload operations remain in the single UI queue.
