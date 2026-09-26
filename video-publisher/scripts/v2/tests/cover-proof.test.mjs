import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = path.join(DIR, "..", "platforms");

test("cover adapter source files pass whole-file syntax checks", () => {
  for (const file of ["xiaohongshu.mjs", "wechat-channels.mjs", "bilibili.mjs"]) {
    const absolutePath = path.join(PLATFORM_DIR, file);
    const result = spawnSync(process.execPath, ["--check", absolutePath], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file} must parse as a complete injected adapter:\n${result.stderr || result.stdout}`);
  }
});

function loadAdapterFunctions(file, names, context = {}) {
  const source = fs.readFileSync(path.join(PLATFORM_DIR, file), "utf8");
  const declarations = [...source.matchAll(/^(?:async\s+)?function\s+[\w$]+\s*\(/gm)]
    .map(match => ({ name: match[0].replace(/^(?:async\s+)?function\s+/, "").replace(/\s*\($/, ""), index: match.index }));
  const requested = names.map(name => {
    const declaration = declarations.find(item => item.name === name);
    assert.ok(declaration, `${name} must exist in ${file}`);
    return declaration;
  });
  const first = Math.min(...requested.map(item => item.index));
  const last = Math.max(...requested.map(item => item.index));
  const next = declarations.find(item => item.index > last);
  const sourceSlice = source.slice(first, next?.index ?? source.length);
  const selectedNames = names.join(", ");
  return vm.runInNewContext(`${sourceSlice}\n;({ ${selectedNames} })`, context, { filename: file });
}

test("Xiaohongshu cover proof requires the editor's actual 3:4 ratio", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-proof-xhs-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const assetPath = path.join(dir, "portrait.png");
  fs.writeFileSync(assetPath, Buffer.from("fake 3:4 image bytes"));
  const { xhsCoverCropMatches, xhsCoverReceiptMatches } = loadAdapterFunctions(
    "xiaohongshu.mjs",
    ["xhsCoverCropMatches", "xhsCoverReceiptMatches"],
    { xhsCoverPath: assetPath, path, fs },
  );

  assert.equal(xhsCoverCropMatches({ actual: "3:4", controlVisible: true }), true);
  assert.equal(
    xhsCoverCropMatches({ actual: "", controlVisible: false, uploadedThumbnail: { width: 1080, height: 1440 } }),
    false,
    "a 3:4 source image cannot substitute for a missing crop-ratio control",
  );
  assert.equal(
    xhsCoverCropMatches({ actual: "4:3", controlVisible: true, uploadedThumbnail: { width: 1080, height: 1440 } }),
    false,
    "a 3:4 source image cannot prove that the editor selected 3:4",
  );

  const weakReceipt = { assetPath, ratio: "3:4", beforeUrl: "old", afterUrl: "new" };
  assert.equal(
    xhsCoverReceiptMatches(weakReceipt, 'url("new")'),
    false,
    "assetPath and a changed preview URL alone do not prove the crop selection",
  );

  const bytes = fs.readFileSync(assetPath);
  const receipt = {
    ...weakReceipt,
    selectedFile: { name: path.basename(assetPath), size: bytes.length },
    cropProof: { actual: "3:4", controlVisible: true },
    acceptedImage: { width: 1080, height: 1440 },
  };
  assert.equal(xhsCoverReceiptMatches(receipt, 'url("new")'), true);
  assert.equal(
    xhsCoverReceiptMatches({ ...receipt, selectedFile: { name: "other.png", size: bytes.length } }, 'url("new")'),
    false,
    "the final receipt must identify the uploaded source file",
  );
  assert.equal(
    xhsCoverReceiptMatches({ ...receipt, selectedFile: { name: path.basename(assetPath), size: bytes.length + 1 } }, 'url("new")'),
    false,
    "the final receipt must match the uploaded source size",
  );
  assert.equal(
    xhsCoverReceiptMatches({ ...receipt, cropProof: { actual: "4:3", controlVisible: true } }, 'url("new")'),
    false,
    "the final receipt must preserve the verified 3:4 crop selection",
  );
  assert.equal(
    xhsCoverReceiptMatches({ ...receipt, acceptedImage: { width: 1440, height: 1080 } }, 'url("new")'),
    false,
    "the accepted main cover must preserve the requested 3:4 ratio",
  );
});

test("WeChat Channels cover proof binds the selected file, loaded landscape preview, and accepted card", t => {
  const { wechatCoverPreviewMatches, wechatCoverReceiptMatches } = loadAdapterFunctions(
    "wechat-channels.mjs",
    ["wechatCoverRatioMatches", "wechatCoverPreviewMatches", "wechatCoverReceiptMatches"],
    { fs, path },
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-proof-wechat-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const assetPath = path.join(dir, "horizontal.png");
  const bytes = Buffer.from("fake horizontal image bytes");
  fs.writeFileSync(assetPath, bytes);
  const asset = { path: assetPath, ratio: "4:3" };
  const selectedFile = { name: path.basename(assetPath), size: bytes.length };
  const previewProof = {
    editorMatched: true,
    image: { loaded: true, sourceKey: "fresh-preview", width: 1280, height: 960 },
  };

  assert.equal(wechatCoverPreviewMatches(previewProof, asset, selectedFile, "old-preview"), true);
  assert.equal(
    wechatCoverPreviewMatches({ ...previewProof, image: { ...previewProof.image, loaded: false } }, asset, selectedFile, "old-preview"),
    false,
    "a not-yet-loaded image cannot prove the preview dimensions",
  );
  assert.equal(
    wechatCoverPreviewMatches({ ...previewProof, image: { ...previewProof.image, width: 960, height: 1280 } }, asset, selectedFile, "old-preview"),
    false,
    "the previous 960×1280 portrait preview must not satisfy a 4:3 request",
  );
  assert.equal(
    wechatCoverPreviewMatches({ ...previewProof, image: { ...previewProof.image, sourceKey: "old-preview" } }, asset, selectedFile, "old-preview"),
    false,
    "the preview source must change after selecting the requested file",
  );
  assert.equal(
    wechatCoverPreviewMatches(previewProof, asset, { name: "other.png", size: bytes.length }, "old-preview"),
    false,
    "a filename mismatch must reject the preview proof",
  );
  assert.equal(
    wechatCoverPreviewMatches(previewProof, asset, { name: selectedFile.name, size: bytes.length + 1 }, "old-preview"),
    false,
    "a file-size mismatch must reject the preview proof",
  );

  const receipt = {
    assetPath,
    ratio: "4:3",
    beforeUrls: ["old-card"],
    afterUrl: "new-card",
    selectedFile,
    previewProof,
  };
  const acceptedCard = [{ url: "new-card", width: 1280, height: 960 }];
  assert.equal(wechatCoverReceiptMatches(asset, receipt, acceptedCard), true);
  assert.equal(
    wechatCoverReceiptMatches(asset, { assetPath, ratio: "4:3", afterUrl: "new-card" }, acceptedCard),
    false,
    "a receipt that only claims the asset path and a new URL is insufficient",
  );
  assert.equal(
    wechatCoverReceiptMatches(asset, receipt, [{ url: "new-card", width: 960, height: 1280 }]),
    false,
    "the accepted card must preserve the requested 4:3 ratio",
  );
  assert.equal(
    wechatCoverReceiptMatches(asset, receipt, [{ url: "different-card", width: 1280, height: 960 }]),
    false,
    "verification must fail when the accepted card URL no longer matches the receipt",
  );
});

test("Bilibili requires independent proof for the 4:3 homepage and 16:9 personal-space slots", t => {
  const { bilibiliCoverRatioMatches, bilibiliCoverReceiptMatches } = loadAdapterFunctions(
    "bilibili.mjs",
    ["bilibiliCoverRatioMatches", "bilibiliCoverReceiptMatches"],
    { fs, path },
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-proof-bilibili-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const homepagePath = path.join(dir, "homepage.png");
  const personalSpacePath = path.join(dir, "personal-space.png");
  const homepageBytes = Buffer.from("fake 4:3 image bytes");
  const personalSpaceBytes = Buffer.from("fake 16:9 image bytes");
  fs.writeFileSync(homepagePath, homepageBytes);
  fs.writeFileSync(personalSpacePath, personalSpaceBytes);
  const homepage = { slot: "homepage-master", ratio: "4:3", path: homepagePath };
  const personalSpace = { slot: "personal-space", ratio: "16:9", path: personalSpacePath };

  function receiptFor(asset, bytes, dimensions, uploadedUrl, afterUrl) {
    const previewProof = {
      slot: asset.slot,
      active: true,
      changed: true,
      loaded: true,
      width: dimensions.width,
      height: dimensions.height,
      url: uploadedUrl,
    };
    const acceptedImage = {
      url: afterUrl,
      origin: uploadedUrl,
      source: "upload",
      loaded: true,
      width: dimensions.width,
      height: dimensions.height,
    };
    return {
      receipt: {
        assetPath: asset.path,
        ratio: asset.ratio,
        selectedFile: { name: path.basename(asset.path), size: bytes.length },
        previewProof,
        afterUrl,
        acceptedImage,
      },
      images: [acceptedImage],
    };
  }

  const homepageProof = receiptFor(homepage, homepageBytes, { width: 1440, height: 1080 }, "blob:homepage-upload", "https://archive.biliimg.com/4.jpg");
  const personalSpaceProof = receiptFor(personalSpace, personalSpaceBytes, { width: 1920, height: 1080 }, "blob:space-upload", "https://archive.biliimg.com/16.jpg");
  assert.equal(bilibiliCoverRatioMatches(homepageProof.receipt.previewProof, "4:3"), true);
  assert.equal(bilibiliCoverRatioMatches(personalSpaceProof.receipt.previewProof, "16:9"), true);
  assert.equal(bilibiliCoverReceiptMatches(homepage, homepageProof.receipt, homepageProof.images), true);
  assert.equal(bilibiliCoverReceiptMatches(personalSpace, personalSpaceProof.receipt, personalSpaceProof.images), true);

  assert.equal(
    bilibiliCoverReceiptMatches(personalSpace, homepageProof.receipt, homepageProof.images),
    false,
    "a valid 4:3 homepage receipt cannot prove the 16:9 personal-space slot",
  );
  assert.equal(
    bilibiliCoverReceiptMatches(homepage, { ...homepageProof.receipt, previewProof: { ...homepageProof.receipt.previewProof, slot: "personal-space" } }, homepageProof.images),
    false,
    "the preview must belong to the requested active slot",
  );
  assert.equal(
    bilibiliCoverReceiptMatches(homepage, { ...homepageProof.receipt, previewProof: { ...homepageProof.receipt.previewProof, changed: false } }, homepageProof.images),
    false,
    "the preview URL must have changed after selecting the requested file",
  );
  assert.equal(
    bilibiliCoverReceiptMatches(homepage, homepageProof.receipt, [{ ...homepageProof.images[0], source: "pick" }]),
    false,
    "a manually picked image cannot stand in for the requested uploaded file",
  );
  assert.equal(
    bilibiliCoverReceiptMatches(homepage, homepageProof.receipt, [{ ...homepageProof.images[0], origin: "blob:another-upload" }]),
    false,
    "the accepted card must come from the preview that was confirmed",
  );
  assert.equal(
    bilibiliCoverReceiptMatches(homepage, homepageProof.receipt, [{ ...homepageProof.images[0], width: 1080, height: 1920 }]),
    false,
    "the accepted card must retain the slot's requested aspect ratio",
  );
  assert.equal(
    bilibiliCoverReceiptMatches(homepage, homepageProof.receipt, [{ ...homepageProof.images[0], url: "https://archive.biliimg.com/other.jpg" }]),
    false,
    "the live accepted URL must remain the URL recorded by the receipt",
  );
});
