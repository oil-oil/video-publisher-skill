#!/usr/bin/env node
import fs from "node:fs";

const logPath = process.env.VIDEO_PUBLISHER_V2_CLEANUP_LOG || "";
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { stdin += chunk; });
process.stdin.on("end", () => {
  if (logPath) {
    fs.appendFileSync(logPath, `${stdin}\n---\n`);
  }
  const closeNames = [...stdin.matchAll(/const closeNames = new Set\((\[.*?\])\)/s)].at(-1);
  const closed = [];
  try {
    const names = closeNames ? JSON.parse(closeNames[1]) : [];
    for (const name of names) closed.push({ id: null, name });
  } catch {
    // keep empty closed list if the cleanup script shape changes
  }
  console.log(`VIDEO_PUBLISHER_SPACE_CLEANUP:${JSON.stringify({ closed })}`);
});
