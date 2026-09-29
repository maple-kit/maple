/**
 * The shared media-connector contract.
 *
 * Every media connector runs this suite. The promises are the ones the route
 * relies on: a reference carries the connector's name, the bytes come back
 * exactly, a key nobody was given is refused, and a removed blob is gone.
 */

import { describe, expect, it } from "vitest";

import type { MediaConnector } from "../connectors/types.js";

/** What the suite needs in order to exercise a media connector. */
export interface MediaContractOptions {
  /** Shown in the test names, e.g. "file". */
  readonly name: string;
  /** Builds an isolated connector. Called once per test. */
  create(): Promise<MediaContractSubject>;
}

/** A connector plus whatever is needed to tear it down. */
export interface MediaContractSubject {
  readonly connector: MediaConnector;
  cleanup?(): Promise<void>;
}

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function withSubject(
  options: MediaContractOptions,
  body: (connector: MediaConnector) => Promise<void>,
): Promise<void> {
  const subject = await options.create();
  try {
    await body(subject.connector);
  } finally {
    await subject.cleanup?.();
  }
}

/** The bytes a `data:` URL carries. */
function bytesOf(url: string): Uint8Array {
  return Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (one) => one.charCodeAt(0));
}

/** Runs the whole contract against one media connector. */
export function runMediaContract(options: MediaContractOptions): void {
  describe(`media contract: ${options.name}`, () => {
    it("names itself", async () => {
      await withSubject(options, (connector) => {
        expect(connector.name).toMatch(/^[a-z][a-z0-9-]*$/);
        return Promise.resolve();
      });
    });

    it("hands back a reference carrying its own name and the type it was given", async () => {
      await withSubject(options, async (connector) => {
        const ref = await connector.putBlob({ data: PNG, contentType: "image/png" });

        expect(ref).toMatchObject({ connector: connector.name, contentType: "image/png" });
        expect(ref.key).not.toHaveLength(0);
      });
    });

    it("gives each blob its own key rather than overwriting the last", async () => {
      await withSubject(options, async (connector) => {
        const first = await connector.putBlob({ data: PNG, contentType: "image/png" });
        const second = await connector.putBlob({
          data: new Uint8Array([1]),
          contentType: "image/png",
        });

        expect(first.key).not.toBe(second.key);
      });
    });

    it("keeps the bytes exactly, which is the whole job", async () => {
      await withSubject(options, async (connector) => {
        const ref = await connector.putBlob({ data: PNG, contentType: "image/png" });
        const url = await connector.getUrl(ref);

        // A connector may answer with a link instead; the bytes are then its own.
        if (url.startsWith("data:")) expect(bytesOf(url)).toEqual(PNG);
        else expect(url).toMatch(/^https?:\/\//);
      });
    });

    it("refuses a key it never gave, rather than answering with nothing", async () => {
      await withSubject(options, async (connector) => {
        await expect(
          connector.getUrl({ connector: connector.name, key: "never", contentType: "image/png" }),
        ).rejects.toThrow();
      });
    });

    it("forgets one that is removed, when supported", async () => {
      await withSubject(options, async (connector) => {
        if (connector.remove === undefined) return;
        const ref = await connector.putBlob({ data: PNG, contentType: "image/png" });
        await connector.remove(ref);

        await expect(connector.getUrl(ref)).rejects.toThrow();
      });
    });
  });
}
