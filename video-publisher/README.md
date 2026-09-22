# video-publisher

将本地视频、标题和封面准备为经过核验的小红书、抖音、Bilibili、微信视频号或 YouTube 草稿，支持中断恢复和状态检查，始终停在最终发布按钮前。

## 安装

```bash
npx skills add oil-oil/video-publisher-skill
```

也可以把完整仓库地址交给 Agent：

```text
请帮我安装这个 Skill：https://github.com/oil-oil/video-publisher-skill
```

## 使用

```text
使用 $video-publisher，把 /path/to/video.mp4 准备到我选择的平台草稿里，停在最终发布前。
```

Skill 会验证精确视频、标题、封面、平台设置、草稿身份和上传回执。它不会剪辑视频、制作封面，也不会点击最终发布、保存或定时发布按钮。

## 依赖与数据边界

需要 Node.js 18 或更高版本、Ego Lite、可用的 `ego-browser` 命令，以及已经登录目标平台的创作者后台。上传只在用户明确调用发布流程后发生；平台账号配置和任务状态保存在用户配置目录，不写入 Skill 仓库。视频、标题和封面会按用户选择发送到对应平台。

## 本地检查

在本目录运行：

```bash
node --test scripts/tests/*.test.mjs scripts/v2/tests/*.test.mjs
```
