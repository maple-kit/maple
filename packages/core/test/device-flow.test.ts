import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createDeviceFlow, DeviceFlowError } from "../src/auth/index.js";
import { createDeviceFlowFake } from "./msw/github.js";
import { createTestServer, useTestServer } from "./msw/server.js";

const github = createDeviceFlowFake();
const server = createTestServer(...github.handlers);

useTestServer(server, { beforeAll, afterEach, afterAll });

/** Records what the flow was asked to wait, and waits none of it. */
function recorder(): { waited: number[]; sleep: (ms: number) => Promise<void> } {
  const waited: number[] = [];
  return { waited, sleep: (ms) => (waited.push(ms), Promise.resolve()) };
}

function flow(sleep?: (ms: number) => Promise<void>) {
  return createDeviceFlow({ clientId: "Iv1.test", ...(sleep ? { sleep } : {}) });
}

describe("starting", () => {
  it("returns a code to show and a code to keep", async () => {
    const code = await flow().start();

    expect(code.userCode).toBe("WDJB-MJHT");
    expect(code.verificationUri).toBe("https://github.com/login/device");
    expect(code.deviceCode).toBe("dev-code-secret");
    expect(code.interval).toBe(5);
  });

  it("turns the lifetime into a deadline, so the caller does not have to", async () => {
    const before = Date.now();
    const code = await flow().start();

    expect(code.expiresAt).toBeGreaterThanOrEqual(before + 900_000);
  });
});

describe("polling", () => {
  it("waits for the reviewer and returns the token", async () => {
    github.respond("pending", "pending", { token: "gho_test" });
    const { sleep } = recorder();
    const subject = flow(sleep);

    const token = await subject.poll(await subject.start());
    expect(token.accessToken).toBe("gho_test");
    expect(github.polls()).toBe(3);
  });

  it("honours the interval GitHub asked for", async () => {
    github.respond({ token: "gho_test" });
    const { waited, sleep } = recorder();
    const subject = flow(sleep);

    await subject.poll(await subject.start());
    expect(waited).toEqual([5000]);
  });

  it("backs off when GitHub says slow down, and uses the interval it sent", async () => {
    github.respond("slow_down", { token: "gho_test" });
    const { waited, sleep } = recorder();
    const subject = flow(sleep);

    await subject.poll(await subject.start());
    expect(waited).toEqual([5000, 10_000]);
  });

  it("stops when the reviewer refuses", async () => {
    github.respond({ error: "access_denied" });
    const { sleep } = recorder();
    const subject = flow(sleep);

    await expect(subject.poll(await subject.start())).rejects.toMatchObject({
      name: "DeviceFlowError",
      reason: "denied",
    });
  });

  it("stops when the code expires on GitHub's side", async () => {
    github.respond({ error: "expired_token" });
    const { sleep } = recorder();
    const subject = flow(sleep);

    await expect(subject.poll(await subject.start())).rejects.toMatchObject({ reason: "expired" });
  });

  it("says so when the app has Device Flow turned off", async () => {
    github.respond({ error: "device_flow_disabled" });
    const { sleep } = recorder();
    const subject = flow(sleep);

    await expect(subject.poll(await subject.start())).rejects.toMatchObject({
      reason: "unsupported",
    });
  });

  it("does not poll a code that has already expired here", async () => {
    github.respond({ token: "gho_test" });
    const { sleep } = recorder();
    const subject = flow(sleep);
    const code = { ...(await subject.start()), expiresAt: Date.now() - 1 };

    await expect(subject.poll(code)).rejects.toThrow(DeviceFlowError);
    expect(github.polls()).toBe(0);
  });

  it("stops when the caller aborts", async () => {
    github.respond("pending", "pending", "pending");
    const { sleep } = recorder();
    const subject = flow(sleep);
    const controller = new AbortController();
    controller.abort();

    await expect(subject.poll(await subject.start(), controller.signal)).rejects.toThrow();
    expect(github.polls()).toBe(0);
  });

  it("reports an unrecognised error rather than looping on it", async () => {
    github.respond({ error: "something_new" });
    const { sleep } = recorder();
    const subject = flow(sleep);

    await expect(subject.poll(await subject.start())).rejects.toMatchObject({ reason: "unknown" });
  });
});
