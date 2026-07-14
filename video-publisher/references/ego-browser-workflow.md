# Ego Lite Workflow

Use Ego Lite for every creator-platform browser action. The production orchestrator owns task-space creation and reuse; use the mechanics below only for adapter work or diagnosis after a runner blocker.

## Task Spaces

Use one persistent task space per platform. Store and reuse its numeric id.

```js
await useOrCreateTaskSpace(taskSpaceId)
```

Do not call `completeTaskSpace` during upload, mutation, or verification. Leave a ready draft visible unless the user explicitly ends that platform step.

If Ego says the user took control, stop. After the user explicitly says to continue:

```js
await claimTaskSpace(taskSpaceId)
```

Do not route around ownership by opening a new task space.

If a persisted numeric id is explicitly reported as `task space not found` after a browser crash or interrupted desktop run, the maintained runner may recreate the same named platform task space and persist its new id. Do not use this fallback for user-control, inactive, or ownership errors.

This fallback has passed real task-space-loss tests on all four platforms. A replacement space must start from fresh page truth, rebuild only that platform, generate new cover receipts when the old page no longer exists, persist the replacement numeric id, and leave every unaffected platform untouched.

## Platform URLs

```text
xiaohongshu: https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video
douyin: https://creator.douyin.com/creator-micro/content/upload
bilibili: https://member.bilibili.com/platform/upload/video/frame?spm_id_from=333.1007.top_bar.upload
wechat_channels: https://channels.weixin.qq.com/platform/post/create
```

## File Upload

Verify every absolute file path before browser work.

For ordinary video and image inputs, expose the platform’s existing input and use `uploadFile`. Do not create a fake input.

Bilibili video inputs declare extensions such as `.mp4,.mov`; do not identify them by searching only for `video` in `accept`. Image inputs must have explicit image MIME/extensions and should be scoped to the active cover editor.

WeChat Channels is different: both its hidden video input and cover image input live in Wujie/open-root content. Find the real input across roots, get its remote object id, then call `DOM.setFileInputFiles`. The top-document `uploadFile('#selector', path)` helper cannot reach an id placed inside that shadow tree.

```js
const evaluated = await cdp('Runtime.evaluate', {
  expression: `(() => {
    const roots = [document, ...[...document.querySelectorAll('*')]
      .map(el => el.shadowRoot).filter(Boolean)]
    return roots.flatMap(root => [...root.querySelectorAll('input[type=file]')])
      .find(el => /video/.test(el.accept || ''))
  })()`,
  objectGroup: 'video-publisher-wechat'
})
await cdp('DOM.setFileInputFiles', {
  objectId: evaluated.result.objectId,
  files: [videoPath]
})
```

Read `platform-wechat-channels.md` before using this path.

Before inspecting or mutating WeChat Channels, activate its browser lifecycle:

```js
await cdp('Page.bringToFront', {})
await cdp('Page.setWebLifecycleState', { state: 'active' })
await cdp('Emulation.setFocusEmulationEnabled', { enabled: true })
```

A task-space tab can report `hasFocus: true` while `document.visibilityState` is still `hidden`. In that state, `页面初始化中`, uploads, Vue transitions, and dialog cleanup may stall. The adapter repeats lifecycle activation while waiting; do not replace this with blind reload loops.

## Real Input Versus DOM State

Use framework-aware input events for plain controlled fields. For fragile rich editors or chip inputs, prefer a real focus/click plus CDP text insertion and real key events.

Important Bilibili example: when the tag input is already empty, Backspace deletes the last committed chip. Only send Backspace when the input contains residual text.

Topic entities must be committed through the real platform suggestion UI. Never insert entity HTML directly.

## Diagnostic Heredoc

Use a hand-written heredoc only after a maintained phase returns a blocker:

```bash
ego-browser nodejs <<'EOF'
await useOrCreateTaskSpace(123)
const tabs = await listTabs()
const tab = tabs.find(item => /creator\.douyin\.com/.test(item.url || ''))
if (tab) await switchTab(tab.targetId)
const state = await js(String.raw`(() => ({
  url: location.href,
  text: String(document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1200)
}))()`)
cliLog(JSON.stringify(state))
EOF
```

Select the recorded numeric id. Do not perform final publishing or broad exploratory clicking.

## Verification

Freshly inspect after every mutation. Upload and cover helper return values are only action receipts; the platform adapter must also verify page state.

Stop before the final button and record its exact text, visibility, and disabled state.
