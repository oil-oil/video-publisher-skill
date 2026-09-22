# WeChat Channels Adapter Contract

Before changing the WeChat Channels adapter, read `platform-common.md` and `ego-browser-workflow.md`.

## Contents

- Wujie lifecycle
- Upload completion and draft identity
- Text, original declaration, custom covers, and required gates

## Wujie Lifecycle

The creator editor can be focused while `document.visibilityState` remains `hidden`. That state left `页面初始化中` and fade transitions stuck. Before readiness checks and during upload/dialog waits, call:

```text
Page.bringToFront
Page.setWebLifecycleState { state: active }
Emulation.setFocusEmulationEnabled { enabled: true }
```

Readiness requires the initialization toast to be gone and the real video input to exist, or an already uploaded editor to be proven. Perform at most one gentle reload after the initial activation window.

## Wujie Upload

Search `document` and all open shadow roots for the hidden video input whose `accept` contains `video`. Obtain the input’s CDP object id and use `DOM.setFileInputFiles` with the confirmed source path.

`页面初始化中` is a warning, not sufficient truth by itself. Do not inject while it is present merely because a stale input node exists.

After injection, dispatch one fallback change event only if no upload state appears. Never repeatedly inject the same file.

## Upload Completion

Cover cards can appear before upload completes. A real run displayed:

```text
50%
取消上传
封面预览
个人主页卡片
分享卡片
```

That state is uploading, not ready.

Require cover cards and the absence of all progress signals, including percentage text, `取消上传`, `正在处理文件`, `处理中` and `生成中`, for a stable interval before the upload runner exits. If an existing target upload is in progress, wait for it; do not inject again.

## 上传中预填

当页面同时证明视频仍在上传或生成封面，并且描述、短标题控件可见时，`upload_start` 返回 `editable_uploading`。随后通过单宽 UI 队列执行 `prefill`：

1. 写入精确的视频号描述。
2. 保持短标题为空。
3. 不操作原创声明、封面、活动、定时发表和最终 `发表`。

由于视频号页面不提供可靠文件名，上传启动回执必须同时绑定包指纹和任务空间 id。只有描述已经精确匹配，或存在匹配的上传启动回执时，才允许预填。快速视频可能在预填进程启动前完成平台处理；此时仍可安全预填，但不得宣称写入发生在上传中。

## Draft Identity

The page does not expose a reliable filename. Reuse an uploaded draft only when its description exactly matches the expected package, or a package-fingerprint and task-space receipt proves this job injected or resumed that upload. Treat an already uploaded draft with an empty description and no matching receipt as `STATE_AMBIGUOUS`; never fill its metadata or declarations. A different non-empty description is foreign and must block.

## Text Defaults

Use the description field as:

```text
TITLE

#TOPIC_1 #TOPIC_2 #TOPIC_3
```

Leave `短标题` empty unless explicitly requested.

## Original Declaration

Enable `声明原创`. If an agreement dialog appears, accept its checkbox and click the dialog’s `声明原创` action. This is not the final `发表` control.

The adapter must verify the checked state after the dialog closes.

原创入口缺失时保留原创 gate 失败，不推断已开启。允许先完成身份、视频与文案均已核对的封面上传并保存回执，再返回声明 blocker；复跑不得重复上传已验证封面。

## 自定义双封面

启用自定义封面后，先观察真实槽位。旧版分别处理个人主页 `3:4` 和分享卡片 `4:3`；只有页面明确显示“个人主页和分享卡片(3:4)”、恰有一个竖卡 URL 且无横卡时，按合并槽仅上传并验证 `3:4`。未知布局仍要求双槽或停止诊断。不能用竖版自动裁切代替实际存在的横版槽。

1. 记录对应主卡片 URL，再通过 `.vertical-cover-wrap .edit-btn` 或 `.horizon-cover-wrap .edit-btn` 打开编辑器。
   横版入口若出现标题精确为“使用此素材作为封面？”的唯一可见推荐浮层，选择其中的“直接编辑”，等待真实编辑器出现后上传指定横图。该浮层可能推荐上一张竖图，不能点击“使用素材”代替横版文件，也不能把浮层当作上传后的素材确认。
2. 精确匹配可见弹窗自身标题 `编辑个人主页卡片` 或 `编辑分享卡片`。仅在唯一可见的 `编辑封面` 同时包含上传、取消、确认控件时接受通用标题。不能匹配祖先文本中包含的标题。
3. 记录当前上传预览，只通过该编辑器自身唯一的图片 input 获取 CDP object id，注入对应画幅的精确路径。不得回退到全页图片 input。
4. 等待当前编辑器自己的新上传预览加载；隐藏弹窗、上一张素材和手机镜像都不能满足此条件。同一文件重试时允许预览 URL 不变，但必须逐字节匹配本次本地图片，仍要检查实际裁剪区。裁剪弹窗可见时先点其 `确定`；出现 `使用此素材` 或 `使用素材` 时完成中间确认，再继续等待父编辑器。
5. 确认裁剪区 canvas 与新预览的画幅比例和采样像素一致（允许平台等比缩小源图），源图和裁剪框均符合目标比例，完整源图边界与裁剪框重合。无法证明新图选中、发生额外裁切或控件漂移时有限停止，不能直接点父编辑器 `确认`。
6. 新素材验证通过后点父编辑器 `确认`，持续激活生命周期，等待全部封面弹窗关闭且对应主卡片出现新的服务端 URL。
7. 保存每槽的精确路径、比例、旧 URL、新 URL、`selectionVerified: true` 和源图尺寸。独立 verify 必须再次找到当前布局所有主卡片回执；旧版只有 URL、没有素材选择证明的回执不能判为就绪。

只接受 `.vertical-cover-wrap img.vertical-img-size` 和 `.horizon-cover-wrap img.horizon-img-size` 的服务端 URL。两个槽分别记录，不能把上传调用成功、预览出现或任意 URL 变化当作正确素材已经被接受。

已知封面编辑器或裁剪弹窗遗留时，取消并等待其关闭后再进入对应槽。无法识别的弹窗停止处理，不能当作原创声明弹窗点击。

回归必须包括：连续上传竖版与横版时旧预览仍留在 DOM 的场景、裁剪或素材中间确认、分享卡片实际画面与横版源图一致、独立 verify 和无操作复跑。只有 READY 日志不能替代画面验收。

## Required Gates

```text
authenticated
correct draft identity
upload fully complete, with no percentage or 取消上传
exact description and hashtags
short title empty
original declaration enabled
custom 3:4 and 4:3 receipts when enabled
no blocking dialog
visible enabled 发表 button
final publish not clicked
```

实测记录和待回归边界见 `acceptance-history.md`。
