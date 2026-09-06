# 已有封面上传约定

仅在用户明确要求上传已经存在的封面文件时读取。本 Skill 不创建、生成、重设计或编辑封面。

## 内容包字段

只提供所选平台需要的比例：

```json
{
  "cover": {
    "uploadCustomCover": true,
    "vertical3x4Path": "/absolute/path/cover-3x4.png",
    "horizontal4x3Path": "/absolute/path/cover-4x3.png",
    "horizontal16x9Path": "/absolute/path/cover-16x9.png"
  }
}
```

仅提供路径不代表授权；`uploadCustomCover` 必须明确为 `true`。

推荐尺寸：

```text
3:4：1080 × 1440
4:3：1440 × 1080
16:9：1280 × 720 或更大
B站首页主封面：4:3，至少 1200 × 900
```

平台映射：

```text
小红书：vertical3x4Path
抖音：vertical3x4Path + horizontal4x3Path
B站：horizontal4x3Path
视频号：vertical3x4Path + horizontal4x3Path
YouTube：horizontal16x9Path
```

多平台 Job 只替换一个平台时，使用平台专用覆盖。例如只替换 B 站，不影响同样使用 4:3 的抖音和视频号：

```json
{
  "cover": {
    "uploadCustomCover": true,
    "horizontal4x3Path": "/absolute/path/shared-4x3.png",
    "platforms": {
      "bilibili": {
        "horizontal4x3Path": "/absolute/path/new-bilibili-4x3.png"
      }
    }
  }
}
```

oil-cover 产出的 `<视频名>_4x3.png` 对应 B站 `horizontal4x3Path`；编辑器可将该首页 4:3 主封面同步到个人空间 16:9 槽。

平台专用路径优先于共享路径；校验、身份摘要和实际上传必须解析为同一文件。回归时要检查传给适配器的路径，不能只验证内容包映射。

生产入口会在打开页面前检查文件存在性和精确比例，不需要逐平台重复运行校验命令。

## 接受回执

每个封面槽都按以下顺序处理：

1. 打开编辑器前记录主页面封面 URL。
2. 打开平台真实封面编辑器。
3. 通过编辑器已有文件输入上传映射文件。
4. 完成平台裁剪与确认流程。
5. 等待处理结束且编辑器关闭。
6. 读取主页面已经接受的封面 URL 或卡片。
7. 保存文件绝对路径、比例、旧 URL 和接受后的 URL。
8. 由独立 `verify` 再次找到同一回执。

`uploadFile` 成功、弹窗中的 canvas 或中间预览都不能证明平台已经接受封面。

平台证据：

```text
小红书：主预览通常来自 ros-preview.xhscdn.com。
抖音：竖版和横版主卡片必须得到两个不同的接受 URL。
B站：编辑器关闭，主 `.cover-img` 来自 archive.biliimg.com 或 biliimg.com。
视频号：3:4 与 4:3 主卡片 URL 都要变化，两个编辑器都关闭，并通过独立验证；忽略 data URL 裁剪预览和手机镜像。
YouTube：接受的 16:9 缩略图必须是绑定当前 videoId 的服务端 URL；blob、data 或本地预览不足。
```

所有封面操作继续使用生产编排器的单宽 UI 队列。

## 替换已验证草稿的封面

沿用原 Job，新建一个内容包文件，只替换 `cover` 中对应路径，其他字段保持完全一致：

```bash
scripts/run-safe-platforms.sh \
  --package /absolute/path/to/package-with-new-cover.json \
  --job-id existing-ready-job-id \
  --platforms xiaohongshu \
  --operation replace-cover
```

程序在打开页面前校验视频和非封面内容身份。通过后复用原 Ego 草稿空间，只让变化平台的封面回执失效，并执行 `inspect -> mutate -> verify`。出现 `upload_start`、`prefill` 或 `upload` 都属于失败，不得宣称替换成功。

YouTube 替换缩略图时先回到详情步骤，完成后再进入可见性步骤。详情控件可读取时以当前页面为准，历史详情回执只能用于后续隐藏这些控件的步骤。

该命令只处理仍在 Ego 任务空间中的 `READY` 草稿。已经发布的线上内容需要独立编辑流程；没有用户对具体内容和保存动作的明确授权时，不得点击保存。
