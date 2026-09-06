import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const V2_DIR = path.dirname(DIR);
process.env.VIDEO_PUBLISHER_V2_LOCK_ROOT = path.join(os.tmpdir(), `video-publisher-publisher-test-locks-${process.pid}`);

function closeNamesFromLog(script) {
  const match = [...String(script).matchAll(/const closeNames = new Set\((\[.*?\])\)/gs)].at(-1);
  return match ? JSON.parse(match[1]) : [];
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...(options?.env || {}) };
    if (!options?.env?.VIDEO_PUBLISHER_V2_EGO_COMMAND) {
      env.VIDEO_PUBLISHER_V2_EGO_COMMAND = path.join(DIR, "mock-ego-cleanup.mjs");
    }
    const child = spawn(command, args, { ...options, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout="",stderr="";
    child.stdout.on("data",chunk=>{stdout+=chunk}); child.stderr.on("data",chunk=>{stderr+=chunk});
    child.on("error",reject); child.on("close",code=>resolve({code,stdout,stderr}));
  });
}

function box(type, payload) {
  const buffer = Buffer.alloc(8 + payload.length);
  buffer.writeUInt32BE(buffer.length, 0);
  buffer.write(type, 4, "ascii");
  payload.copy(buffer, 8);
  return buffer;
}

function mp4WithDuration(durationSeconds, timescale = 1000) {
  const payload = Buffer.alloc(20);
  payload.writeUInt32BE(timescale, 12);
  payload.writeUInt32BE(Math.round(durationSeconds * timescale), 16);
  return Buffer.concat([box("ftyp", Buffer.alloc(4)), box("moov", box("mvhd", payload))]);
}

function pngHeader(width, height, marker = 0) {
  const buffer = Buffer.alloc(25);
  buffer[0] = 0x89;
  buffer.write("PNG", 1, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = marker;
  return buffer;
}

test("resuming one platform keeps unfinished siblings resumable", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-subset-resume-"));
  try {
    const videoPath = path.join(root, "video.mp4");
    const packagePath = path.join(root, "package.json");
    const configPath = path.join(root, "config.json");
    const statePath = path.join(root, "subset-job", "state.json");
    await fs.promises.writeFile(videoPath, mp4WithDuration(30));
    await fs.promises.writeFile(packagePath, JSON.stringify({ videoPath, title: "子集恢复", tags: ["测试"] }));
    await fs.promises.writeFile(configPath, JSON.stringify({
      schemaVersion: 2, onboarding: { completed: true }, sourceDirectory: root,
      availablePlatforms: ["xiaohongshu", "douyin"], defaultPlatforms: ["xiaohongshu", "douyin"],
      declarations: { originalityPolicy: "all_videos_original" },
    }));
    const env = {
      ...process.env, VIDEO_PUBLISHER_CONFIG: configPath,
      VIDEO_PUBLISHER_V2_RUNNER: path.join(DIR, "mock-runner.mjs"),
    };
    const base = [path.join(V2_DIR, "publisher.mjs"), "--package", packagePath,
      "--job-id", "subset-job", "--state-root", root, "--no-cleanup-stale-spaces"];
    const blocker = { code: "AUTH_REQUIRED", requiresUser: true };
    const first = await run(process.execPath, [...base, "--platforms", "xiaohongshu,douyin"], {
      env: { ...env, VIDEO_PUBLISHER_V2_MOCK_BLOCKERS: JSON.stringify({ "xiaohongshu:inspect": blocker, "douyin:inspect": blocker }) },
    });
    assert.equal(first.code, 10, first.stderr);
    const second = await run(process.execPath, [...base, "--platform", "xiaohongshu", "--operation", "resume"], { env });
    assert.equal(second.code, 0, second.stderr);
    const partial = JSON.parse(await fs.promises.readFile(statePath, "utf8"));
    assert.equal(partial.platforms.xiaohongshu.verdict.ready, true);
    assert.equal(partial.platforms.douyin.verdict.ready, false);
    assert.equal(partial.status, "blocked", "单平台完成不能将整个 Job 标为 READY");
    const third = await run(process.execPath, [...base, "--platform", "douyin", "--operation", "resume"], { env });
    assert.equal(third.code, 0, third.stderr);
    assert.equal(JSON.parse(await fs.promises.readFile(statePath, "utf8")).status, "ready");
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("publisher prefills Douyin metadata before waiting for upload completion", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-douyin-prefill-test-"));
  const log=path.join(root,"events.ndjson");
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["douyin"],defaultPlatforms:["douyin"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Early prefill",douyinDescription:"Fill while uploading.",douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"douyin-prefill","douyin","--state-root",root],{env:{
    ...process.env,
    VIDEO_PUBLISHER_CONFIG:configPath,
    VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),
    VIDEO_PUBLISHER_V2_MOCK_LOG:log,
    VIDEO_PUBLISHER_V2_MOCK_DELAYS:JSON.stringify({"douyin:upload_start":10,"douyin:prefill":20,"douyin:upload":120}),
  }});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  assert.deepEqual(events.filter(item=>item.event==="start").map(item=>item.phase),["inspect","upload_start","prefill","upload","mutate","verify"]);
  const prefillEnd=events.find(item=>item.phase==="prefill"&&item.event==="end").at;
  const completionWaitStart=events.find(item=>item.phase==="upload"&&item.event==="start").at;
  const finalMutationStart=events.find(item=>item.phase==="mutate"&&item.event==="start").at;
  const completionWaitEnd=events.find(item=>item.phase==="upload"&&item.event==="end").at;
  assert.ok(prefillEnd<=completionWaitStart,{prefillEnd,completionWaitStart});
  assert.ok(finalMutationStart>=completionWaitEnd,{finalMutationStart,completionWaitEnd});
  assert.equal(JSON.parse(result.stdout).ready,true);
});

test("publisher prefills YouTube details during upload and reaches verified private draft state", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-v2-youtube-prefill-test-"));
  const log = path.join(root, "events.ndjson");
  const videoPath = path.join(root, "sample-video.mp4");
  const packagePath = path.join(root, "package.json");
  const configPath = path.join(root, "config.json");
  await fs.promises.writeFile(videoPath, mp4WithDuration(30));
  await fs.promises.writeFile(configPath, JSON.stringify({
    schemaVersion: 2,
    onboarding: { completed: true },
    sourceDirectory: root,
    availablePlatforms: ["youtube"],
    defaultPlatforms: ["youtube"],
    declarations: { originalityPolicy: "ask_each_run" },
    platforms: { youtube: { defaultVisibility: "private" } },
    execution: { checkConcurrency: 1, uploadConcurrency: 1 },
  }));
  await fs.promises.writeFile(packagePath, JSON.stringify({
    videoPath,
    title: "YouTube prefill",
    youtubeDescription: "Fill details while uploading.",
    youtubeTags: ["DeepSeek", "Codex"],
    youtubeAudience: "not_made_for_kids",
    youtubeVisibility: "private",
    cover: { uploadCustomCover: false },
  }));
  const result = await run(process.execPath, [
    path.join(V2_DIR, "publisher.mjs"),
    packagePath,
    "youtube-prefill",
    "youtube",
    "--state-root", root,
  ], {
    env: {
      ...process.env,
      VIDEO_PUBLISHER_CONFIG: configPath,
      VIDEO_PUBLISHER_V2_RUNNER: path.join(DIR, "mock-runner.mjs"),
      VIDEO_PUBLISHER_V2_MOCK_LOG: log,
      VIDEO_PUBLISHER_V2_MOCK_DELAYS: JSON.stringify({
        "youtube:upload_start": 10,
        "youtube:prefill": 20,
        "youtube:upload": 100,
      }),
    },
  });
  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  const events = (await fs.promises.readFile(log, "utf8")).trim().split(/\n/).map(line => JSON.parse(line));
  assert.deepEqual(events.filter(item => item.event === "start").map(item => item.phase), [
    "inspect", "upload_start", "prefill", "upload", "mutate", "verify",
  ]);
  assert.equal(JSON.parse(result.stdout).platforms.youtube.ready, true);
});

test("publisher uses upload-time prefill for Xiaohongshu, Bilibili, and WeChat Channels", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-early-prefill-platforms-test-"));
  const log=path.join(root,"events.ndjson");
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu","bilibili","wechat_channels"],defaultPlatforms:["xiaohongshu","bilibili","wechat_channels"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:3,uploadConcurrency:3}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Early metadata",xhsTopics:["Test"],bilibiliDescription:"Complete after upload.",bilibiliTags:["Test"],wechatDescription:"Early metadata\n\n#Test",wechatTags:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"early-prefill-platforms","xiaohongshu","bilibili","wechat_channels","--state-root",root],{env:{
    ...process.env,
    VIDEO_PUBLISHER_CONFIG:configPath,
    VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),
    VIDEO_PUBLISHER_V2_MOCK_LOG:log,
    VIDEO_PUBLISHER_V2_MOCK_DELAYS:JSON.stringify({"xiaohongshu:upload":40,"bilibili:upload":40,"wechat_channels:upload":40}),
  }});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  for(const platform of ["xiaohongshu","bilibili","wechat_channels"]){
    const phases=events.filter(item=>item.platform===platform&&item.event==="start").map(item=>item.phase);
    assert.deepEqual(phases,["inspect","upload_start","prefill","upload","mutate","verify"]);
    const prefillEnd=events.find(item=>item.platform===platform&&item.phase==="prefill"&&item.event==="end").at;
    const uploadStart=events.find(item=>item.platform===platform&&item.phase==="upload"&&item.event==="start").at;
    assert.ok(prefillEnd<=uploadStart,{platform,prefillEnd,uploadStart});
  }
});

test("publisher defers a retryable prefill failure until upload completion", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-prefill-defer-test-"));
  const log=path.join(root,"events.ndjson");
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["bilibili"],defaultPlatforms:["bilibili"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Deferred prefill",bilibiliDescription:"Deferred prefill",bilibiliTags:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"prefill-defer","bilibili","--state-root",root],{env:{
    ...process.env,
    VIDEO_PUBLISHER_CONFIG:configPath,
    VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),
    VIDEO_PUBLISHER_V2_MOCK_LOG:log,
    VIDEO_PUBLISHER_V2_MOCK_BLOCKERS:JSON.stringify({"bilibili:prefill":{code:"PLATFORM_REJECTED_METADATA",message:"tag not stable yet",retryable:true,requiresUser:false}}),
  }});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr,/prefill deferred until upload completion/);
  const phases=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line)).filter(item=>item.event==="start").map(item=>item.phase);
  assert.deepEqual(phases,["inspect","upload_start","prefill","upload","mutate","verify"]);
});

test("publisher advances a successful platform before a slow blocked upload exits", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-test-"));
  const log=path.join(root,"events.ndjson");
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(configPath,JSON.stringify({
    schemaVersion:1,
    onboarding:{completed:true},
    sourceDirectory:root,
    defaultPlatforms:["xiaohongshu","douyin"]
  }));
  await fs.promises.writeFile(packagePath,JSON.stringify({
    videoPath,
    title:"Automation test",
    douyinTopics:["Automation","Tutorial"],
    bilibiliDescription:"Generic orchestration test.",
    bilibiliTags:["Automation","Tutorial"],
    xhsTopics:["Automation","Tutorial"],
    wechatDescription:"Automation test\n\n#Automation #Tutorial",
    wechatTags:["Automation","Tutorial"],
    cover:{uploadCustomCover:false}
  }));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"test","xiaohongshu","douyin","--confirm-original-rights","--state-root",root],{env:{
    ...process.env,
    VIDEO_PUBLISHER_CONFIG:configPath,
    VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),
    VIDEO_PUBLISHER_V2_MOCK_LOG:log,
    VIDEO_PUBLISHER_V2_MOCK_DELAYS:JSON.stringify({"xiaohongshu:upload":10,"douyin:upload":180}),
    VIDEO_PUBLISHER_V2_MOCK_BLOCKERS:JSON.stringify({"douyin:upload":{code:"UPLOAD_STALLED",message:"mock stalled upload",retryable:true,requiresUser:false}}),
  }});
  assert.equal(result.code,10,`${result.stderr}\n${result.stdout}`);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  const blockedUploadEnd=events.find(item=>item.platform==="douyin"&&item.phase==="upload"&&item.event==="end").at;
  const successfulMutationStart=events.find(item=>item.platform==="xiaohongshu"&&item.phase==="mutate"&&item.event==="start").at;
  assert.ok(successfulMutationStart<blockedUploadEnd,{successfulMutationStart,blockedUploadEnd});
  assert.equal(events.some(item=>item.platform==="douyin"&&["mutate","verify"].includes(item.phase)),false,"the blocked platform must be frozen after its typed blocker");
  const summary=JSON.parse(result.stdout);
  assert.equal(summary.ready,false);
  assert.equal(summary.platforms.xiaohongshu.ready,true);
  assert.equal(summary.platforms.douyin.blocker.code,"UPLOAD_STALLED");
  assert.equal(summary.scheduler.uiConcurrency,1);
});

test("publisher isolates authentication failure to one platform", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-auth-isolation-test-"));
  const log=path.join(root,"events.ndjson");
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu","douyin"],defaultPlatforms:["xiaohongshu","douyin"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:2,uploadConcurrency:2}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Auth isolation",xhsTopics:["Test"],douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"auth-isolation","xiaohongshu","douyin","--state-root",root],{env:{
    ...process.env,
    VIDEO_PUBLISHER_CONFIG:configPath,
    VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),
    VIDEO_PUBLISHER_V2_MOCK_LOG:log,
    VIDEO_PUBLISHER_V2_MOCK_BLOCKERS:JSON.stringify({"douyin:inspect":{code:"AUTH_REQUIRED",message:"mock login required",retryable:false,requiresUser:true}}),
  }});
  assert.equal(result.code,10,`${result.stderr}\n${result.stdout}`);
  const summary=JSON.parse(result.stdout);
  assert.equal(summary.status,"blocked");
  assert.equal(summary.platforms.xiaohongshu.ready,true);
  assert.equal(summary.platforms.douyin.blocker.code,"AUTH_REQUIRED");
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  assert.deepEqual(events.filter(item=>item.platform==="douyin").map(item=>item.phase),["inspect","inspect"]);
});

test("publisher keeps explicit user control as a global stop", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-user-control-test-"));
  const log=path.join(root,"events.ndjson");
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu","douyin"],defaultPlatforms:["xiaohongshu","douyin"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:2,uploadConcurrency:2}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"User control stop",xhsTopics:["Test"],douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"user-control","xiaohongshu","douyin","--state-root",root],{env:{
    ...process.env,
    VIDEO_PUBLISHER_CONFIG:configPath,
    VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),
    VIDEO_PUBLISHER_V2_MOCK_LOG:log,
    VIDEO_PUBLISHER_V2_MOCK_BLOCKERS:JSON.stringify({"douyin:inspect":{code:"USER_CONTROL",message:"mock user takeover",retryable:false,requiresUser:true}}),
  }});
  assert.equal(result.code,10,`${result.stderr}\n${result.stdout}`);
  const summary=JSON.parse(result.stdout);
  assert.equal(summary.status,"paused_user");
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  assert.equal(events.some(item=>item.phase!=="inspect"),false,"no browser phase may start after explicit user control");
});

test("publisher circuit-breaks all UI mutation after an upload loses Ego", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-channel-break-test-"));
  const log=path.join(root,"events.ndjson");
  const cleanupLog=path.join(root,"cleanup.log");
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu","douyin"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:2,uploadConcurrency:2}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Circuit breaker",xhsTopics:["Test"],douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"channel-break","xiaohongshu","douyin","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log,VIDEO_PUBLISHER_V2_CLEANUP_LOG:cleanupLog,VIDEO_PUBLISHER_V2_MOCK_BROKEN_CHANNEL:"douyin:upload",VIDEO_PUBLISHER_V2_MOCK_DELAYS:JSON.stringify({"douyin:upload_start":1,"douyin:prefill":1,"douyin:upload":1,"xiaohongshu:upload":150})}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr,/input channel broken; final verify parallel=2/);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  assert.equal(events.some(item=>item.phase==="mutate"),false,"a sibling that is not yet eligible must not start mutation after a shared Ego channel failure");
  assert.equal(events.filter(item=>item.phase==="verify"&&item.event==="start").length,2,"read-only final verification still records page truth");
  assert.equal(fs.existsSync(cleanupLog),false,"共享输入通道失败后不能继续关闭浏览器空间");
});

test("publisher stops the serial UI queue when a mutator loses Ego", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-mutation-break-test-"));
  const log=path.join(root,"events.ndjson");
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu","douyin","bilibili","wechat_channels"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:4,uploadConcurrency:4}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Mutation break",xhsTopics:["Test"],douyinTopics:["Test"],bilibiliDescription:"Mutation circuit breaker",bilibiliTags:["Test"],wechatDescription:"Mutation circuit breaker\n\n#Test",wechatTags:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"mutation-break","xiaohongshu","douyin","bilibili","wechat_channels","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log,VIDEO_PUBLISHER_V2_MOCK_BROKEN_CHANNEL:"douyin:mutate",VIDEO_PUBLISHER_V2_MOCK_DELAYS:JSON.stringify({"xiaohongshu:upload":1,"douyin:upload_start":1,"douyin:prefill":1,"douyin:upload":40,"bilibili:upload":200,"wechat_channels:upload":250})}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  const mutationStarts=events.filter(item=>item.phase==="mutate"&&item.event==="start").map(item=>item.platform);
  assert.equal(mutationStarts.includes("douyin"),true,"the configured broken mutator must start");
  assert.equal(mutationStarts.some(platform=>["bilibili","wechat_channels"].includes(platform)),false,"platforms queued after the broken mutator must never start UI mutation");
  assert.equal(events.some(item=>item.platform==="xiaohongshu"&&item.phase==="prefill"),true,"safe upload-time prefill may finish before the later shared-channel failure");
  assert.equal(events.filter(item=>item.phase==="verify"&&item.event==="start").length,4,"final read-only verification still records every platform");
});

test("publisher blocks browser work when onboarding is incomplete", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-onboarding-test-"));
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(configPath,"{}");
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),path.join(root,"missing-package.json")],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath}});
  assert.equal(result.code,1);
  assert.match(result.stderr,/onboarding is incomplete/);
});

test("inspect-only returns blocked when the Ego input channel is unavailable", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-inspect-blocked-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Inspect blocker",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu"],defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"inspect-blocked","xiaohongshu","--inspect-only","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_BROKEN_CHANNEL:"xiaohongshu:inspect"}});
  assert.equal(result.code,10,`${result.stderr}\n${result.stdout}`);
  assert.equal(JSON.parse(result.stdout).status,"blocked");
});

test("publisher rejects a job id that can escape the state root", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-job-id-test-"));
  const configPath=path.join(root,"config.json");
  const escapeName=`escape-${path.basename(root)}`;
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu"],defaultPlatforms:["xiaohongshu"]}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),path.join(root,"missing.json"),"--job-id",`../${escapeName}`],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath}});
  assert.equal(result.code,2);
  assert.match(result.stderr,/--job-id must be/);
  assert.equal(fs.existsSync(path.join(path.dirname(root),escapeName)),false);
});

test("publisher rejects platforms that were not configured as available", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-platform-availability-test-"));
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu"],defaultPlatforms:["xiaohongshu"]}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),path.join(root,"missing-package.json"),"availability-test","douyin"],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(result.code,2);
  assert.match(result.stderr,/Platform is not configured as available: douyin/);
  assert.equal(fs.existsSync(log),false,"unavailable platforms must be rejected before browser work");
  await fs.promises.rm(root,{recursive:true,force:true});
});

test("publisher allows an available non-default platform when explicitly selected", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-platform-override-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Availability override",douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu","douyin"],defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:2,uploadConcurrency:2}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"availability-override","douyin","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  assert.deepEqual(new Set(events.map(item=>item.platform)),new Set(["douyin"]));
  await fs.promises.rm(root,{recursive:true,force:true});
});

test("publisher requires current-run confirmation when onboarding policy asks each run", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-rights-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Rights test",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"xiaohongshu"],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(result.code,2);
  assert.match(result.stderr,/Originality confirmation is required/);
  assert.equal(fs.existsSync(log),false,"browser runner must not start without current-run rights confirmation");
});

test("publisher accepts onboarded all-videos-original policy without a one-run flag", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-standing-rights-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Standing rights test",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"xiaohongshu","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  assert.equal(fs.existsSync(log),true,"browser runner should start under the standing originality policy");
  assert.equal(JSON.parse(result.stdout).ready,true);
});

test("publisher accepts verified long-form Douyin video before browser work", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-duration-test-"));
  const videoPath=path.join(root,"too-long.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(videoPath,mp4WithDuration(901));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["douyin"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Duration test",douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"duration-test","douyin","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  assert.equal(fs.existsSync(log),true,"browser runner should start for verified long-form media");
});

test("publisher prepares verified long-form media for Douyin and eligible sibling platforms", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-partial-preflight-test-"));
  const videoPath=path.join(root,"too-long-for-douyin.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(videoPath,mp4WithDuration(901));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu","douyin"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:2,uploadConcurrency:2}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Partial preflight",xhsTopics:["Test"],douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"partial-preflight","xiaohongshu","douyin","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  const summary=JSON.parse(result.stdout);
  assert.equal(summary.platforms.xiaohongshu.ready,true);
  assert.equal(summary.platforms.douyin.ready,true);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  assert.deepEqual(new Set(events.map(item=>item.platform)),new Set(["xiaohongshu","douyin"]));
});

test("publisher invalidates receipts and checkpoints when Ego recreates a task space", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-task-recreate-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const jobId="task-recreate-job";
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Task recreate",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const args=[path.join(V2_DIR,"publisher.mjs"),packagePath,"task-recreate","xiaohongshu","--job-id",jobId,"--state-root",root];
  const baseEnv={...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs")};
  const first=await run(process.execPath,args,{env:baseEnv});
  assert.equal(first.code,0,`${first.stderr}\n${first.stdout}`);
  const statePath=path.join(root,jobId,"state.json");
  const state=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  state.platforms.xiaohongshu.receipts.legacyOnly={stale:true};
  state.platforms.xiaohongshu.receiptTaskSpaceId=11;
  await fs.promises.writeFile(statePath,JSON.stringify(state,null,2));
  const checkpointPath=path.join(root,jobId,"checkpoints","xiaohongshu.receipts.json");
  await fs.promises.writeFile(checkpointPath,JSON.stringify({schemaVersion:2,platform:"xiaohongshu",fingerprint:state.fingerprint,taskSpaceId:11,receipts:{legacyOnly:{stale:true}}}));
  state.status="running";
  await fs.promises.writeFile(statePath,JSON.stringify(state,null,2));
  const second=await run(process.execPath,args,{env:{...baseEnv,VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_ID:"99"}});
  assert.equal(second.code,0,`${second.stderr}\n${second.stdout}`);
  const recovered=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(recovered.platforms.xiaohongshu.taskSpaceId,99);
  assert.equal(recovered.platforms.xiaohongshu.receiptTaskSpaceId,99);
  assert.equal(recovered.platforms.xiaohongshu.receipts.cover.taskSpaceId,99);
  assert.equal(recovered.platforms.xiaohongshu.receipts.legacyOnly,undefined);
  assert.equal(fs.existsSync(checkpointPath),false);

  recovered.platforms.xiaohongshu.receipts.legacyOnly={stale:true};
  recovered.status="running";
  await fs.promises.writeFile(statePath,JSON.stringify(recovered,null,2));
  await fs.promises.writeFile(checkpointPath,JSON.stringify({schemaVersion:2,platform:"xiaohongshu",fingerprint:recovered.fingerprint,taskSpaceId:99,receipts:{legacyOnly:{stale:true}}}));
  const recycled=await run(process.execPath,args,{env:{...baseEnv,VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_ID:"99",VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_RECREATED:"1"}});
  assert.equal(recycled.code,0,`${recycled.stderr}\n${recycled.stdout}`);
  const recycledState=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(recycledState.platforms.xiaohongshu.taskSpaceId,99);
  assert.equal(recycledState.platforms.xiaohongshu.receipts.legacyOnly,undefined,"a recreated space must invalidate receipts even when Ego reuses the same numeric id");
  assert.equal(fs.existsSync(checkpointPath),false);
});

test("publisher refuses an implicit duplicate after READY", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-task-name-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const jobId="stable-task-name-job";
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Stable task name",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const base=[path.join(V2_DIR,"publisher.mjs"),packagePath];
  const tail=["xiaohongshu","--job-id",jobId,"--state-root",root];
  const env={...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs")};
  const first=await run(process.execPath,[...base,"original-suffix",...tail],{env});
  assert.equal(first.code,0,`${first.stderr}\n${first.stdout}`);
  const statePath=path.join(root,jobId,"state.json");
  const firstState=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  const recordedName=firstState.platforms.xiaohongshu.taskSpaceName;
  assert.match(recordedName, new RegExp(`^video publisher v2 xiaohongshu original-suffix-${jobId}-[a-z0-9]+-[a-z0-9]+$`));
  const second=await run(process.execPath,[...base,"changed-suffix",...tail],{env});
  assert.equal(second.code,2);
  assert.match(second.stderr,/already READY/);
  const unchanged=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(unchanged.platforms.xiaohongshu.taskSpaceName,recordedName);
  assert.equal((unchanged.retiredSpaces || []).some(item=>item.name===recordedName),false);
});

test("replace-cover reuses the READY draft and never uploads video again", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-replace-cover-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const firstCover=path.join(root,"cover-one.png");
  const secondCover=path.join(root,"cover-two.png");
  const firstPackage=path.join(root,"package-one.json");
  const secondPackage=path.join(root,"package-two.json");
  const configPath=path.join(root,"config.json");
  const firstLog=path.join(root,"first.ndjson");
  const replaceLog=path.join(root,"replace.ndjson");
  const jobId="replace-cover-job";
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(firstCover,pngHeader(1080,1440,1));
  await fs.promises.writeFile(secondCover,pngHeader(1080,1440,2));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu"],defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  const shared={videoPath,title:"Replace cover",xhsTopics:["Test"]};
  await fs.promises.writeFile(firstPackage,JSON.stringify({...shared,cover:{uploadCustomCover:true,vertical3x4Path:firstCover}}));
  await fs.promises.writeFile(secondPackage,JSON.stringify({...shared,cover:{uploadCustomCover:true,vertical3x4Path:secondCover}}));
  const env={...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs")};
  const first=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),firstPackage,"replace-cover","xiaohongshu","--job-id",jobId,"--state-root",root],{env:{...env,VIDEO_PUBLISHER_V2_MOCK_LOG:firstLog}});
  assert.equal(first.code,0,`${first.stderr}\n${first.stdout}`);
  const before=JSON.parse(await fs.promises.readFile(path.join(root,jobId,"state.json"),"utf8"));
  const beforeSpace=before.platforms.xiaohongshu.taskSpaceId;
  const beforeFingerprint=before.fingerprint;
  before.platforms.xiaohongshu.videoReceipt={fingerprint:beforeFingerprint,taskSpaceId:beforeSpace,mode:"injected",observedAt:new Date().toISOString()};
  await fs.promises.writeFile(path.join(root,jobId,"state.json"),JSON.stringify(before,null,2));
  const replaced=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),secondPackage,"replace-cover","xiaohongshu","--job-id",jobId,"--state-root",root,"--operation","replace-cover"],{env:{...env,VIDEO_PUBLISHER_V2_MOCK_LOG:replaceLog,VIDEO_PUBLISHER_V2_MOCK_EXISTING_READY:"1"}});
  assert.equal(replaced.code,0,`${replaced.stderr}\n${replaced.stdout}`);
  const events=(await fs.promises.readFile(replaceLog,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  assert.deepEqual(events.filter(item=>item.event==="start").map(item=>item.phase),["inspect","mutate","verify"]);
  const after=JSON.parse(await fs.promises.readFile(path.join(root,jobId,"state.json"),"utf8"));
  assert.equal(after.platforms.xiaohongshu.taskSpaceId,beforeSpace);
  assert.notEqual(after.fingerprint,beforeFingerprint);
  assert.equal(after.video.sha256,before.video.sha256);
  assert.equal(after.platforms.xiaohongshu.videoReceipt.fingerprint,after.fingerprint);
  assert.equal(after.platforms.xiaohongshu.receipts.cover.mock,true);
  assert.equal(after.status,"ready");
});

test("replace-cover rejects metadata changes before browser work", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-replace-cover-identity-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const firstCover=path.join(root,"cover-one.png");
  const secondCover=path.join(root,"cover-two.png");
  const firstPackage=path.join(root,"package-one.json");
  const secondPackage=path.join(root,"package-two.json");
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"replace.ndjson");
  const jobId="replace-cover-identity-job";
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(firstCover,pngHeader(1080,1440,1));
  await fs.promises.writeFile(secondCover,pngHeader(1080,1440,2));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu"],defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(firstPackage,JSON.stringify({videoPath,title:"Original title",xhsTopics:["Test"],cover:{uploadCustomCover:true,vertical3x4Path:firstCover}}));
  await fs.promises.writeFile(secondPackage,JSON.stringify({videoPath,title:"Changed title",xhsTopics:["Test"],cover:{uploadCustomCover:true,vertical3x4Path:secondCover}}));
  const env={...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs")};
  const first=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),firstPackage,"replace-cover","xiaohongshu","--job-id",jobId,"--state-root",root],{env});
  assert.equal(first.code,0,`${first.stderr}\n${first.stdout}`);
  const rejected=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),secondPackage,"replace-cover","xiaohongshu","--job-id",jobId,"--state-root",root,"--replace-cover"],{env:{...env,VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(rejected.code,2);
  assert.match(rejected.stderr,/may change only cover/);
  assert.equal(fs.existsSync(log),false);
});

test("publisher recovers a missing space name from last evidence when reusing a space", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-reuse-space-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const jobId="reuse-task-name-job";
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Reuse task name",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const base=[path.join(V2_DIR,"publisher.mjs"),packagePath];
  const tail=["xiaohongshu","--job-id",jobId,"--state-root",root,"--reuse-space"];
  const env={...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs")};
  const first=await run(process.execPath,[...base,"original-suffix",...tail],{env});
  assert.equal(first.code,0,`${first.stderr}\n${first.stdout}`);
  const statePath=path.join(root,jobId,"state.json");
  const firstState=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  const recordedName=firstState.platforms.xiaohongshu.taskSpaceName;
  assert.equal(recordedName,`video publisher v2 xiaohongshu original-suffix-${jobId}`);
  delete firstState.platforms.xiaohongshu.taskSpaceName;
  firstState.status = "blocked";
  await fs.promises.writeFile(statePath,JSON.stringify(firstState,null,2));
  const second=await run(process.execPath,[...base,"changed-suffix",...tail],{env});
  assert.equal(second.code,0,`${second.stderr}\n${second.stdout}`);
  const recovered=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(recovered.platforms.xiaohongshu.taskSpaceName,recordedName,"legacy state should recover the stable name from its last evidence");
});

test("publisher keeps the recorded space when resuming an in-progress job", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-resume-space-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const jobId="resume-space-job";
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Resume space",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const args=[path.join(V2_DIR,"publisher.mjs"),packagePath,"resume-suffix","xiaohongshu","--job-id",jobId,"--state-root",root];
  const env={...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs")};
  const first=await run(process.execPath,args,{env});
  assert.equal(first.code,0,`${first.stderr}\n${first.stdout}`);
  const statePath=path.join(root,jobId,"state.json");
  const firstState=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  const recordedName=firstState.platforms.xiaohongshu.taskSpaceName;
  firstState.status = "running";
  await fs.promises.writeFile(statePath,JSON.stringify(firstState,null,2));
  const second=await run(process.execPath,args,{env});
  assert.equal(second.code,0,`${second.stderr}\n${second.stdout}`);
  const resumed=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(resumed.platforms.xiaohongshu.taskSpaceName, recordedName);
});

test("default READY run leaves the current draft space open", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-default-keep-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const jobId="default-keep-job";
  const log=path.join(root,"cleanup.log");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Default keep",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"default-keep","xiaohongshu","--job-id",jobId,"--state-root",root],{env:{
    ...process.env,
    VIDEO_PUBLISHER_CONFIG:configPath,
    VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),
    VIDEO_PUBLISHER_V2_CLEANUP_LOG:log,
  }});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  const state=JSON.parse(await fs.promises.readFile(path.join(root,jobId,"state.json"),"utf8"));
  assert.equal(state.keepSpace,true);
  const name=state.platforms.xiaohongshu.taskSpaceName;
  assert.ok(name);
  if (fs.existsSync(log)) {
    assert.equal(closeNamesFromLog(await fs.promises.readFile(log,"utf8")).includes(name), false);
  }
});

test("inspect-only on an in-progress job keeps the recorded space and status", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-inspect-running-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const jobId="inspect-running-job";
  const log=path.join(root,"cleanup.log");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Inspect running",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const env={...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_CLEANUP_LOG:log};
  const first=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"inspect-run","xiaohongshu","--job-id",jobId,"--state-root",root,"--keep-space"],{env});
  assert.equal(first.code,0,`${first.stderr}\n${first.stdout}`);
  const statePath=path.join(root,jobId,"state.json");
  const firstState=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  const recordedName=firstState.platforms.xiaohongshu.taskSpaceName;
  firstState.status="running";
  await fs.promises.writeFile(statePath,JSON.stringify(firstState,null,2));
  const inspected=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"inspect-run","xiaohongshu","--job-id",jobId,"--state-root",root,"--inspect-only"],{env});
  assert.equal(inspected.code,0,`${inspected.stderr}\n${inspected.stdout}`);
  const after=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(after.status,"running");
  assert.equal(after.platforms.xiaohongshu.taskSpaceName,recordedName);
  const script=await fs.promises.readFile(log,"utf8");
  assert.equal(closeNamesFromLog(script).includes(recordedName), false);
});

test("keep-space survives a later job stale sweep", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-keep-space-"));
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"cleanup.log");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  const env={...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_CLEANUP_LOG:log};
  async function writePackage(name) {
    const videoPath=path.join(root,`${name}.mp4`);
    const packagePath=path.join(root,`${name}.json`);
    await fs.promises.writeFile(videoPath,`video ${name}`);
    await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:name,xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
    return packagePath;
  }
  const firstPkg=await writePackage("keep-a");
  const secondPkg=await writePackage("keep-b");
  const first=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),firstPkg,"keep-a","xiaohongshu","--job-id","job-a","--state-root",root,"--keep-space"],{env});
  assert.equal(first.code,0,`${first.stderr}\n${first.stdout}`);
  const kept=JSON.parse(await fs.promises.readFile(path.join(root,"job-a","state.json"),"utf8"));
  assert.equal(kept.keepSpace,true);
  const keptName=kept.platforms.xiaohongshu.taskSpaceName;
  const second=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),secondPkg,"keep-b","xiaohongshu","--job-id","job-b","--state-root",root],{env});
  assert.equal(second.code,0,`${second.stderr}\n${second.stdout}`);
  const script=await fs.promises.readFile(log,"utf8");
  assert.equal(closeNamesFromLog(script).includes(keptName), false);
  assert.equal(JSON.parse(await fs.promises.readFile(path.join(root,"job-a","state.json"),"utf8")).keepSpace,true);
});

test("cleanup-only --package does not close a running job space", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-cleanup-running-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const jobId="cleanup-running-job";
  const log=path.join(root,"cleanup.log");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Cleanup running",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const env={...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_CLEANUP_LOG:log};
  const first=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"cleanup-run","xiaohongshu","--job-id",jobId,"--state-root",root,"--keep-space"],{env});
  assert.equal(first.code,0,`${first.stderr}\n${first.stdout}`);
  const statePath=path.join(root,jobId,"state.json");
  const firstState=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  const recordedName=firstState.platforms.xiaohongshu.taskSpaceName;
  firstState.status="running";
  await fs.promises.writeFile(statePath,JSON.stringify(firstState,null,2));
  const cleaned=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),"--cleanup-only","--package",packagePath,"--job-id",jobId,"--state-root",root],{env});
  assert.equal(cleaned.code,0,`${cleaned.stderr}\n${cleaned.stdout}`);
  const after=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(after.status,"running");
  assert.equal(after.platforms.xiaohongshu.taskSpaceName,recordedName);
  const script=await fs.promises.readFile(log,"utf8");
  assert.equal(closeNamesFromLog(script).includes(recordedName), false);
});

test("cleanup-only asks Ego to close completed leftover spaces", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-cleanup-only-test-"));
  const other=path.join(root,"ready-job");
  const log=path.join(root,"cleanup.log");
  await fs.promises.mkdir(other, { recursive: true });
  await fs.promises.writeFile(path.join(other,"state.json"), JSON.stringify({
    status: "ready",
    platforms: { douyin: { taskSpaceId: 21, taskSpaceName: "old douyin leftover" } },
  }));
  const result=await run(process.execPath,[
    path.join(V2_DIR,"publisher.mjs"),
    "--cleanup-only",
    "--state-root", root,
    "--no-cleanup-stale-spaces",
  ], { env: { ...process.env, VIDEO_PUBLISHER_V2_CLEANUP_LOG: log } });
  // --no-cleanup-stale-spaces with no package has nothing to close; rerun with default stale cleanup
  const cleaned=await run(process.execPath,[
    path.join(V2_DIR,"publisher.mjs"),
    "--cleanup-only",
    "--state-root", root,
  ], { env: { ...process.env, VIDEO_PUBLISHER_V2_CLEANUP_LOG: log } });
  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(cleaned.code, 0, `${cleaned.stderr}\n${cleaned.stdout}`);
  const script = await fs.promises.readFile(log, "utf8");
  assert.match(script, /old douyin leftover/);
  assert.match(script, /oil-collect-publish/);
});

test("two publishers for the same job produce one winner and one immediate refusal", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-double-run-test-"));
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Double run",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  const args=[path.join(V2_DIR,"publisher.mjs"),packagePath,"double-run","xiaohongshu","--job-id","shared-job","--state-root",root];
  const options={env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}};
  const results=await Promise.all([run(process.execPath,args,options),run(process.execPath,args,options)]);
  assert.deepEqual(results.map(item=>item.code).sort(),[0,1]);
  const winner=results.find(item=>item.code===0);
  const refused=results.find(item=>item.code===1);
  assert.equal(JSON.parse(winner.stdout).ready,true);
  assert.match(refused.stderr,/already running.+refusing a second orchestrator/);
  assert.equal(fs.existsSync(path.join(root,"shared-job","orchestrator.lock")),false);
});

test("two different jobs under different state roots cannot split platform ownership", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-global-lock-test-"));
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  const packagePaths=[];
  for (const suffix of ["a","b"]) {
    const videoPath=path.join(root,`sample-${suffix}.mp4`);
    const packagePath=path.join(root,`package-${suffix}.json`);
    await fs.promises.writeFile(videoPath,`test video fixture ${suffix}`);
    await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:`Global lock ${suffix}`,xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
    packagePaths.push(packagePath);
  }
  const options={env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}};
  const stateRootFor=jobId=>path.join(root,`state-${jobId}`);
  const argsFor=(packagePath,jobId)=>[path.join(V2_DIR,"publisher.mjs"),packagePath,"global-lock","xiaohongshu","--job-id",jobId,"--state-root",stateRootFor(jobId)];
  const results=await Promise.all([
    run(process.execPath,argsFor(packagePaths[0],"job-a"),options),
    run(process.execPath,argsFor(packagePaths[1],"job-b"),options),
  ]);
  assert.deepEqual(results.map(item=>item.code).sort(),[0,1]);
  const winner=results.find(item=>item.code===0);
  const refused=results.find(item=>item.code===1);
  assert.equal(JSON.parse(winner.stdout).ready,true);
  assert.match(refused.stderr,/Another video publishing job is already running/);
  const stateFiles=["job-a","job-b"].filter(jobId=>fs.existsSync(path.join(stateRootFor(jobId),jobId,"state.json")));
  assert.equal(stateFiles.length,1,"the refused job must not write state");
  assert.equal(fs.existsSync(path.join(process.env.VIDEO_PUBLISHER_V2_LOCK_ROOT,"publisher","orchestrator.lock")),false);
});
