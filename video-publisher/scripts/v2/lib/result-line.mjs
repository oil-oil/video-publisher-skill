export const V2_RESULT_PREFIX = "VIDEO_PUBLISHER_V2_RESULT:";

export function parseV2Result(output, context = "v2 runner") {
  const body = String(output || "");
  const line = body.split(/\r?\n/).reverse().find(item => item.trimStart().startsWith(V2_RESULT_PREFIX));
  if (!line) throw new Error(`${context} returned no structured observation: ${body.slice(-1800)}`);
  const raw = line.trimStart().slice(V2_RESULT_PREFIX.length).trim();
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${context} returned invalid structured observation: ${raw.slice(0, 600)}`, { cause: error });
  }
}
