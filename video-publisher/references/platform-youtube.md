# YouTube 平台适配约定

在修改 YouTube Studio 适配器前，同时阅读 `platform-common.md`、`ego-browser-workflow.md`、`content-package.md` 和 `cover-workflow.md`。

## 页面与阶段

入口为 `https://studio.youtube.com/`。每个任务使用独立且稳定命名的 Ego Lite task space。

```text
inspect: 读取登录、草稿身份、上传/处理/检查状态和当前步骤
upload_start: 注入或恢复目标视频；详情控件可编辑后返回
prefill: 填写标题、无链接完整说明、可选标签、受众和可编辑高级设置
upload: 等待上传、平台处理和版权检查全部完成
mutate: 修复剩余详情，上传 16:9 缩略图，走到可见性步骤
verify: 独立读取全部 gate，停在最终保存按钮前
```

不得在 `prefill` 中上传缩略图、选择最终可见性或进入最终保存动作。

## 内容包

必填：

```text
youtubeTitle 或共享 title
youtubeDescription（不得包含网页链接）
youtubeAudience: made_for_kids | not_made_for_kids
```

可选：

```text
youtubeVisibility: private | unlisted | public，默认 private
youtubeTags: 可选；不需要标签时使用空数组
youtubeCategory
youtubeLanguage
youtubePlaylist
youtubeLicense: standard_youtube | creative_commons
youtubePaidPromotion
youtubeAlteredContent
youtubeAllowEmbedding
youtubeNotifySubscribers
cover.horizontal16x9Path
```

标签不作为必填项。提供标签时必须由 YouTube 的真实 Chip 组件提交并逐项验证；空数组表示清空现有标签。说明字段不得出现 `http://`、`https://`、`www.` 或裸域名。分类比较需兼容中文界面同义显示，例如包内“科学与技术”和页面“科学和技术”。

## 身份、回执与步骤切换

草稿身份优先使用上传文件名和 YouTube `videoId`，标题只能作为辅助证据。详情页进入“视频元素 / 检查 / 可见性”后可能卸载详情 DOM，因此适配器要保存与当前 `videoId` 绑定的详情回执，并在最终验证中确认回执仍属于同一视频。

自定义缩略图仅接受 `horizontal16x9Path`。上传动作成功不等于已接受；必须等主页面缩略图出现非 `blob:`、非 `data:` 的服务器 URL，并把该 URL、文件路径、比例和 `videoId` 写入回执。

## READY 条件

必须同时满足：

```text
已登录且草稿身份精确
上传、处理和平台检查完成
标题与完整说明精确
标签 chip 集合精确，包括期望为空时页面也必须为空
儿童受众、付费推广、逼真合成内容声明精确
分类、语言、播放列表（如有）、许可精确
嵌入和订阅通知设置精确
自定义缩略图回执匹配（启用时）
可见性精确
无阻塞对话框
最终保存按钮可见且可用
finalPublishClicked: false
guardArmed: true
blockedAttempts: 0
```

最终 `保存`、`发布`、`安排时间`、`Save`、`Publish`、`Schedule` 一律不得点击。

实测记录和待回归边界见 `acceptance-history.md`。
