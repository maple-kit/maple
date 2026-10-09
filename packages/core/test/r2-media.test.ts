import { describe, expect, it } from "vitest";

import { r2Media } from "../src/connectors/r2-media.js";
import { runMediaContract } from "../src/testing/media-contract.js";

import type { R2BucketLike } from "../src/connectors/r2-media.js";

interface Held {
  readonly data: Uint8Array;
  readonly contentType: string | undefined;
}

/** A bucket in a Map, with the shape of an R2 binding. */
function fakeBucket(): R2BucketLike & { readonly objects: Map<string, Held> } {
  const objects = new Map<string, Held>();
  return {
    objects,
    put(key, value, options) {
      objects.set(key, { data: value, contentType: options?.httpMetadata?.contentType });
      return Promise.resolve(null);
    },
    head: (key) => Promise.resolve(objects.has(key) ? {} : null),
    get(key) {
      const held = objects.get(key);
      if (held === undefined) return Promise.resolve(null);
      return Promise.resolve({
        arrayBuffer: () => Promise.resolve(held.data.slice().buffer),
        httpMetadata: held.contentType === undefined ? {} : { contentType: held.contentType },
      });
    },
    delete(key) {
      objects.delete(key);
      return Promise.resolve();
    },
  };
}

runMediaContract({
  name: "r2",
  create: () => Promise.resolve({ connector: r2Media({ bucket: fakeBucket() }) }),
});

runMediaContract({
  name: "r2 with links",
  create: () =>
    Promise.resolve({
      connector: r2Media({ bucket: fakeBucket(), url: (key) => `https://example.test/${key}` }),
    }),
});

const PNG = new Uint8Array([137, 80, 78, 71]);

describe("r2Media", () => {
  it("stores under the prefix and keeps the content type on the object", async () => {
    const bucket = fakeBucket();
    const media = r2Media({ bucket, prefix: "pr-7/" });
    const ref = await media.putBlob({ data: PNG, contentType: "image/png" });

    expect([...bucket.objects.keys()]).toEqual([`pr-7/${ref.key}`]);
    expect(bucket.objects.get(`pr-7/${ref.key}`)?.contentType).toBe("image/png");
  });

  it("never reads another prefix's object", async () => {
    const bucket = fakeBucket();
    const first = r2Media({ bucket, prefix: "pr-1/" });
    const second = r2Media({ bucket, prefix: "pr-2/" });
    const ref = await first.putBlob({ data: PNG, contentType: "image/png" });

    await expect(second.getUrl(ref)).rejects.toThrow(RangeError);
  });

  it("answers with the link the host chose", async () => {
    const media = r2Media({ bucket: fakeBucket(), url: (key) => `https://x.test/m/${key}` });
    const ref = await media.putBlob({ data: PNG, contentType: "image/png" });

    expect(await media.getUrl(ref)).toBe(`https://x.test/m/${ref.key}`);
  });

  it.each(["../pr-2/shot", "a/b", "", "a b"])("refuses the key %j", async (key) => {
    const media = r2Media({ bucket: fakeBucket() });
    const ref = { connector: "r2", key, contentType: "image/png" };

    await expect(media.getUrl(ref)).rejects.toThrow(RangeError);
    await expect(media.remove?.(ref)).rejects.toThrow(RangeError);
  });
});
