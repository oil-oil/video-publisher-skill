---
name: video-publisher
description: "将本地视频、标题和封面准备为小红书、抖音、B站、视频号或 YouTube 的已验证草稿，支持账号配置、恢复上传和草稿检查。用户要求准备或管理发布草稿时使用，停在最终发布按钮前；不用于视频剪辑、封面制作、公众号长文或一般平台建议。"
---

# 视频发布

确认一个视频内容包，交给维护好的程序完成多平台上传、表单修复和独立验证，最后把草稿留在最终发布按钮前供用户检查。

## 必须遵守

- 将本文件所在目录记为 `SKILL_DIR`，所有相对命令都在该目录运行。
- 日常发布只调用维护好的生产入口，不手工拆分平台阶段，也不自行控制创作者页面。
- 不点击任何平台的最终发布、保存或定时发布按钮。页面守卫只是最后一道保护，不是可试点的按钮。
- 只有配置声明所有视频均为原创，或用户明确确认当前视频拥有原创权利时，才允许勾选原创、自制等声明；不得从视频内容自行推断。
- 使用用户确认的精确视频和封面路径，不静默替换、裁剪、转码或改用相似文件。
- 让程序判断上传完成、草稿身份、字段状态、回执和 `READY`；不要把“执行过动作”解释为成功。
- 当前请求与同一任务已经确认的标题、平台、封面意图和原创依据直接继承，不重复询问。做封面后继续发布的完整授权包含上传本次已生成封面；按 `references/intake-workflow.md` 交接。
- 开始前区分新建草稿、恢复原草稿、替换草稿封面和修改已发布内容。原稿换源不等于另发一条；本生产入口不支持已发布内容换源，不能用新建或重发冒充。

## 标准发布流程

1. 运行配置检查：

   ```bash
   node scripts/config.mjs status
   ```

2. 若 `onboardingRequired` 为 `true`，读取 `references/configuration.md`，完成配置并执行 `validate`；配置完成前不打开创作者页面。
3. 读取 `references/intake-workflow.md` 和 `references/content-package.md`，确认：
   - 精确本地视频；
   - 从 `availablePlatforms` 中选择的平台；
   - 标题和 tags/topics；不要写平台长文案，平台若必填描述就用标题或标题加 tags；
   - 小红书标题按加权长度不超过 20：所有 ASCII 字符算 0.5，其他 Unicode 字符算 1；未超限时保留原始标题；
   - 当前视频的原创权利依据；
   - 是否上传用户已经提供的封面。
4. 将确认后的内容包 JSON 写到 Skill 目录之外。只有明确上传已有封面时才读取 `references/cover-workflow.md`。
5. 直接运行生产入口；它会在打开页面前统一完成配置、内容包、媒体和封面校验：

   ```bash
   scripts/run-safe-platforms.sh <package.json> [task-suffix] [platform...]
   ```

   命名参数：`--package`、`--platform` / `--platforms`、`--task-suffix`、`--job-id`、`--operation`、`--space-name`、`--reuse-space`、`--cleanup-only`。默认新任务开新 Ego 空间；中断恢复复用已记录空间。草稿就绪后**留下本次空间**，方便你在发布按钮前检查并手动点发布。只清过期采集空间和已退役的旧空间。要在就绪后立刻关掉本次空间，才加 `--close-on-complete`。

   已经 `READY` 的 Job 默认拒绝再次创建草稿。用户明确要重发时使用全新 Job，并加 `--operation repost --confirm-new-copy`。替换已 `READY` 且尚未发布的草稿封面时，读取 `references/cover-workflow.md`，沿用原 `--job-id`，只修改封面路径并加 `--operation replace-cover`；程序会复用原任务空间，不重新上传视频。标题、正文、tags、视频或其他字段发生变化时不得冒充封面替换。

   同一个多平台 Job 只恢复或重开部分平台时，必须沿用原 `--job-id` 并加 `--no-cleanup-stale-spaces`，防止清理影响未选平台的待发布页面；命令若报告关闭了当前 Job 的未选平台空间，不得宣称页面仍可见，必须恢复对应平台。

   平台参数省略时使用配置中的默认平台。仅在用户确认当前视频原创权利后追加 `--confirm-original-rights`。
6. 读取命令最后输出的结构化摘要：
   - `ready: true`：所有所选平台已验证。草稿页留着，你检查后自己点发布；
   - `ready: false`：逐个平台报告 `blocker`、`missing` 和 `evidencePath`，不要笼统宣称失败或成功；
   - `USER_CONTROL`：立即停止全部浏览器工作，只有用户明确要求继续后才能重试；
   - `INPUT_CHANNEL_BROKEN`：立即说明受影响平台和缺失项，保留现有任务。通道未恢复时不重复跑生产命令；确认 Ego Lite 恢复后再沿用原 `--job-id` 和内容包，只恢复未完成平台；
   - 其他 blocker 只处理对应平台，不回退或重做已经 `READY` 的平台。

同一个内容包的中断恢复仍使用同一生产命令和 `--job-id`。程序负责复用任务状态、平台空间和已验证回执。

交付时区分“本地封面已生成”“平台已接收封面”“草稿 READY”和“用户确认已发布”。历史 READY 不能证明页面仍在；用户报告页面缺失时先检查原任务，不能直接报完成或默认重传。已由用户发布的平台不再恢复上传。

只读检查使用：

```bash
scripts/run-safe-platforms.sh <package.json> [task-suffix] [platform...] --inspect-only
```

## 按需读取

只读取当前任务需要的文档：

- 首次配置、修改默认平台或新增账号：`references/configuration.md`
- 选择视频、检查字幕、拟定发布内容：`references/intake-workflow.md`
- 创建或修复内容包 JSON：`references/content-package.md`
- 上传用户已有封面：`references/cover-workflow.md`
- 查看命令参数、任务状态或单平台诊断入口：`references/scripts.md`
- 诊断或修改页面适配器：先读 `references/platform-common.md`、`references/ego-browser-workflow.md`，再按平台读取 `references/platform-xiaohongshu.md`、`references/platform-douyin.md`、`references/platform-bilibili.md`、`references/platform-wechat-channels.md` 或 `references/platform-youtube.md`
- 自定义发布步骤：先读 `references/customizing-workflows.md`，再按其中路由读取共享和平台文档
- 更新实测范围或发布维护结论：`references/acceptance-history.md`

不要为普通发布加载适配器、调度、锁、恢复或历史验收文档。

## 维护边界

静态审查、文档修改和本地测试不读取个人配置，也不打开 Ego Lite。只有维护任务进入真实页面诊断时，才执行配置检查并遵循页面工作流。

页面适配器的改动必须以真实创作者页面证据和无操作复跑验收；调度、持久化、锁、任务空间、共享输入或回执改动还需要对应的崩溃恢复与完整生产回归。历史结果只记录在 `references/acceptance-history.md`。

任何 Agent 都不得并行控制创作者页面；生产编排器是唯一的页面控制入口。
