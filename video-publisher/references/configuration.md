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

Warnings such as a missing source directory do not erase onboarding, but must be repaired or explicitly overridden before using that directory.

## Onboarding

Collect these fields, proposing the shown generic defaults where appropriate:

```text
locale: zh-CN
source directory: $HOME/Movies
default platforms: all four
copy style: clear, conversational, specific, non-hype
recurring tags: empty
Douyin default topics: empty, maximum 5
Bilibili allowed automatic tags: empty
originality policy: ask_each_run (choose all_videos_original only when every video may truthfully receive that declaration)
check/upload concurrency: 4/4
upload an existing cover by default: false
```

Save with repeatable flags:

```bash
node scripts/config.mjs onboard \
  --source-dir "/absolute/video/directory" \
  --platform xiaohongshu \
  --platform douyin \
  --platform bilibili \
  --platform wechat_channels \
  --recurring-tag "Tutorial" \
  --douyin-topic "Tutorial" \
  --bilibili-auto-tag "Platform generated tag" \
  --originality-policy all_videos_original
```

Then run `node scripts/config.mjs validate`. Continue only after it exits successfully.

## Schema

```json
{
  "schemaVersion": 1,
  "onboarding": {
    "completed": true,
    "completedAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  },
  "locale": "zh-CN",
  "sourceDirectory": "/absolute/video/directory",
  "defaultPlatforms": ["xiaohongshu", "douyin", "bilibili", "wechat_channels"],
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

## Precedence And Privacy

Use this precedence:

```text
explicit current-run user instruction
explicit content-package field
per-user configuration
generic Skill default
```

Configuration may store reusable preferences and the explicitly onboarded standing originality policy. `ask_each_run` requires `--confirm-original-rights` for each mutating run; `all_videos_original` allows the maintained workflow to apply truthful original/self-made declarations without asking again. Never infer or silently upgrade this value.

Never persist cookies, tokens, passwords, video-specific paths, or permission to click the final publish control. Originality policy and final-publish authorization are separate: the latter always requires an explicit current-run instruction.
