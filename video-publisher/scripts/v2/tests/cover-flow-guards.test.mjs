import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { evaluateObservation, requiredGates } from '../lib/model.mjs';

const platformDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'platforms');
const pkg = { platformTitle: { douyin: '视频标题' }, douyinDescription: '视频标题', douyinTopics: ['AI工具'], cover: { uploadCustomCover: true } };
function runAdapter(file, expression, context = {}) {
  return vm.runInNewContext(`${fs.readFileSync(path.join(platformDir, file), 'utf8')}\n${expression}`, { pkg, compactText: value => String(value || '').replace(/\s+/g, ' ').trim(), ...context });
}

async function inspectDouyinFixture({ sync = 'absent', uploading = false, editable = true } = {}) {
  const rect = () => ({ width: editable ? 400 : 0, height: 50 });
  const title = { value: '视频标题', placeholder: '填写作品标题', getBoundingClientRect: rect };
  const topic = { innerText: '#添加话题', getBoundingClientRect: rect };
  const editor = { innerText: '视频标题 #AI工具', className: 'editor', getBoundingClientRect: rect,
    querySelectorAll: () => [{ innerText: '#AI工具' }],
    cloneNode: () => ({ innerText: '视频标题', querySelectorAll: () => [] }) };
  const labels = ['不同时发布', '同时发布到今日头条'].map((innerText, index) => ({ innerText, getBoundingClientRect: rect,
    querySelector: () => sync === 'broken' ? null : { checked: sync === 'off' ? index === 0 : index === 1 } }));
  const switchOnly = sync.startsWith('switch-');
  const switchControl = { className: 'semi-switch', getAttribute: () => sync === 'switch-unknown' ? null : sync === 'switch-on' ? 'true' : 'false' };
  const toutiao = { innerText: '今日头条', getBoundingClientRect: rect, querySelector: () => switchControl };
  const document = { body: { innerText: uploading ? '基础信息 上传过程中' : '基础信息 上传成功' }, querySelectorAll(selector) {
    if (selector === 'input') return [title];
    if (selector === '[contenteditable="true"], [contenteditable=""]') return [editor];
    if (selector === 'button,[role="button"],div,span') return [topic];
    if (selector === 'div,span') return switchOnly ? [toutiao] : [];
    if (selector === 'label') return sync === 'absent' || switchOnly ? [] : labels;
    return [];
  } };
  return runAdapter('douyin.mjs', 'inspectDouyin()', {
    js: async expression => vm.runInNewContext(expression, { document, getComputedStyle: () => ({ display: 'block', visibility: 'visible', backgroundImage: 'none' }) }),
    expectedReceipts: {}, PLATFORM_URLS: { douyin: 'https://creator.douyin.com/' },
    inspectFinalButtons: async () => [{ buttonish: true, disabled: false }],
    okGate: evidence => ({ ok: true, evidence }), failedGate: evidence => ({ ok: false, evidence }),
  });
}

test('Douyin tolerates absent sync controls only in the proven editable uploader', async () => {
  const ready = await inspectDouyinFixture();
  assert.equal(ready.gates.settings.ok, true);
  assert.equal(ready.gates.settings.evidence.applicable, false);
  assert.equal(ready.gates.settings.evidence.simultaneousPublish, undefined, 'absence must not claim synchronization was disabled');
  assert.equal((await inspectDouyinFixture({ editable: false })).gates.settings.ok, false);
  const uploading = await inspectDouyinFixture({ uploading: true });
  assert.equal(uploading.evidence.earlyMutation.ready, true);
  assert.equal(uploading.gates.video.ok, false);
});

test('Douyin keeps present sync controls and central settings gate authoritative', async () => {
  assert.equal((await inspectDouyinFixture({ sync: 'off' })).gates.settings.ok, true);
  assert.equal((await inspectDouyinFixture({ sync: 'switch-off' })).gates.settings.ok, true);
  for (const sync of ['on', 'broken', 'switch-on', 'switch-unknown']) {
    const observed = await inspectDouyinFixture({ sync });
    assert.equal(observed.gates.settings.ok, false);
    const gates = Object.fromEntries(requiredGates('douyin').map(name => [name, { ok: true, evidence: name === 'safety' ? { finalPublishClicked: false, guardArmed: true, blockedAttempts: 0 } : {} }]));
    gates.settings = observed.gates.settings;
    const verdict = evaluateObservation({ platform: 'douyin', phase: 'verify', gates });
    assert.equal(verdict.ready, false);
    assert.ok(verdict.missing.includes('settings'));
  }
});

test('Xiaohongshu waits for both cover processing and the visible editor to finish', async () => {
  const states = [
    { bg: 'new', uploading: false, editorOpen: true },
    { bg: 'new', uploading: true, editorOpen: false },
    { bg: 'new', uploading: false, editorOpen: false },
  ];
  let probes = 0;
  const result = await runAdapter('xiaohongshu.mjs', 'waitForXhsCoverAcceptance("old")', {
    videoPath: '/tmp/video.mp4', js: async () => states[probes++], wait: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(probes, 3);
  for (const bg of ['old', 'none']) {
    const blocked = await runAdapter('xiaohongshu.mjs', 'waitForXhsCoverAcceptance("old")', {
      videoPath: '/tmp/video.mp4', js: async () => ({ bg, uploading: false, editorOpen: false }), wait: async () => {},
    });
    assert.equal(blocked.ok, false);
  }
});

test('Douyin cover click failures stop before polling or reporting slot completion', async () => {
  const responses = [true, true, { ok: true, selector: '#file' }, { label: '设置横封面', selector: '#advance' }];
  let probes = 0;
  const calls = [];
  const result = await runAdapter('douyin.mjs', 'uploadDouyinCoverSlot({slot:"portrait",ratio:"3:4",path:"/tmp/portrait.png"})', {
    js: async () => responses[probes++],
    cdp: async method => calls.push(method), wait: async () => {}, uploadFile: async () => {},
    click: async () => { throw new Error('input channel failed'); },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /input channel failed/);
  assert.equal(probes, 4);
  assert.ok(calls.includes('Page.setWebLifecycleState'));
});

test('Douyin waits for the actual landscape step after advancing', async () => {
  const responses = [true, true, { ok: true, selector: '#file' }, { label: '设置横封面', selector: '#advance' }, false, false, true];
  let probes = 0;
  const result = await runAdapter('douyin.mjs', 'uploadDouyinCoverSlot({slot:"portrait",ratio:"3:4",path:"/tmp/portrait.png"})', {
    js: async () => responses[probes++], cdp: async () => {}, wait: async () => {}, uploadFile: async () => {}, click: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(probes, 7);
});

test('WeChat keeps file proof and rejects a visible crop that clips the image', () => {
  const preview = { editorMatched: true, image: { loaded: true, sourceKey: 'new', width: 1280, height: 960 } };
  const source = { name: 'cover.png', size: 10 };
  const probe = crop => runAdapter('wechat-channels.mjs', 'wechatCoverPreviewMatches(preview,{path:"/tmp/cover.png",ratio:"4:3"},source,"old")', {
    preview: { ...preview, crop }, source, path, fs: { statSync: () => ({ size: 10 }) },
  });
  assert.equal(probe(undefined), true, 'existing editors without the optional canvas retain their source proof');
  assert.equal(probe({ applicable: true, fullImageVisible: true, width: 400, height: 300 }), true);
  assert.equal(probe({ applicable: true, fullImageVisible: false, width: 400, height: 300 }), false);
  assert.equal(probe({ applicable: true, fullImageVisible: true, width: 300, height: 400 }), false);
});

test('WeChat reads a nested crop dialog without borrowing its parent input scope', async () => {
  const rect = (width = 400, height = 300) => ({ width, height, left: 0, top: 0 });
  const parent = { getBoundingClientRect: () => rect(), contains: node => node === cropDialog,
    querySelectorAll(selector) {
      if (selector === '.weui-desktop-dialog__title') return [parentHeading, cropHeading];
      if (selector === '.single-cover-uploader-wrap img') return [image];
      if (selector === '.crop-image-container canvas.cr-image') return [canvas];
      if (selector === '.crop-image-container .cr-viewport') return [viewport];
      return [];
    } };
  const cropDialog = { getBoundingClientRect: () => rect(), querySelectorAll(selector) {
    if (selector === '.weui-desktop-dialog__title') return [cropHeading];
    if (selector === '.crop-image-container canvas.cr-image') return [canvas];
    if (selector === '.crop-image-container .cr-viewport') return [viewport];
    return [];
  } };
  const parentHeading = { textContent: '编辑分享卡片', closest: () => parent };
  const cropHeading = { textContent: '裁剪封面图', closest: () => cropDialog };
  const image = { currentSrc: 'new-preview', naturalWidth: 1280, naturalHeight: 960, complete: true, closest: () => parent, getBoundingClientRect: () => rect() };
  const canvas = { closest: () => cropDialog, getBoundingClientRect: () => rect(800, 600) };
  const viewport = { closest: () => cropDialog, getBoundingClientRect: () => rect() };
  const document = { querySelectorAll: selector => selector === '.weui-desktop-dialog__wrp' ? [parent, cropDialog] : [] };
  const result = await runAdapter('wechat-channels.mjs', 'probeWechatCoverEditor({dialogTitle:"编辑分享卡片"})', {
    js: async expression => vm.runInNewContext(expression, { document, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) }),
  });
  assert.equal(result.editorMatched, true);
  assert.equal(result.image.loaded, true);
  assert.equal(result.crop.applicable, true);
  assert.equal(result.crop.fullImageVisible, false);
});
