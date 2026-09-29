import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";

declare module "vitest/browser" {
  interface BrowserCommands {
    startCspFixture(): Promise<{ proxyUrl: string; direct: string | null; proxied: string | null }>;
    readProbe(): Promise<Record<string, boolean>>;
    stopCspFixture(): Promise<void>;
  }
}

let fixture: Awaited<ReturnType<typeof commands.startCspFixture>>;

beforeAll(async () => {
  fixture = await commands.startCspFixture();
});

afterAll(async () => {
  await commands.stopCspFixture();
});

/**
 * Real Chromium enforcing a nonce policy with strict-dynamic, which discards
 * 'self': a plain same-origin script tag would be blocked.
 */
describe("the overlay under a strict Content-Security-Policy", () => {
  it("still runs, reaches its route, and can preview a blob image", async () => {
    const frame = document.createElement("iframe");
    frame.src = fixture.proxyUrl;
    document.body.append(frame);

    await vi.waitFor(async () => expect(await commands.readProbe()).toHaveProperty("overlay"), {
      timeout: 5000,
    });

    expect(await commands.readProbe()).toEqual({
      app: true,
      overlay: true,
      ping: true,
      blob: true,
    });
    frame.remove();
  });

  it("relaxes the header only on the proxied response", () => {
    expect(fixture.direct).toContain("connect-src https://api.example.test;");
    expect(fixture.direct).not.toContain("blob:");
    expect(fixture.proxied).toContain("connect-src https://api.example.test 'self'");
    expect(fixture.proxied).toContain("img-src 'self' blob:");
  });

  it("keeps the page's own nonce and adds none", () => {
    expect(fixture.proxied?.match(/'nonce-/g)).toHaveLength(1);
    expect(fixture.proxied).toContain("'strict-dynamic'");
  });
});
