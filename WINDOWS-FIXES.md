# Windows 修复记录（2026-10-14）

基线：上游 main `b615eacfbd41dde0e268e7e2a52fe6bd69011409`。本机 Windows，Node.js 22.15.1，Ego Lite 0.5.2.15，中文系统代码页。修改保存在本地工作区，尚未提交或推送。

## 问题与修复

| 编号 | 复现 / 原因 | 修复 | 验证 |
| --- | --- | --- | --- |
| W01 | 文档唯一入口是 Bash `.sh`，原生 PowerShell/cmd 不能直接执行 | 增加 `.cmd` 包装器，仍调用原 publisher.mjs，参数和退出码透传；补充 Windows 安装与调用说明 | 本机通过 `.cmd` 完成真实生产上传与只读复查 |
| W02 | CLI 的 stderr 中中文是 GBK；Node Buffer 隐式 UTF-8 解码产生替换字符，结构化回执的标题、话题和空间名损坏；逐块转换还有多字节边界风险 | 累积 Buffer 后严格 UTF-8 解码，Windows 无效 UTF-8 回退 GB18030；支持显式 VIDEO_PUBLISHER_EGO_OUTPUT_ENCODING | 真实 CLI 中文探针修复前乱码、修复后原文完整；UTF-8 跨块、GBK JSON 单测 |
| W03 | 小红书/B站/YouTube 用 videoPath.split('/')，Windows 反斜杠路径被当成完整文件名 | 同时识别两种路径分隔符，保留精确上传路径 | 三适配器覆盖 Windows 反斜杠、正斜杠、中文与空格、POSIX 路径；小红书真实上传身份 gate 通过 |
| W04 | 单平台测试伪 Ego 使用 /bin/sh、cat、sleep，Windows spawn 无法执行；runner 不支持 Node 测试脚本，而清理 runner 已支持 | runner 增加 .mjs/.cjs/.js 命令入口，统一由 process.execPath 执行；三份测试替身改 Node | 平台封面映射、子进程失败、用户接管等集成测试通过 |
| W05 | POSIX 0700/0600 mode 断言在 Windows stat 不能成立 | POSIX 权限断言只在支持的系统执行；配置、锁竞争、备份和恢复行为断言仍在 Windows 执行；文档说明 NTFS ACL 继承 | 原有三个权限相关失败消除。没有把 Windows chmod 宣称为 ACL 隔离 |
| W06 | Ego 新文案“browser permission prompt…The user now controls…”被归为 INPUT_CHANNEL_BROKEN，调度器会按错误类型进行后续检查 | 识别 USER_CONTROL 文案并沿用全局停止路径 | 定位权限弹窗真实复现；两种接管文案集成回归 |
| W07 | 5 秒测试素材上传后，小红书禁用原创声明并提示“视频时长小于10s，暂不支持原创声明”；适配器仍点击并给出普通 ACTION_FAILED | 不点击禁用控件，保留平台证据；可见时长拒绝提示归为 PLATFORM_REJECTED_ASSET，否则 STATE_AMBIGUOUS | 真实页面证据 + 禁用控件不点击回归；使用独立 12 秒素材完成生产验收 |
| W08 | 原有孤儿子进程测试假设父进程 SIGKILL 后子进程必定存活；本机 Windows 子进程同时退出 | 等待测试子进程完成启动，按实际存活情况验证；存活时锁必须 busy，Windows 子进程已死时验证陈旧锁可恢复 | 崩溃/锁恢复集成测试通过；另有独立存活成员阻塞锁测试 |

## 本机真实验收

最终本地验证：149 项自动化测试全部通过（0 失败、0 跳过），45 个 `.mjs` 脚本语法检查通过，`git diff --check` 通过。原始版本为 139 项中 133 通过、6 失败；新增回归覆盖编码、三平台路径、权限接管、禁用原创控件、五平台离线编译与调度。

- FFmpeg 生成 testsrc2 竖屏图案，720×1280 / 25fps，H.264 + 静音 AAC。第一份 5 秒素材复现平台原创声明限制；第二份 12 秒素材用于完整验收。
- 小红书使用现有 Ego Lite 登录账号，标题“Windows 发布流程测试”，真实话题“测试”，平台默认封面；本次原创授权由维护者明确确认。
- Job `windows-xhs-12s-20261014`，TaskSpace 1。生产入口返回 `ready:true`、`missing:[]`、`blocker:null`；独立 `--inspect-only` 复查仍 READY。
- `finalPublishClicked:false`；最终发布守卫已开启、拦截次数为零。没有执行最终发布。
- 测试视频、配置、内容包、日志、状态与证据位于工作区旁的 `video-publisher-test`，不进入仓库。
- 增加 GitHub Actions 的 Ubuntu / Windows + Node 22 矩阵；当前只运行了本机 Windows，远程 CI 尚未运行。
- 按维护者要求补充无需登录的五平台验证：真实 runner 生成的五份适配器脚本都由 Node 的 ESM 编译器检查通过；模拟登录边界的结构化回执保持 `AUTH_REQUIRED`。真实 publisher 在模拟平台回执下执行五平台完整调度并全部 READY；五平台模拟未登录时只执行 inspect，均正确阻塞，没有上传或 mutation。
- 五平台离线回归使用 Node 测试替身，不调用 Ego、不读取其他平台账号，也不证明平台实际上传接口、选择器或话题候选当前可用。

## Ego 截图诊断记录

完成 READY 和只读复查后，附加留档调用两次 `Page.captureScreenshot` 均 CDP 超时；第二次已在原空间执行 bringToFront / active。生产链路不依赖此截图；未获得截图，保留结构化页面证据和草稿页。这是 Ego Lite 截图通道的待诊断项，本轮没有修改 Ego Lite 或声称修复截图能力。

## 范围与待验收

小红书的 Windows 默认封面单平台草稿流程和无操作复查已实测。B站/YouTube 的路径修复有本地行为回归，但尚未做真实平台验收；抖音、视频号、五平台并行、大文件、定制封面、真实浏览器崩溃恢复、最终发布也尚未在本轮 Windows 实测。不能据此宣布所有平台与最终发布已完全通过。

另观察到摘要 operation 字段来自最后一次内容身份 revision，恢复/只读检查时可能仍显示首次 operation；本轮保留该现有语义，作为独立诊断输出改进项。

更新 Ego CLI 后如输出改为 UTF-8，自动检测仍适用。其他 Windows 代码页应显式指定编码并实测。POSIX 权限与 NTFS ACL 的安全能力不同；本次未加入自动修改用户目录 ACL 的行为。
