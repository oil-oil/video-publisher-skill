# Video Publisher

一个使用 Ego Lite 自动准备视频发布草稿的 Skill，支持：

- 小红书
- 抖音
- Bilibili
- 微信视频号

它会并行上传视频，串行填写标题、标签、原创声明与已有封面，再用独立检查确认页面状态。任务空间、封面回执和崩溃恢复 checkpoint 会被保留，方便中断后继续。

默认停在最终发布按钮前，最终发布按钮有页面级硬保护。首次 onboarding 会询问原创策略：可以每次确认，也可以在“所有视频确实均为原创”时保存为长期默认；原创策略不会带来最终发布权限。

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

建议先让 Skill 将所有平台准备到发布前，人工复核后再决定是否发布。

## License

MIT
