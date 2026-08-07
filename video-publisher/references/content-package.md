# 内容包约定

每个视频任务创建一个 JSON 文件，放在 Skill 目录之外。只写所选平台需要的字段。

优先级：

```text
平台专用字段 > 共享字段 > 用户配置 > 通用默认值
```

`videoPath` 必须是本地绝对路径，`title` 必须存在。JSON 中的 `\n` 编码在解析后必须成为真实换行，不能把反斜杠和字母 `n` 当作正文保存。

## 五平台基础示例

```json
{
  "videoPath": "/absolute/path/video.mp4",
  "title": "统一标题",
  "xhsTopics": ["主题", "工具", "教程"],
  "douyinDescription": "简短正文",
  "douyinTopics": ["主题", "工具", "教程"],
  "bilibiliDescription": "简洁简介",
  "bilibiliTags": ["主题", "工具", "教程"],
  "wechatDescription": "统一标题\n\n#主题 #工具 #教程",
  "wechatTags": ["主题", "工具", "教程"],
  "youtubeDescription": "完整说明",
  "youtubeTags": [],
  "youtubeAudience": "not_made_for_kids",
  "youtubeVisibility": "private",
  "cover": {
    "uploadCustomCover": false
  }
}
```

删掉未选择平台的字段即可。共享 `description` 和 `tags` 可以作为部分平台的后备值，但新内容包优先写平台专用字段，避免一个平台的语义意外影响另一个平台。

## 平台字段

### 小红书

```text
xhsTitle | xiaohongshuTitle：可选标题覆盖
xhsTopics：至少一个真实话题标签，不得包含半角点 `.`
```

标题加权长度不得超过 20：半角英文标点和 ASCII 空格算 0.5，其余 Unicode code point 算 1。

### 抖音

```text
douyinTitle：可选标题覆盖，最多 30 个 Unicode code point
douyinDescription：可选正文；不要在正文内写 hashtag
douyinTopics：1–5 个真实话题实体
```

视频必须是能从 ISO BMFF 元数据读取时长的 MP4、M4V 或 MOV。本地不设置时长上限，页面明确拒绝时才记录平台素材 blocker。

### B站

```text
bilibiliTitle：可选标题覆盖，最多 80 个 Unicode code point
bilibiliDescription：必填简介
bilibiliTags：1–10 个标签 chip
bilibiliAllowedAutoTags：允许保留的平台自动标签；默认空数组
```

### 视频号

```text
wechatTitle | wechatChannelsTitle：可选身份标题
wechatDescription：必填完整描述，通常为标题、空行和普通 hashtag
wechatTags：必填 hashtag 名称
```

短标题默认保持为空。

### YouTube

```text
youtubeTitle：可选标题覆盖，最多 100 个 Unicode code point
youtubeDescription：必填完整说明，不得含网页链接，最多 5000 个 code point
youtubeTags：可选；不需要标签时使用 []，逗号序列化后最多 500 字符
youtubeAudience：made_for_kids | not_made_for_kids，必填
youtubeVisibility：private | unlisted | public，默认来自配置，最终默认 private
youtubeCategory：可选，默认来自配置
youtubeLanguage：可选，默认来自配置
youtubePlaylist：可选精确播放列表名称
youtubeLicense：standard_youtube | creative_commons，默认 standard_youtube
youtubePaidPromotion：boolean，默认 false
youtubeAlteredContent：boolean，默认 false
youtubeAllowEmbedding：boolean，默认 true
youtubeNotifySubscribers：boolean，默认 true
```

## 已有封面

只有 `cover.uploadCustomCover` 明确为 `true` 才授权上传已有封面。路径字段：

```text
cover.vertical3x4Path：小红书；抖音和视频号的竖版槽
cover.horizontal4x3Path：抖音和视频号的横版槽；B站首页主封面
cover.horizontal16x9Path：YouTube 缩略图；可选 B站个人空间伴随图
```

启用后所选平台必须提供完整映射：

```text
小红书：3:4
抖音：3:4 + 4:3
B站：4:3
视频号：3:4 + 4:3
YouTube：16:9
```

详细回执流程见 `cover-workflow.md`。

## 校验

标准生产入口会在创建任务和打开页面前统一校验全部所选平台，不需要逐个平台重复运行命令。

只有单独排查内容包时才运行：

```bash
node scripts/check-package.mjs <platform> <package.json>
```

校验失败时修复内容包，或明确排除对应平台；不要绕过校验打开创作者页面，也不要自动改写 topic、裁剪、转码或替换视频。
