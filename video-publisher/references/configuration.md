# Configuration And Onboarding

Keep personal defaults outside the shareable Skill directory.

## Resolution And Gate

Resolve the configuration in this order:

```text
VIDEO_PUBLISHER_CONFIG
$XDG_CONFIG_HOME/video-publisher/config.json
$HOME/.config/video-publisher/config.json
```

Run `node scripts/config.mjs status` at the start of every Skill invocation. Missing, empty, invalid, unsupported-schema, or incomplete configuration sets `onboardingRequired: true`. Do not inspect creator pages until onboarding is complete.

Warnings such as a missing source directory do not erase onboarding, but repair or explicitly override that directory before using it.

## Onboarding Conversation

Follow this order so users are never asked about platforms they do not use:

1. Ask which supported creator platforms the user actually has: Xiaohongshu, Douyin, Bilibili, and WeChat Channels. Require at least one; do not preselect all four.
2. Ask which available platforms should run by default. Propose all available platforms, but allow any non-empty subset.
3. Ask for the default local video directory.
4. Ask for shared copy style and recurring tags.
5. Ask Douyin default topics only when Douyin is available. Ask the Bilibili automatic-tag allowlist only when Bilibili is available.
6. Ask whether every video may truthfully be declared original. Keep `ask_each_run` unless the user explicitly confirms `all_videos_original`.
7. Propose check/upload concurrency `4/4` and platform-default covers. Effective concurrency never exceeds the selected platform count.
8. Summarize available platforms, default platforms, and the remaining choices. Write only after confirmation, then run `validate`.

`availablePlatforms` records the creator accounts the user says they have and can log into. `defaultPlatforms` is only the subset selected when a run does not name platforms explicitly.

## Onboarding Command

Use repeatable `--available-platform` flags for real account availability and repeatable `--platform` flags for the default subset:

```bash
node scripts/config.mjs onboard \
  --source-dir "/absolute/video/directory" \
  --available-platform xiaohongshu \
  --available-platform douyin \
  --available-platform bilibili \
  --platform xiaohongshu \
  --platform douyin \
  --recurring-tag "Tutorial" \
  --douyin-topic "Tutorial" \
  --bilibili-auto-tag "Platform generated tag" \
  --originality-policy ask_each_run
```

When `--platform` is omitted, every available platform becomes a default. For compatibility, an older command that supplies `--platform` but no `--available-platform` treats the named defaults as the available set.

Then run:

```bash
node scripts/config.mjs validate
```

Continue only after it exits successfully.

## Schema

```json
{
  "schemaVersion": 2,
  "onboarding": {
    "completed": true,
    "completedAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  },
  "locale": "zh-CN",
  "sourceDirectory": "/absolute/video/directory",
  "availablePlatforms": ["xiaohongshu", "douyin", "bilibili", "wechat_channels"],
  "defaultPlatforms": ["xiaohongshu", "douyin"],
  "contentProfile": {
    "copyStyle": "clear, conversational, specific, non-hype",
    "recurringTags": []
  },
  "declarations": {
    "originalityPolicy": "ask_each_run"
  },
  "platforms": {
    "douyin": { "defaultTopics": [] },
    "bilibili": { "allowedAutoTags": [] }
  },
  "execution": {
    "checkConcurrency": 4,
    "uploadConcurrency": 4
  },
  "cover": {
    "uploadExistingByDefault": false
  }
}
```

Validation requires:

- at least one available platform;
- at least one default platform;
- every default platform to be available;
- only supported platform identifiers.

The production publisher rejects an explicitly requested platform outside `availablePlatforms` before package or browser work. Add a new account through onboarding instead of silently opening an unconfigured creator page.

## Schema 1 Migration

Schema 1 did not distinguish account availability from defaults. It is normalized conservatively: its old `defaultPlatforms` becomes both `availablePlatforms` and `defaultPlatforms`. This never invents an account the user did not previously select. The next configuration write persists schema 2.

## Precedence And Privacy

Use this precedence:

```text
explicit current-run user instruction, within availablePlatforms
explicit content-package field
per-user configuration
generic Skill default
```

Configuration may store reusable preferences, declared platform availability, and the explicitly onboarded standing originality policy. `ask_each_run` requires `--confirm-original-rights` for each mutating run; `all_videos_original` allows the maintained workflow to apply truthful original/self-made declarations without asking again. Never infer or silently upgrade this value.

Never persist cookies, tokens, passwords, video-specific paths, or permission to click the final publish control. Platform availability describes declared account capability, not login credentials. Originality policy and final-publish authorization are separate: the latter always requires an explicit current-run instruction.
