import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseV2Result } from "../lib/result-line.mjs";

const DIR=path.dirname(fileURLToPath(import.meta.url));
const V2_DIR=path.dirname(DIR);

function run(command,args,options){return new Promise((resolve,reject)=>{const child=spawn(command,args,{...options,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.on("data",chunk=>{stdout+=chunk});child.stderr.on("data",chunk=>{stderr+=chunk});child.on("error",reject);child.on("close",code=>resolve({code,stdout,stderr}))})}

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
