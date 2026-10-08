/** Bound memory consumption before parsing an authenticated command. */
export async function readLimitedBody(request: Request, limit = 16384) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new Error("Anfrage zu groß.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("Anfrage zu groß.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}
export function sameOrigin(request: Request, configuredOrigin?: string) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const scheme =
      request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
      new URL(request.url).protocol.replace(":", "");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const expected = new URL(configuredOrigin || `${scheme}://${host}`).origin;
    return new URL(origin).origin === expected && origin === expected;
  } catch {
    return false;
  }
}
