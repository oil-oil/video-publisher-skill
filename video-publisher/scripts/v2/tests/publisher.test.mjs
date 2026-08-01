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

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
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
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(30));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu","douyin"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:2,uploadConcurrency:2}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Circuit breaker",xhsTopics:["Test"],douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"channel-break","xiaohongshu","douyin","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log,VIDEO_PUBLISHER_V2_MOCK_BROKEN_CHANNEL:"douyin:upload",VIDEO_PUBLISHER_V2_MOCK_DELAYS:JSON.stringify({"douyin:upload_start":1,"douyin:prefill":1,"douyin:upload":1,"xiaohongshu:upload":150})}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr,/input channel broken; final verify parallel=2/);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  assert.equal(events.some(item=>item.phase==="mutate"),false,"a sibling that is not yet eligible must not start mutation after a shared Ego channel failure");
  assert.equal(events.filter(item=>item.phase==="verify"&&item.event==="start").length,2,"read-only final verification still records page truth");
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
  const second=await run(process.execPath,args,{env:{...baseEnv,VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_ID:"99"}});
  assert.equal(second.code,0,`${second.stderr}\n${second.stdout}`);
  const recovered=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(recovered.platforms.xiaohongshu.taskSpaceId,99);
  assert.equal(recovered.platforms.xiaohongshu.receiptTaskSpaceId,99);
  assert.equal(recovered.platforms.xiaohongshu.receipts.cover.taskSpaceId,99);
  assert.equal(recovered.platforms.xiaohongshu.receipts.legacyOnly,undefined);
  assert.equal(fs.existsSync(checkpointPath),false);

  recovered.platforms.xiaohongshu.receipts.legacyOnly={stale:true};
  await fs.promises.writeFile(statePath,JSON.stringify(recovered,null,2));
  await fs.promises.writeFile(checkpointPath,JSON.stringify({schemaVersion:2,platform:"xiaohongshu",fingerprint:recovered.fingerprint,taskSpaceId:99,receipts:{legacyOnly:{stale:true}}}));
  const recycled=await run(process.execPath,args,{env:{...baseEnv,VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_ID:"99",VIDEO_PUBLISHER_V2_MOCK_TASK_SPACE_RECREATED:"1"}});
  assert.equal(recycled.code,0,`${recycled.stderr}\n${recycled.stdout}`);
  const recycledState=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(recycledState.platforms.xiaohongshu.taskSpaceId,99);
  assert.equal(recycledState.platforms.xiaohongshu.receipts.legacyOnly,undefined,"a recreated space must invalidate receipts even when Ego reuses the same numeric id");
  assert.equal(fs.existsSync(checkpointPath),false);
});

test("publisher preserves the recorded task-space name when a retry changes its display suffix", async () => {
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
  assert.equal(recordedName,`video publisher v2 xiaohongshu original-suffix-${jobId}`);
  delete firstState.platforms.xiaohongshu.taskSpaceName;
  await fs.promises.writeFile(statePath,JSON.stringify(firstState,null,2));
  const second=await run(process.execPath,[...base,"changed-suffix",...tail],{env});
  assert.equal(second.code,0,`${second.stderr}\n${second.stdout}`);
  const recovered=JSON.parse(await fs.promises.readFile(statePath,"utf8"));
  assert.equal(recovered.platforms.xiaohongshu.taskSpaceName,recordedName,"legacy state should recover the stable name from its last evidence");
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
