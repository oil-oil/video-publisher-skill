// Ego Lite on Windows can emit its CLI output in the system code page.
// Decode after collecting complete buffers, preserving multibyte characters.
export function decodeEgoOutput(chunks) {
  const bytes = Buffer.concat(chunks);
  const explicitEncoding = process.env.VIDEO_PUBLISHER_EGO_OUTPUT_ENCODING;
  if (explicitEncoding) return new TextDecoder(explicitEncoding, { fatal: true }).decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (process.platform !== 'win32') return bytes.toString('utf8');
    return new TextDecoder('gb18030').decode(bytes);
  }
}
