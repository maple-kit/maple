import { describe, expect, it } from "vitest";

import { createMapleHandler } from "../src/route/index.js";
import { createCommentStore } from "../src/store.js";
import { memoryMedia } from "../src/testing/memory-media.js";
import { memoryStore } from "../src/testing/memory-store.js";

import type { MediaConnector } from "../src/connectors/types.js";
import type { MediaRef } from "../src/types.js";

const BASE = "https://preview.example.com";

/** A four-byte PNG signature: real bytes, without being a real image. */
const PNG = new Uint8Array([137, 80, 78, 71]);

function handler(media?: MediaConnector) {
  return createMapleHandler({
    store: createCommentStore(memoryStore()),
    ...(media === undefined ? {} : { media }),
  });
}

function upload(body: BodyInit, contentType = "image/png"): Request {
  return new Request(`${BASE}/api/maple/media`, {
    method: "POST",
    body,
    headers: { "content-type": contentType },
  });
}

async function put(handle: ReturnType<typeof handler>): Promise<MediaRef> {
  const response = await handle(upload(PNG));
  return (await response.json()) as MediaRef;
}

describe("a deployment that keeps screenshots", () => {
  it("takes the bytes and hands back the reference a comment keeps", async () => {
    const handle = handler(memoryMedia());
    const response = await handle(upload(PNG));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ connector: "memory", contentType: "image/png" });
  });

  it("says so on /me, so the strip can stop offering what it cannot do", async () => {
    const response = await handler(memoryMedia())(new Request(`${BASE}/api/maple/me`));

    expect(await response.json()).toMatchObject({ media: true });
  });

  it("reads the image back out at the reference it gave", async () => {
    const handle = handler(memoryMedia());
    const ref = await put(handle);

    const read = await handle(
      new Request(`${BASE}/api/maple/media/${ref.key}?type=${encodeURIComponent(ref.contentType)}`),
    );

    expect(read.status).toBe(200);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(PNG);
  });

  it("refuses anything that is not an image", async () => {
    const response = await handler(memoryMedia())(upload("{}", "application/json"));

    expect(response.status).toBe(415);
  });

  it("refuses an empty body rather than keeping a zero-byte screenshot", async () => {
    const response = await handler(memoryMedia())(upload(new Uint8Array()));

    expect(response.status).toBe(400);
  });

  it("allows only a POST to put and only a GET to read", async () => {
    const handle = handler(memoryMedia());

    expect((await handle(new Request(`${BASE}/api/maple/media`))).status).toBe(405);
    expect(
      (await handle(new Request(`${BASE}/api/maple/media/shot-1`, { method: "DELETE" }))).status,
    ).toBe(405);
  });
});

/**
 * A connector's own URL is usually signed and short-lived, so a read points at
 * it rather than streaming it — except for one a browser will not follow.
 */
describe("how a stored image is handed over", () => {
  function hosted(url: string): MediaConnector {
    return {
      name: "hosted",
      putBlob: () => Promise.resolve({ connector: "hosted", key: "k", contentType: "image/png" }),
      getUrl: () => Promise.resolve(url),
    };
  }

  it("redirects to a URL the browser can fetch", async () => {
    const handle = handler(hosted("https://blobs.example/k.png"));
    const read = await handle(new Request(`${BASE}/api/maple/media/k?type=image%2Fpng`));

    expect(read.status).toBe(302);
    expect(read.headers.get("location")).toBe("https://blobs.example/k.png");
  });

  it("serves a data URL instead, because a browser refuses to follow one", async () => {
    const handle = handler(hosted("data:image/png;base64,iVBORw=="));
    const read = await handle(new Request(`${BASE}/api/maple/media/k?type=image%2Fpng`));

    expect(read.status).toBe(200);
    expect(read.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });
});

describe("a deployment that keeps none", () => {
  it("answers 404 rather than pretending, so the strip says so", async () => {
    expect((await handler()(upload(PNG))).status).toBe(404);
  });

  it("reports it on /me, where the overlay reads it once", async () => {
    const response = await handler()(new Request(`${BASE}/api/maple/me`));

    expect(await response.json()).toMatchObject({ media: false });
  });
});
