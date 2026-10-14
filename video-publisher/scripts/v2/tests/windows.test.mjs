import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decodeEgoOutput } from '../lib/ego-output.mjs';

test('Ego UTF-8 output preserves characters split across stream chunks', () => {
  const bytes = Buffer.from('中文标题 😀');
  assert.equal(decodeEgoOutput([...bytes].map(value => Buffer.from([value]))), '中文标题 😀');
});

test('Windows Ego GBK output preserves Chinese result evidence', { skip: process.platform !== 'win32' }, () => {
  const bytes = Buffer.from([0x7b, 0x22, 0x74, 0x22, 0x3a, 0x22, 0xd6, 0xd0, 0xce, 0xc4, 0x22, 0x7d]);
  assert.deepEqual(JSON.parse(decodeEgoOutput([bytes.subarray(0, 7), bytes.subarray(7)])), { t: '中文' });
});

for (const [platform, variable] of [['xiaohongshu', 'xhsVideoName'], ['bilibili', 'bilibiliVideoName'], ['youtube', 'youtubeVideoName']]) {
  test(`${platform} draft identity uses the basename for Windows and POSIX paths`, () => {
    const source = fs.readFileSync(new URL(`../platforms/${platform}.mjs`, import.meta.url), 'utf8');
    const declaration = source.split('\n').find(line => line.startsWith(`const ${variable} =`));
    const basename = new Function('videoPath', `${declaration}; return ${variable};`);
    for (const videoPath of ['C:\\视频 目录\\测试.mp4', 'C:/视频 目录/测试.mp4', '/videos/测试.mp4']) {
      assert.equal(basename(videoPath), '测试.mp4');
    }
  });
}

test('Xiaohongshu does not click a disabled original declaration control', async () => {
  const source = fs.readFileSync(new URL('../platforms/xiaohongshu.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function ensureXhsOriginal()');
  const end = source.indexOf('\nasync function ', start + 1);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const ensure = new AsyncFunction('removeExactStaleMask', 'inspectXiaohongshu', 'js', 'click',
    `${source.slice(start, end)}; return await ensureXhsOriginal();`);
  const evidence = { ok: false, disabled: true, blockerCode: 'PLATFORM_REJECTED_ASSET', reason: '视频时长小于10s，暂不支持原创声明' };
  const result = await ensure(async () => {}, async () => ({ gates: { original: { ok: false } } }),
    async () => evidence, async () => assert.fail('disabled switch must not be clicked'));
  assert.deepEqual(result, evidence);
});
