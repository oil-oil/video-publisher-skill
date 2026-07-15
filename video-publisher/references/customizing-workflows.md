# Custom Publishing Workflow Extensions

Use this guide whenever a user wants to customize the Skill's creator-page behavior: click an additional button, fill a new field, change the order of two steps, enable an account setting, or add a new verified condition.

Read `platform-common.md`, `ego-browser-workflow.md`, and the target platform reference first. Use `scripts/v2/publisher.mjs` for acceptance and `scripts/v2/run-platform.mjs` only for bounded one-platform diagnosis.

## Fast Intake

Translate the request into this five-part contract. Ask only for facts that cannot be discovered safely from the live page.

```text
platform: Xiaohongshu | Douyin | Bilibili | WeChat Channels
timing: before or after which existing step/gate
condition: when the custom action is needed
target: visible label plus nearby section/dialog text
postcondition: page evidence that proves the action succeeded
```

The user does not need to know a CSS selector. A useful request can be as short as:

```text
请按 video-publisher 自定义流程规范：
在抖音填写完话题后，如果“允许下载”是关闭的，就点击“允许下载”。
成功标准是开关显示已开启；第二次运行不能重复点击。
```

If “which button” or the desired final state is genuinely ambiguous, inspect read-only first. Ask the user only when two visible controls remain plausible or the choice changes externally visible behavior.

## Decide Where The Behavior Belongs

Classify before editing:

```text
generic repair:
  The platform requires the step for every valid draft, or the current adapter is wrong.
  Implement it directly in the platform adapter and its required gate.

explicit optional feature:
  Some users or videos need it and others do not.
  Add a named package field or configuration field with a safe default; never infer it.

private user default:
  It reflects one person's recurring preference or account convention.
  Store it in $XDG_CONFIG_HOME/video-publisher/config.json, never in the Skill repository.
```

Do not add arbitrary JavaScript, selectors, coordinates, account ids, cookies, login state, absolute personal paths, or free-form browser macros to the configuration file. A supported option must have a stable name, validation, documented semantics, and maintained adapter code.

## Diagnose With Real Page Evidence

1. Reproduce through the maintained phase that owns the step.
2. Reuse the persisted numeric task-space id and exact task-space name.
3. Inspect the target control, its stable surrounding section, current state, and expected changed state.
4. Prefer exact visible text, semantic attributes, roles, and stable platform structure. Treat generated class hashes and absolute screen coordinates as weak evidence.
5. If a coordinate is unavoidable, derive it from the currently visible target's bounding box; never store a fixed coordinate.
6. Use page JavaScript only to inspect or expose the exact element. Use Ego's real `click`, key, or file-input path for the user interaction unless a platform-specific native-command exception is documented and real-tested.

Never experiment on a final `发布`, `发布笔记`, `发表`, or `立即投稿` control. The page guard is a safety net, not a test target.

## Implement An Idempotent Ensure Step

Name the function after the desired state, not the click. Use `ensureAllowDownload`, not `clickAllowDownload`.

```js
async function ensureExampleSetting() {
  const before = await inspectPlatform()
  if (before.gates.exampleSetting.ok) {
    return { ok: true, already: true }
  }

  const target = await js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim()
    const visible = element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 12 && rect.height > 12
        && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const element = [...document.querySelectorAll('button, [role="button"]')]
      .find(item => visible(item) && compact(item.innerText || item.textContent) === '目标按钮')
    if (!element) return { ok: false, reason: 'example setting control missing' }
    element.id = 'vp2-example-setting'
    element.scrollIntoView({ block: 'center', inline: 'center' })
    return { ok: true, selector: '#vp2-example-setting' }
  })()`)
  if (!target.ok) return target

  try {
    await click(target.selector, { label: 'enable example setting' })
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) }
  }
  await wait(1)

  const after = await inspectPlatform()
  return after.gates.exampleSetting.ok
    ? { ok: true, changed: true }
    : { ok: false, reason: 'example setting did not persist', evidence: after.gates.exampleSetting.evidence }
}
```

Required properties:

- read current truth before acting;
- do nothing when the desired state already exists;
- locate one exact visible control inside the correct page section or active dialog;
- use a bounded wait or retry, never an unbounded loop;
- verify the changed page state independently;
- return a typed blocker when the state cannot be proved;
- remain safe if the process stops before or after the action;
- leave the next ordinary run able to inspect and recover.

An action receipt such as “click returned successfully” is not a postcondition. If the result cannot be read from the page, the custom step is not ready for production.

## Wire The Step Into The Right Layer

Use this change map:

```text
platform page behavior:
  scripts/v2/platforms/<platform>.mjs

shared Ego interaction or final safety:
  scripts/v2/ego/core.mjs

centrally required readiness gate:
  scripts/v2/lib/model.mjs

package option and validation:
  scripts/lib/content-package.mjs

private onboarding/config option:
  scripts/lib/config.mjs, scripts/config.mjs, references/configuration.md

scheduler or persistence behavior:
  scripts/v2/publisher.mjs, scripts/v2/lib/job-store.mjs
```

Keep page-specific selectors and semantics in the platform adapter. Add a central gate only when every relevant run must prove it before `READY`; do not turn a personal preference into a universal readiness condition.

Call the ensure step from `mutate`, after its prerequisites and before cover/final verification when appropriate. Add the observable state to `inspect`, so a later `verify` can prove it without trusting mutation history.

## Safety And Sharing Rules

Custom flows may not:

- click or authorize final publishing;
- weaken `finalPublishClicked: false`, `guardArmed: true`, or `blockedAttempts: 0`;
- declare content original without the configured truthful policy or current-run confirmation;
- work around `USER_CONTROL`, authentication, risk-control, or task-space ownership;
- accept plain text as a platform topic entity;
- treat file injection, a click, or a dialog opening as success;
- put account-specific data or personal paths in the public Skill;
- create a second live browser controller or delegate creator tabs to sub Agents.

If a requested customization conflicts with these boundaries, explain the conflict and do not implement it.

## Acceptance Checklist

Static tests are necessary but not sufficient. For every custom page behavior:

1. Run syntax checks and add a focused contract/unit test where possible.
2. Use a real existing video and real logged-in creator page without final publishing.
3. Prove the initial state, execute the custom action, and prove the exact postcondition.
4. Run the same platform again and confirm it is a no-op.
5. Resume from a realistic partial state when the custom step can be interrupted.
6. Run the full selected-platform orchestrator to catch shared Ego and scheduler effects.
7. Complete three consecutive full no-op reruns for a changed live adapter.
8. Verify every selected platform is `READY`, every final guard is armed, blocked attempts are zero, and final publish was not clicked.
9. Update this Skill's platform contract and live-test boundary with only what real evidence proved.
10. Run the full test suite, Skill validation, source/public parity check, and privacy scan before sharing or pushing.

If the change alters upload scheduling, task-space recovery, shared input handling, persistence, or receipts, add the relevant real crash/restart test instead of relying only on a one-platform happy path.
