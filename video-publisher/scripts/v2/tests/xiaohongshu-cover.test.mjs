import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../platforms/xiaohongshu.mjs', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const pkg = { platformTitle: { xiaohongshu: '测试标题' }, xhsTopics: ['AI工具'], cover: { uploadCustomCover: true, vertical3x4Path: '/fixture/cover.png' } };
const prepare = new AsyncFunction('pkg', 'videoPath', 'observe', 'click', 'wait', `${source}
  readXhsCoverCropState = observe;
  return await prepareXhsCoverConfirmation();
`);

test('先打开裁剪并验证 3:4，再等待完成按钮可用', async () => {
  let panel = 'template';
  let ratio = '4:3';
  let delayed = 0;
  const clicks = [];
  const result = await prepare(pkg, '/fixture/video.mp4', async () => ({
    modal: true,
    cropSelector: panel === 'template' ? '#crop' : '',
    actualRatio: panel === 'crop' ? ratio : '',
    optionSelector: panel === 'crop' ? '#portrait' : '',
    confirm: ratio === '3:4' && delayed >= 3 ? { selector: '#done' } : null,
  }), async selector => {
    clicks.push(selector);
    if (selector === '#crop') panel = 'crop';
    if (selector === '#portrait') ratio = '3:4';
  }, async () => { delayed += 1; });
  assert.equal(result.ok, true);
  assert.equal(result.actualRatio, '3:4');
  assert.equal(result.confirm.selector, '#done');
  assert.deepEqual(clicks, ['#crop', '#portrait']);
  assert.ok(delayed >= 3);
});

test('比例控件不提交或完成按钮持续禁用时有限停止', async () => {
  for (const actualRatio of ['4:3', '3:4']) {
    let waits = 0;
    const clicks = [];
    const result = await prepare(pkg, '/fixture/video.mp4', async () => ({
      modal: true, actualRatio, optionSelector: '#portrait', confirm: null,
    }), async selector => clicks.push(selector), async () => { waits += 1; });
    assert.equal(result.ok, false);
    assert.equal(result.code, actualRatio === '3:4' ? 'ACTION_FAILED' : 'SELECTOR_DRIFT');
    assert.ok(waits > 0 && waits <= 30);
    assert.deepEqual(clicks, actualRatio === '3:4' ? [] : ['#portrait']);
  }
});

test('真实裁剪状态忽略隐藏编辑器和源图尺寸', async () => {
  const element = (text, cls, visible = true) => ({
    innerText: text, textContent: text, className: cls, disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: visible ? 100 : 0, height: visible ? 40 : 0 }),
    matches: selector => selector === '.main-cover-editor-modal' && cls.includes('main-cover-editor-modal'),
  });
  const crop = element('裁剪', 'item active');
  const portrait = element('3:4', 'ratio-option');
  const landscape = element('4:3', 'ratio-option active');
  const done = element('完成', 'd-button');
  const modal = element('设置封面', 'main-cover-editor-modal');
  modal.querySelectorAll = selector => ({
    '.items .item': [crop], '.ratio-option,.crop-ratio-item': [portrait, landscape],
    '.ratio-select': [], button: [done],
    '.uploaded-thumbnail-img': [{ naturalWidth: 960, naturalHeight: 1280 }],
  }[selector] || []);
  const hidden = element('设置封面', 'main-cover-editor-modal', false);
  const document = { querySelectorAll: selector => selector.includes('.main-cover-editor-modal') ? [hidden, modal] : [] };
  const read = new AsyncFunction('pkg', 'videoPath', 'js', `${source}\nreturn await readXhsCoverCropState();`);
  const run = () => read(pkg, '/fixture/video.mp4', async code => vm.runInNewContext(code, { document, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) }));
  assert.equal((await run()).actualRatio, '4:3');
  modal.querySelectorAll = selector => selector === 'button' ? [done] : [];
  assert.equal((await run()).actualRatio, '', '不能把源图片 3:4 当作编辑器比例');
});

test('历史 URL 回执必须具有实际裁剪证明', async () => {
  const state = { title: '测试标题', uploaded: true, filenameVisible: true, selected: ['AI工具'], plainResidue: [], duplicate: [], originalEnabled: true, activeDialogs: [], coverBg: 'url(https://example.test/cover.png)' };
  const inspect = new AsyncFunction('pkg', 'videoPath', 'expectedReceipts', 'js', 'inspectFinalButtons', 'PLATFORM_URLS', 'okGate', 'failedGate', `${source}\nreturn await inspectXiaohongshu();`);
  const receipt = { assetPath: '/fixture/cover.png', ratio: '3:4', afterUrl: 'https://example.test/cover.png' };
  const run = () => inspect(pkg, '/fixture/video.mp4', { cover: receipt }, async () => state, async () => [{ buttonish: true, disabled: false }], { xiaohongshu: 'https://example.test/' }, evidence => ({ ok: true, evidence }), evidence => ({ ok: false, evidence }));
  assert.equal((await run()).gates.cover.ok, false);
  receipt.cropVerified = true;
  assert.equal((await run()).gates.cover.ok, true);
});

test('主页面 URL 已变化但裁剪弹窗未关闭时不得生成回执', async () => {
  const upload = new AsyncFunction('pkg', 'videoPath', 'js', 'click', 'wait', 'removeExactStaleMask', `${source}
    prepareXhsCoverConfirmation = async () => ({ok:true,actualRatio:'3:4',confirm:{selector:'#done'}});
    return await uploadXhsCover();
  `);
  let calls = 0;
  const result = await upload(pkg, '/fixture/video.mp4', async () => {
    calls += 1;
    if (calls === 1) return 'url(https://example.test/before.png)';
    if (calls === 2) return { ok: true, alreadyUploaded: true };
    return { bg: 'url(https://example.test/after.png)', uploading: false, editorOpen: true };
  }, async () => {}, async () => {}, async () => {});
  assert.equal(result.ok, false);
  assert.equal(result.receipt, undefined);
  assert.match(result.reason, /editor did not close/);
});
