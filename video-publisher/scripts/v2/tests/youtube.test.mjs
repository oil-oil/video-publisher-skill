import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../platforms/youtube.mjs", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const pkg = {
  platformTitle: { youtube: "原始标题" }, youtubeDescription: "说明", youtubeTags: ["测试"],
  youtubeAudience: "not_made_for_kids", youtubeVisibility: "private", youtubeCategory: "",
  youtubeLanguage: "", youtubePlaylist: "", youtubeLicense: "standard_youtube",
  youtubePaidPromotion: false, youtubeAlteredContent: false,
  youtubeAllowEmbedding: true, youtubeNotifySubscribers: true,
  cover: { uploadCustomCover: true, horizontal16x9Path: "/fixture/cover.png" },
};
const details = {
  videoId: "video-1", title: pkg.platformTitle.youtube, description: pkg.youtubeDescription,
  tags: pkg.youtubeTags, audience: pkg.youtubeAudience, category: "", language: "", playlist: "",
  license: pkg.youtubeLicense, paidPromotion: false, alteredContent: false,
  allowEmbedding: true, notifySubscribers: true,
};

test("YouTube live details take precedence over an earlier details receipt", async () => {
  const inspect = new AsyncFunction("pkg", "videoPath", "expectedReceipts", "js", "cdp",
    "inspectFinalButtons", "YOUTUBE_FINAL_TEXT", "okGate", "failedGate", `${source}\nreturn await inspectYoutube();`);
  const state = {
    workflowStep: "DETAILS", videoId: "video-1", title: "手动改过的标题", description: "已改说明",
    identityMatches: true, uploaded: true, tagChips: ["其他"], missingTags: ["测试"],
    unexpectedTags: ["其他"], duplicateTags: [], settingsOk: false,
    settingsEvidence: { expected: {}, actual: {} }, thumbnailUrls: [], blockingDialogs: [],
  };
  const observe = () => inspect(pkg, "/fixture/video.mp4", { details }, async () => state,
    async () => ({}), async () => [], /Save/, evidence => ({ ok: true, evidence }),
    evidence => ({ ok: false, evidence }));
  const changed = await observe();
  for (const name of ["title", "description", "tags", "audience", "settings"]) {
    assert.equal(changed.gates[name].ok, false, `${name} 不能被历史回执掩盖`);
  }
  state.workflowStep = "VISIBILITY";
  const hidden = await observe();
  assert.equal(hidden.gates.title.ok, true, "离开详情页后仍可使用同 videoId 的详情回执");
  state.videoId = "another-video";
  assert.equal((await observe()).gates.title.ok, false, "回执不能跨视频复用");
});

test("YouTube cover or metadata repair returns from visibility to details", async () => {
  const mutate = new AsyncFunction("pkg", "videoPath", "expectedReceipts", "missingGate", `${source}
    const calls = [];
    let step = 'VISIBILITY';
    inspectYoutube = async () => ({
      evidence: { workflowStep: step, videoId: 'video-1' },
      gates: Object.fromEntries(['title','description','tags','audience','settings','draftIdentity','video','cover']
        .map(name => [name, { ok: name !== missingGate }])),
    });
    returnYoutubeToDetails = async () => { calls.push('details'); step = 'DETAILS'; return { ok: true }; };
    ensureYoutubeMetadata = async before => ({ ok: true, actions: {}, current: before });
    uploadYoutubeThumbnail = async () => { calls.push('thumbnail:' + step); return { ok: true, receipt: {} }; };
    const checkpointReceipts = () => ({});
    advanceYoutubeToVisibility = async () => { calls.push('visibility'); return { ok: true }; };
    ensureYoutubeVisibility = async () => ({ ok: true });
    await mutateYoutube();
    return calls;
  `);
  assert.deepEqual(await mutate(pkg, "/fixture/video.mp4", { details }, "cover"),
    ["details", "thumbnail:DETAILS", "visibility"]);
  assert.deepEqual(await mutate(pkg, "/fixture/video.mp4", { details }, "title"),
    ["details", "visibility"]);
});
