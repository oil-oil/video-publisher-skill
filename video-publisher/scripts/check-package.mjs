#!/usr/bin/env node
import { loadConfig } from "./lib/config.mjs";
import {
  coverAssetsForPlatform,
  coverUploadEnabled,
  readPackage,
  validateBilibiliPackage,
  validateDouyinPackage,
  validateWechatChannelsPackage,
  validateXiaohongshuPackage,
} from "./lib/content-package.mjs";
import { inspectMediaFile, validateMediaForPlatform } from "./lib/media.mjs";

const validators = {
  xiaohongshu: validateXiaohongshuPackage,
  douyin: validateDouyinPackage,
  bilibili: validateBilibiliPackage,
  wechat_channels: validateWechatChannelsPackage,
};

const [platform, packagePath] = process.argv.slice(2);

if (!validators[platform] || !packagePath) {
  console.error("Usage: check-package.mjs <xiaohongshu|douyin|bilibili|wechat_channels> <package.json>");
  process.exit(2);
}

loadConfig({ requireOnboarded: true });
const pkg = readPackage(packagePath);
const media = inspectMediaFile(pkg.videoPath);
const errors = [
  ...validators[platform](pkg),
  ...validateMediaForPlatform(pkg, platform, media),
];
const coverAssets = coverAssetsForPlatform(pkg, platform);

const result = {
  platform,
  ok: errors.length === 0,
  title: pkg.title,
  media,
  douyinTopics: platform === "douyin" ? pkg.douyinTopics : undefined,
  cover: {
    uploadCustomCover: coverUploadEnabled(pkg.cover || {}),
    assets: coverAssets,
  },
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
