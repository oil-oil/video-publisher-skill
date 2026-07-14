# Video Publisher

一个使用 Ego Lite 自动准备视频发布草稿的 Skill，支持：

- 小红书
- 抖音
- Bilibili
- 微信视频号

它会上传视频、填写标题和标签、处理原创声明、上传已有封面并验证页面状态。默认停在最终发布按钮前，不会擅自发布。

## 依赖

- Ego Lite 与可用的 `ego-browser` 命令
- Node.js 18+
- 已登录对应平台的创作者账号

## 安装

```bash
git clone https://github.com/oil-oil/video-publisher-skill.git
cp -R video-publisher-skill/video-publisher ~/.codex/skills/
```

Claude Code 用户可以复制到 `~/.claude/skills/`。

## 使用

在对话中调用 `$video-publisher` 并提供本地视频路径。首次使用会进入 onboarding，配置默认素材目录、平台和标签偏好。

个人配置保存在 `~/.config/video-publisher/config.json`，不会写入 Skill 目录。

## License

MIT
