import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const corePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../ego/core.mjs");

test("final button stays blocked until the confirmed-publish release", async () => {
  const listeners = [];
  class FakeElement {
    matches(selector) { return selector.includes("button"); }
    getAttribute() { return null; }
    get innerText() { return "发布"; }
  }
  const page = vm.createContext({
    window: {},
    Element: FakeElement,
    document: { addEventListener(type, handler) { if (type === "click") listeners.push(handler); } },
  });
  const runner = vm.createContext({
    platform: "xiaohongshu",
    js: async expression => vm.runInContext(expression, page),
  });
  vm.runInContext(fs.readFileSync(corePath, "utf8"), runner);

  const button = new FakeElement();
  const click = () => {
    const event = {
      target: button,
      composedPath: () => [button],
      prevented: false,
      preventDefault() { this.prevented = true; },
      stopImmediatePropagation() {},
    };
    listeners.forEach(handler => handler(event));
    return event.prevented;
  };

  await vm.runInContext("armFinalPublishGuard()", runner);
  assert.equal(click(), true);
  assert.equal(page.window.__VIDEO_PUBLISHER_FINAL_GUARD__.releaseForConfirmedPublish().ok, false);
});

test("clean guard permits one explicit release and can be armed again", async () => {
  const listeners = [];
  class FakeElement {
    matches(selector) { return selector.includes("button"); }
    getAttribute() { return null; }
    get innerText() { return "发布"; }
  }
  const page = vm.createContext({
    window: {},
    Element: FakeElement,
    document: { addEventListener(type, handler) { if (type === "click") listeners.push(handler); } },
  });
  const runner = vm.createContext({
    platform: "xiaohongshu",
    js: async expression => vm.runInContext(expression, page),
  });
  vm.runInContext(fs.readFileSync(corePath, "utf8"), runner);
  const button = new FakeElement();
  const click = () => {
    const event = {
      target: button,
      composedPath: () => [button],
      prevented: false,
      preventDefault() { this.prevented = true; },
      stopImmediatePropagation() {},
    };
    listeners.forEach(handler => handler(event));
    return event.prevented;
  };

  await vm.runInContext("armFinalPublishGuard()", runner);
  assert.equal(page.window.__VIDEO_PUBLISHER_FINAL_GUARD__.releaseForConfirmedPublish().ok, true);
  assert.equal(click(), false);
  await vm.runInContext("armFinalPublishGuard()", runner);
  assert.equal(click(), true);
});
