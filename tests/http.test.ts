import { it, expect } from "vitest";
import { readLimitedBody } from "@/lib/http";
it("begrenzt auch gestreamte Anfragen ohne Content-Length", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(20));
        c.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
  await expect(readLimitedBody(request, 10)).rejects.toThrow("zu groß");
});
it("liest gültige JSON-Anfragen", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: '{"type":"test"}',
  });
  expect(await readLimitedBody(request)).toBe('{"type":"test"}');
});
import { sameOrigin } from "@/lib/http";
it("prüft Origins gegen Host oder explizite Deployment-Origin", () => {
  const request = new Request("http://0.0.0.0:3100/api/commands", {
    headers: { host: "localhost:3100", origin: "http://localhost:3100" },
  });
  expect(sameOrigin(request)).toBe(true);
  expect(
    sameOrigin(
      new Request(request, {
        headers: { host: "localhost:3100", origin: "https://evil.example" },
      }),
    ),
  ).toBe(false);
  expect(sameOrigin(request, "https://team.example")).toBe(false);
  expect(
    sameOrigin(
      new Request("http://internal/api", {
        headers: { host: "internal", origin: "https://team.example" },
      }),
      "https://team.example",
    ),
  ).toBe(true);
});
