import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const V2_DIR = path.dirname(DIR);

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

test("publisher waits for every upload process before serial UI mutation", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-test-"));
  const log=path.join(root,"events.ndjson");
  const videoPath=path.join(root,"sample-video.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(configPath,JSON.stringify({
    schemaVersion:1,
    onboarding:{completed:true},
    sourceDirectory:root,
    defaultPlatforms:["xiaohongshu","douyin","bilibili","wechat_channels"]
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
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"test","--confirm-original-rights","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  const lastUploadEnd=Math.max(...events.filter(item=>item.phase==="upload"&&item.event==="end").map(item=>item.at));
  const firstMutationStart=Math.min(...events.filter(item=>item.phase==="mutate"&&item.event==="start").map(item=>item.at));
  assert.ok(lastUploadEnd<=firstMutationStart,{lastUploadEnd,firstMutationStart});
  const summary=JSON.parse(result.stdout);
  assert.equal(summary.ready,true);
  assert.equal(summary.scheduler.uiConcurrency,1);
});

test("publisher blocks browser work when onboarding is incomplete", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-onboarding-test-"));
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(configPath,"{}");
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),path.join(root,"missing-package.json")],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath}});
  assert.equal(result.code,1);
  assert.match(result.stderr,/onboarding is incomplete/);
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

test("publisher blocks an over-15-minute Douyin video before browser work", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-duration-test-"));
  const videoPath=path.join(root,"too-long.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(videoPath,mp4WithDuration(901));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["douyin"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:1,uploadConcurrency:1}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Duration test",douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"duration-test","douyin","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(result.code,1);
  assert.match(result.stderr,/DOUYIN_DURATION_LIMIT/);
  assert.equal(fs.existsSync(log),false,"browser runner must not start for over-limit media");
});

test("publisher isolates a Douyin duration blocker and still prepares eligible platforms", async () => {
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-partial-preflight-test-"));
  const videoPath=path.join(root,"too-long-for-douyin.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const log=path.join(root,"events.ndjson");
  await fs.promises.writeFile(videoPath,mp4WithDuration(901));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu","douyin"],declarations:{originalityPolicy:"all_videos_original"},execution:{checkConcurrency:2,uploadConcurrency:2}}));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Partial preflight",xhsTopics:["Test"],douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"publisher.mjs"),packagePath,"partial-preflight","xiaohongshu","douyin","--state-root",root],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_RUNNER:path.join(DIR,"mock-runner.mjs"),VIDEO_PUBLISHER_V2_MOCK_LOG:log}});
  assert.equal(result.code,10,`${result.stderr}\n${result.stdout}`);
  const summary=JSON.parse(result.stdout);
  assert.equal(summary.platforms.xiaohongshu.ready,true);
  assert.equal(summary.platforms.douyin.ready,false);
  assert.equal(summary.platforms.douyin.blocker.code,"PLATFORM_REJECTED_ASSET");
  assert.match(summary.platforms.douyin.blocker.message,/DOUYIN_DURATION_LIMIT/);
  const events=(await fs.promises.readFile(log,"utf8")).trim().split(/\n/).map(line=>JSON.parse(line));
  assert.deepEqual(new Set(events.map(item=>item.platform)),new Set(["xiaohongshu"]));
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

test("two different jobs under one state root cannot split platform ownership", async () => {
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
  const argsFor=(packagePath,jobId)=>[path.join(V2_DIR,"publisher.mjs"),packagePath,"global-lock","xiaohongshu","--job-id",jobId,"--state-root",root];
  const results=await Promise.all([
    run(process.execPath,argsFor(packagePaths[0],"job-a"),options),
    run(process.execPath,argsFor(packagePaths[1],"job-b"),options),
  ]);
  assert.deepEqual(results.map(item=>item.code).sort(),[0,1]);
  const winner=results.find(item=>item.code===0);
  const refused=results.find(item=>item.code===1);
  assert.equal(JSON.parse(winner.stdout).ready,true);
  assert.match(refused.stderr,/Another video publishing job is already running/);
  const stateFiles=["job-a","job-b"].filter(jobId=>fs.existsSync(path.join(root,jobId,"state.json")));
  assert.equal(stateFiles.length,1,"the refused job must not write state");
  assert.equal(fs.existsSync(path.join(root,".publisher","orchestrator.lock")),false);
});
