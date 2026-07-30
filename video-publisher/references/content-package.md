# Content Package Contract

Create one JSON file outside the shareable Skill directory for each video job. Use an absolute `videoPath`, real newline characters, and only the fields needed by selected platforms. Keep video-specific paths out of per-user configuration.

## Precedence

```text
platform-specific package field
shared package field
per-user configuration default
generic Skill default
```

`title` is always required as the shared identity. Platform-specific title fields override it only for their platform.

## Minimal Shape

```json
{
  "videoPath": "/absolute/path/video.mp4",
  "title": "Shared title",
  "xhsTopics": ["Topic A", "Topic B"],
  "douyinDescription": "Short description",
  "douyinTopics": ["Topic A", "Topic B"],
  "bilibiliDescription": "Concise introduction",
  "bilibiliTags": ["Topic A", "Topic B"],
  "wechatDescription": "Shared title\n\n#TopicA #TopicB",
  "wechatTags": ["TopicA", "TopicB"],
  "cover": {
    "uploadCustomCover": false
  }
}
```

The displayed `\n` sequences above are JSON encoding. After parsing, field values must contain real newline characters; do not store a literal backslash followed by `n` in a value.

## Supported Fields

```text
videoPath: required absolute local video path
title: required shared title and identity fallback
description: optional shared description fallback

xhsTitle | xiaohongshuTitle: optional Xiaohongshu title override
xhsTopics: required selected topic entities; labels must not contain the unsupported half-width dot `.`

douyinTitle: optional Douyin title override
douyinDescription: optional Douyin body; do not embed inline hashtags
douyinTopics: required 1-5 real topic entities

bilibiliTitle: optional Bilibili title override
bilibiliDescription: required concise description
bilibiliTags: required tag chips, maximum 10
bilibiliAllowedAutoTags: optional exact allowlist; defaults to configuration, then empty

wechatTitle | wechatChannelsTitle: optional identity title override
wechatDescription: required full description with plain hashtags
wechatTags: required hashtag names used to build and verify the description

cover.uploadCustomCover: must be exactly true to authorize existing-cover upload
cover.vertical3x4Path: absolute 3:4 image path
cover.horizontal4x3Path: absolute 4:3 image path
cover.horizontal16x10Path: absolute Bilibili 16:10 image path
```

Generic aliases are accepted for backward compatibility: `topics` or `tags` may fill some platform lists when the platform-specific list is omitted. Prefer explicit platform fields in new packages so one platform's semantics do not silently affect another.

## Platform Requirements

```text
Xiaohongshu: title <= 20 Unicode code points; at least one xhsTopics item; xhsTopics must not contain `.`
Douyin: title <= 30 Unicode code points; 1-5 douyinTopics; verifiable MP4/M4V/MOV duration <= 900.1s
Bilibili: title <= 80 Unicode code points; bilibiliDescription; 1-10 bilibiliTags
WeChat Channels: wechatDescription and wechatTags; short title remains empty by default
```

When custom covers are enabled, selected platforms require these assets:

```text
Xiaohongshu: vertical3x4Path
Douyin: vertical3x4Path + horizontal4x3Path
Bilibili: horizontal16x10Path
WeChat Channels: vertical3x4Path + horizontal4x3Path
```

Run `node scripts/check-package.mjs <platform> <package.json>` from the Skill directory for every selected platform. Do not open creator pages until every intended platform either passes or has been explicitly excluded with a typed platform-specific preflight blocker.
