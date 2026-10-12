import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { githubMedia } from "../src/connectors/github-media.js";
import { githubStore } from "../src/connectors/github.js";
import { UpstreamError } from "../src/errors.js";
import { runMediaContract } from "../src/testing/media-contract.js";
import { createAttachmentsFake } from "./msw/github-attachments.js";
import { createTestServer, useTestServer } from "./msw/server.js";

const fake = createAttachmentsFake(["user-token"]);
const server = createTestServer(...fake.handlers);

useTestServer(server, { beforeAll, afterEach, afterAll });
afterEach(() => {
  fake.uploads.length = 0;
});

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function media(token = "user-token") {
  return githubMedia({ owner: "maple-kit", repo: "app", token });
}

runMediaContract({
  name: "github",
  create: () => Promise.resolve({ connector: media() }),
});

describe("uploading", () => {
  it("sends the bytes and the type to the repository's attachment store", async () => {
    await media().putBlob({ data: PNG, contentType: "image/png", filename: "shot.png" });

    expect(fake.uploads).toHaveLength(1);
    expect(fake.uploads[0]).toMatchObject({
      name: "shot.png",
      contentType: "image/png",
      repositoryId: "4242",
      bytes: PNG,
    });
  });

  it("keys the blob by the attachment id and links the permanent URL", async () => {
    const connector = media();
    const ref = await connector.putBlob({ data: PNG, contentType: "image/png" });

    expect(ref.key).toBe(fake.uploads[0]!.id);
    await expect(connector.getUrl(ref)).resolves.toBe(
      `https://github.com/user-attachments/assets/${ref.key}`,
    );
  });

  it("asks for the repository id once, not once per upload", async () => {
    const before = fake.lookups();
    const connector = media();
    await connector.putBlob({ data: PNG, contentType: "image/png" });
    await connector.putBlob({ data: PNG, contentType: "image/png" });

    expect(fake.lookups() - before).toBe(1);
  });

  it("cannot remove, because GitHub offers no way to", () => {
    expect("remove" in media()).toBe(false);
  });
});

describe("when GitHub refuses", () => {
  it("surfaces the 404 an installation token meets, with GitHub's own message", async () => {
    const error = await media("installation-token")
      .putBlob({ data: PNG, contentType: "image/png" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ status: 404, detail: "Not Found" });
  });

  it("surfaces a failed repository lookup, and asks again on the next upload", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/maple-kit/app",
        () => HttpResponse.json({ message: "Bad credentials" }, { status: 401 }),
        { once: true },
      ),
    );
    const connector = media();

    await expect(connector.putBlob({ data: PNG, contentType: "image/png" })).rejects.toMatchObject({
      status: 401,
    });
    await expect(connector.putBlob({ data: PNG, contentType: "image/png" })).resolves.toMatchObject(
      { connector: "github" },
    );
  });

  it("refuses an answer that carries no attachment id", async () => {
    server.use(
      http.post("https://uploads.github.com/user-attachments/assets", () =>
        HttpResponse.json({ url: "https://example.com/nothing" }, { status: 201 }),
      ),
    );

    await expect(media().putBlob({ data: PNG, contentType: "image/png" })).rejects.toThrow(
      /no attachment id/u,
    );
  });
});

describe("as githubStore's media", () => {
  it("is accepted where a connector that links an image is wanted", () => {
    const store = githubStore({ owner: "maple-kit", repo: "app", token: "t", media: media() });
    expect(store.name).toBe("github");
  });
});
