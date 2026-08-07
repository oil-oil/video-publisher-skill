# 配置与首次使用

仅在首次配置、修复配置、修改默认平台或新增账号时读取。个人配置必须放在 Skill 目录之外。

## 配置检查

配置路径按以下顺序解析：

```text
VIDEO_PUBLISHER_CONFIG
$XDG_CONFIG_HOME/video-publisher/config.json
$HOME/.config/video-publisher/config.json
```

运行：

```bash
node scripts/config.mjs status
```

缺失、空文件、无效结构、旧版迁移失败或信息不完整时，输出 `onboardingRequired: true`。完成配置前不要打开创作者页面。

`warnings` 不会抹掉已经完成的配置，但发布前要修复或明确覆盖无效的源视频目录。

## 首次配置顺序

按顺序询问，避免让用户回答不使用平台的问题：

1. 用户实际拥有并可以登录哪些账号：小红书、抖音、B站、视频号、YouTube；至少选择一个。
2. 哪些已拥有平台作为默认发布平台；默认建议全部已拥有平台，也可选择非空子集。
3. 默认本地视频目录。
4. 常用文案风格和 recurring tags。
5. 仅在拥有对应账号时询问：
   - 抖音默认 topics；
   - B站允许保留的平台自动 tags；
   - YouTube 默认分类、语言和可见性。
6. 是否每个视频都能真实声明原创。没有明确确认时使用 `ask_each_run`。
7. 建议检查/上传并发为 `4/4`，默认使用平台封面；用户可以修改。

写入前用简短清单复述全部选择并取得确认。

## 写入配置

`--available-platform` 表示用户实际拥有的账号，`--platform` 表示默认发布子集，两个参数都可重复：

```bash
node scripts/config.mjs onboard \
  --source-dir "/absolute/video/directory" \
  --available-platform xiaohongshu \
  --available-platform douyin \
  --platform xiaohongshu \
  --platform douyin \
  --locale zh-CN \
  --copy-style "清楚、自然、具体、不夸张" \
  --recurring-tag "教程" \
  --douyin-topic "教程" \
  --originality-policy ask_each_run \
  --check-concurrency 4 \
  --upload-concurrency 4
```

未提供 `--platform` 时，全部 `--available-platform` 自动成为默认平台。

可选参数：

```text
--bilibili-auto-tag <精确标签>          可重复
--youtube-category <页面可见分类>
--youtube-language <页面可见语言>
--youtube-visibility <private|unlisted|public>
--upload-existing-cover-by-default
```

只传递已经向用户确认的值。随后运行：

```bash
node scripts/config.mjs validate
```

只有命令成功且 `onboardingRequired` 为 `false` 才继续发布。

## 新增平台

不要为了新增账号重新运行 `onboard`，因为它会重建完整配置。用户确认账号后使用非破坏命令：

```bash
node scripts/config.mjs add-platform douyin \
  --default \
  --douyin-topic "教程"
```

YouTube 示例：

```bash
node scripts/config.mjs add-platform youtube \
  --default \
  --youtube-category "科学与技术" \
  --youtube-language "中文（简体）" \
  --youtube-visibility private
```

省略 `--default` 时，该平台只在显式选择时使用。B站可以重复传入 `--bilibili-auto-tag`。

## 优先级和隐私

```text
当前用户指令（限 availablePlatforms）
> 内容包显式字段
> 个人配置
> Skill 通用默认值
```

- 当前请求不能静默加入 `availablePlatforms` 之外的平台。
- `all_videos_original` 只表示长期内容事实，不代表允许最终发布。
- `ask_each_run` 要求每次 mutation 前获得当前视频确认并添加 `--confirm-original-rights`。
- 配置可以保存平台可用性、文案偏好、默认 tags、原创政策、并发和封面偏好。
- 不保存 cookies、token、密码、单次视频路径或最终发布指令。
- 不手工编辑 schema；使用 CLI 写入，程序负责校验、权限和旧版本迁移。
