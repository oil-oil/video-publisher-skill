import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acquireJobLock, JobBusyError } from "../lib/job-lock.mjs";
import { parseV2Result } from "../lib/result-line.mjs";

const DIR=path.dirname(fileURLToPath(import.meta.url));
const V2_DIR=path.dirname(DIR);
process.env.VIDEO_PUBLISHER_V2_LOCK_ROOT=path.join(os.tmpdir(),`video-publisher-run-platform-test-locks-${process.pid}`);

function run(command,args,options){return new Promise((resolve,reject)=>{const child=spawn(command,args,{...options,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.on("data",chunk=>{stdout+=chunk});child.stderr.on("data",chunk=>{stderr+=chunk});child.on("error",reject);child.on("close",code=>resolve({code,stdout,stderr}))})}

function box(type,payload){const buffer=Buffer.alloc(8+payload.length);buffer.writeUInt32BE(buffer.length,0);buffer.write(type,4,"ascii");payload.copy(buffer,8);return buffer}
function mp4WithDuration(durationSeconds,timescale=1000){const payload=Buffer.alloc(20);payload.writeUInt32BE(timescale,12);payload.writeUInt32BE(Math.round(durationSeconds*timescale),16);return Buffer.concat([box("ftyp",Buffer.alloc(4)),box("moov",box("mvhd",payload))])}
async function waitFor(predicate,timeoutMs=3000){const started=Date.now();while(Date.now()-started<timeoutMs){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,25))}throw new Error("timed out waiting for test condition")}

test("platform runner sends the platform cover override to the adapter", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-publisher-cover-adapter-"));
  try {
    const videoPath = path.join(root, "video.mp4");
    const packagePath = path.join(root, "package.json");
    const configPath = path.join(root, "config.json");
    const scriptPath = path.join(root, "generated-script.mjs");
    const fakeEgoPath = path.join(root, "fake-ego");
    const sharedPath = path.join(root, "shared.png");
    const overridePath = path.join(root, "override.png");
    const png = Buffer.alloc(24);
    png[0] = 0x89; png.write("PNG", 1, "ascii");
    png.writeUInt32BE(1440, 16); png.writeUInt32BE(1080, 20);
    await fs.promises.writeFile(sharedPath, png);
    await fs.promises.writeFile(overridePath, png);
    await fs.promises.writeFile(videoPath, mp4WithDuration(30));
    await fs.promises.writeFile(packagePath, JSON.stringify({
      videoPath, title: "封面覆盖", bilibiliDescription: "说明", bilibiliTags: ["测试"],
      cover: { uploadCustomCover: true, horizontal4x3Path: sharedPath,
        platforms: { bilibili: { horizontal4x3Path: overridePath } } },
    }));
    await fs.promises.writeFile(configPath, JSON.stringify({
      schemaVersion: 2, onboarding: { completed: true }, sourceDirectory: root,
      availablePlatforms: ["bilibili"], defaultPlatforms: ["bilibili"],
    }));
    await fs.promises.writeFile(fakeEgoPath, '#!/bin/sh\ncat > "$VIDEO_PUBLISHER_TEST_SCRIPT"\nexit 1\n', { mode: 0o755 });
    const result = await run(process.execPath, [path.join(V2_DIR, "run-platform.mjs"), "bilibili", packagePath, "inspect"], {
      env: { ...process.env, VIDEO_PUBLISHER_CONFIG: configPath,
        VIDEO_PUBLISHER_V2_EGO_COMMAND: fakeEgoPath, VIDEO_PUBLISHER_TEST_SCRIPT: scriptPath },
    });
    assert.equal(result.code, 0, result.stderr);
    const script = await fs.promises.readFile(scriptPath, "utf8");
    const adapterPackage = JSON.parse(script.match(/^const pkg = (.+);$/m)[1]);
    assert.equal(adapterPackage.cover.horizontal4x3Path, overridePath);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("platform runner does not reject verified long-form Douyin asset during media preflight",async()=>{
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-direct-duration-test-"));
  const videoPath=path.join(root,"too-long.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,mp4WithDuration(901));
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Too long",douyinTopics:["Test"],cover:{uploadCustomCover:false}}));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["douyin"],defaultPlatforms:["douyin"],declarations:{originalityPolicy:"all_videos_original"}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"run-platform.mjs"),"douyin",packagePath,"upload"],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_EGO_COMMAND:"video-publisher-missing-ego-command"}});
  assert.doesNotMatch(result.stderr,/DOUYIN_DURATION_LIMIT/);
});

test("platform runner rejects an account that is not configured as available",async()=>{
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-direct-availability-test-"));
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu"],defaultPlatforms:["xiaohongshu"]}));
  const result=await run(process.execPath,[path.join(V2_DIR,"run-platform.mjs"),"douyin",path.join(root,"missing.json"),"inspect"],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath}});
  assert.equal(result.code,2);
  assert.match(result.stderr,/not configured as available: douyin/);
});

test("an orphaned Ego child keeps the publisher lock busy after its runner dies",async()=>{
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-orphan-member-test-"));
  const lockRoot=path.join(root,"locks");
  const videoPath=path.join(root,"sample.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const fakeEgoPath=path.join(root,"fake-ego");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Orphan member",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:2,onboarding:{completed:true},sourceDirectory:root,availablePlatforms:["xiaohongshu"],defaultPlatforms:["xiaohongshu"]}));
  await fs.promises.writeFile(fakeEgoPath,"#!/bin/sh\ncat >/dev/null\nsleep 30\n");
  await fs.promises.chmod(fakeEgoPath,0o755);
  const runner=spawn(process.execPath,[path.join(V2_DIR,"run-platform.mjs"),"xiaohongshu",packagePath,"inspect"],{stdio:"ignore",env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_EGO_COMMAND:fakeEgoPath,VIDEO_PUBLISHER_V2_LOCK_ROOT:lockRoot}});
  const membersPath=path.join(lockRoot,"publisher","orchestrator.lock","members");
  await waitFor(()=>fs.existsSync(membersPath)&&fs.readdirSync(membersPath).some(name=>name.endsWith(".json")));
  const memberPath=path.join(membersPath,fs.readdirSync(membersPath).find(name=>name.endsWith(".json")));
  const member=JSON.parse(await fs.promises.readFile(memberPath,"utf8"));
  const runnerClosed=new Promise(resolve=>runner.once("close",resolve));
  runner.kill("SIGKILL");
  await runnerClosed;
  assert.doesNotThrow(()=>process.kill(member.pid,0));
  const publisherDirectory=path.join(lockRoot,"publisher");
  assert.throws(()=>acquireJobLock(publisherDirectory,{jobId:"replacement",scope:"publisher"}),JobBusyError);
  process.kill(member.pid,"SIGKILL");
  await waitFor(()=>{try{process.kill(member.pid,0);return false}catch{return true}});
  const replacement=acquireJobLock(publisherDirectory,{jobId:"replacement",scope:"publisher"});
  replacement();
});

test("platform runner turns an Ego process failure into structured page evidence",async()=>{
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-ego-failure-test-"));
  const videoPath=path.join(root,"sample.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"Ego failure",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"}}));
  const result=await run(process.execPath,[path.join(V2_DIR,"run-platform.mjs"),"xiaohongshu",packagePath,"inspect","ego-failure","123"],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_EGO_COMMAND:"video-publisher-missing-ego-command"}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  const observation=parseV2Result(result.stdout);
  assert.equal(observation.taskSpaceId,123);
  assert.equal(observation.blocker.code,"INPUT_CHANNEL_BROKEN");
  assert.equal(observation.blocker.retryable,true);
  assert.equal(observation.gates.safety.ok,false);
  assert.equal(observation.finalPublishClicked,false);
});

test("platform runner recognizes Ego's real user-takeover wording",async()=>{
  const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"video-publisher-v2-user-control-test-"));
  const videoPath=path.join(root,"sample.mp4");
  const packagePath=path.join(root,"package.json");
  const configPath=path.join(root,"config.json");
  const fakeEgoPath=path.join(root,"fake-ego");
  await fs.promises.writeFile(videoPath,"test video fixture");
  await fs.promises.writeFile(packagePath,JSON.stringify({videoPath,title:"User takeover",xhsTopics:["Test"],cover:{uploadCustomCover:false}}));
  await fs.promises.writeFile(configPath,JSON.stringify({schemaVersion:1,onboarding:{completed:true},sourceDirectory:root,defaultPlatforms:["xiaohongshu"],declarations:{originalityPolicy:"all_videos_original"}}));
  await fs.promises.writeFile(fakeEgoPath,"#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' 'The user has taken control of this task space. Wait for them to finish.' >&2\nexit 1\n");
  await fs.promises.chmod(fakeEgoPath,0o755);
  const result=await run(process.execPath,[path.join(V2_DIR,"run-platform.mjs"),"xiaohongshu",packagePath,"inspect","user-control","456"],{env:{...process.env,VIDEO_PUBLISHER_CONFIG:configPath,VIDEO_PUBLISHER_V2_EGO_COMMAND:fakeEgoPath}});
  assert.equal(result.code,0,`${result.stderr}\n${result.stdout}`);
  const observation=parseV2Result(result.stdout);
  assert.equal(observation.taskSpaceId,456);
  assert.equal(observation.blocker.code,"USER_CONTROL");
  assert.equal(observation.blocker.retryable,false);
  assert.equal(observation.blocker.requiresUser,true);
  assert.match(observation.blocker.evidence.detail,/user has taken control/i);
  assert.equal(observation.finalPublishClicked,false);
});
