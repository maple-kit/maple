import { createLogger, memorySink } from "@maple-kit/core/logger";
import { useMapleClient } from "@maple-kit/react";
import { delay, http, HttpResponse } from "msw";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { Maple } from "../src/maple.js";
import { MapleRoot } from "../src/root.js";
import { createMapleFake, fetchThrough, MAPLE_BASE } from "./msw/composer.js";

import type { RequestHandler } from "msw";

const CONTEXT = `${MAPLE_BASE}/context`;

const RESOLVED = {
  preview: "mirrord",
  key: "pr-7-abc",
  branch: "feat/header",
  label: "pr-7-abc",
  commit: "1f3c9ab",
  pullRequest: 7,
  pullRequestUrl: "https://github.com/maple-kit/app/pull/7",
  resolved: true,
  reason: null,
};

const UNRESOLVED = {
  ...RESOLVED,
  branch: RESOLVED.key,
  pullRequest: null,
  pullRequestUrl: null,
  resolved: false,
  reason: "sign-in",
};

function LinkButton() {
  const client = useMapleClient();
  return createElement("button", {
    "data-testid": "link",
    onClick: () => void client.linkGitHub(),
  });
}

function overlays(): number {
  return document.querySelectorAll("[data-maple-overlay]").length;
}

function chipLink(): string | null | undefined {
  const shadow = document.querySelector("[data-maple-overlay]")?.shadowRoot;
  return shadow?.querySelector(".mk-branch")?.getAttribute("href");
}

function chip(): string | undefined {
  const shadow = document.querySelector("[data-maple-overlay]")?.shadowRoot;
  return shadow?.querySelector(".mk-branch")?.textContent ?? undefined;
}

/** Records the branch every `/comments` call asked for, oldest first. */
function branchesAsked(asked: string[]): RequestHandler {
  return http.get(`${MAPLE_BASE}/comments`, ({ request }) => {
    asked.push(new URL(request.url).searchParams.get("branch") ?? "");
    return HttpResponse.json({ comments: [] });
  });
}

function options(handlers: RequestHandler[]) {
  return { basePath: MAPLE_BASE, fetch: fetchThrough(handlers) };
}

function settle(): Promise<void> {
  return new Promise((done) => setTimeout(done, 300));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

describe("a <Maple /> with no props", () => {
  it("asks the route which preview this is and mounts on the answer", async () => {
    const asked: string[] = [];
    const handlers = [
      http.get(CONTEXT, () => HttpResponse.json(RESOLVED)),
      branchesAsked(asked),
      ...createMapleFake().handlers,
    ];
    await render(createElement(Maple, { defaultOpen: true, options: options(handlers) }));

    await vi.waitFor(() => expect(overlays()).toBe(1));
    await vi.waitFor(() => expect(asked).toContain("feat/header"));
    await vi.waitFor(() => expect(chip()).toBe("pr-7-abc"));
  });

  it("mounts nothing when the route answers 404", async () => {
    const handlers = [
      http.get(CONTEXT, () => HttpResponse.json({ error: "Not found" }, { status: 404 })),
      ...createMapleFake().handlers,
    ];
    await render(createElement(Maple, { defaultOpen: true, options: options(handlers) }));

    await settle();
    expect(overlays()).toBe(0);
  });

  it("links the chip to the pull request the route names", async () => {
    const handlers = [
      http.get(CONTEXT, () => HttpResponse.json(RESOLVED)),
      ...createMapleFake().handlers,
    ];
    await render(createElement(Maple, { defaultOpen: true, options: options(handlers) }));

    await vi.waitFor(() => expect(chipLink()).toBe("https://github.com/maple-kit/app/pull/7"));
  });

  it("lets a pullRequest prop override the route's address", async () => {
    const handlers = [
      http.get(CONTEXT, () => HttpResponse.json(RESOLVED)),
      ...createMapleFake().handlers,
    ];
    const given = "https://example.com/pull/9";
    await render(
      createElement(Maple, { defaultOpen: true, pullRequest: given, options: options(handlers) }),
    );

    await vi.waitFor(() => expect(chipLink()).toBe(given));
  });

  it("mounts on the key, unlinked, when the route reports an ambiguous match", async () => {
    const asked: string[] = [];
    const handlers = [
      http.get(CONTEXT, () => HttpResponse.json({ ...UNRESOLVED, reason: "ambiguous" })),
      branchesAsked(asked),
      ...createMapleFake().handlers,
    ];
    await render(createElement(Maple, { defaultOpen: true, options: options(handlers) }));

    await vi.waitFor(() => expect(asked).toContain("pr-7-abc"));
    expect(chipLink()).toBeNull();
  });

  it("mounts nothing when the first read fails with a 502, 500 or a network error", async () => {
    const failures = [
      http.get(CONTEXT, () =>
        HttpResponse.json({ error: "GitHub could not be reached" }, { status: 502 }),
      ),
      http.get(CONTEXT, () => HttpResponse.json({ error: "boom" }, { status: 500 })),
      http.get(CONTEXT, () => HttpResponse.error()),
    ];
    for (const failure of failures) {
      const handlers = [failure, ...createMapleFake().handlers];
      const view = await render(
        createElement(Maple, { defaultOpen: true, options: options(handlers) }),
      );
      await settle();
      expect(overlays()).toBe(0);
      await view.unmount();
    }
  });

  it("retries a failed first read and mounts when a later one answers", async () => {
    let calls = 0;
    const handlers = [
      http.get(CONTEXT, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ error: "GitHub could not be reached" }, { status: 502 })
          : HttpResponse.json(UNRESOLVED);
      }),
      ...createMapleFake().handlers,
    ];

    await render(createElement(Maple, { defaultOpen: true, options: options(handlers) }));
    await settle();
    expect(overlays()).toBe(0);
    await vi.waitFor(() => expect(overlays()).toBe(1), { timeout: 4000 });
    expect(calls).toBe(2);
  });

  it("stops reading, and stays quiet, when it unmounts during the first read", async () => {
    let calls = 0;
    const sink = memorySink();
    const logger = createLogger({ sinks: [sink] });
    const handlers = [
      http.get(CONTEXT, async () => {
        calls += 1;
        await delay(300);
        return HttpResponse.json({ error: "down" }, { status: 502 });
      }),
      ...createMapleFake().handlers,
    ];

    const view = await render(
      createElement(Maple, {
        defaultOpen: true,
        options: { ...options(handlers), logger },
      }),
    );
    await vi.waitFor(() => expect(calls).toBe(1));
    await view.unmount();
    await new Promise((done) => setTimeout(done, 1600));

    expect(calls).toBe(1);
    expect(sink.records).toEqual([]);
  });

  it("does not retry a 404", async () => {
    let calls = 0;
    const handlers = [
      http.get(CONTEXT, () => {
        calls += 1;
        return HttpResponse.json({ error: "Not found" }, { status: 404 });
      }),
      ...createMapleFake().handlers,
    ];

    await render(createElement(Maple, { defaultOpen: true, options: options(handlers) }));
    await new Promise((done) => setTimeout(done, 1500));
    expect(calls).toBe(1);
    expect(overlays()).toBe(0);
  });

  it("shows the ambiguous reason when the route says so", async () => {
    const handlers = [
      http.get(CONTEXT, () => HttpResponse.json({ ...UNRESOLVED, reason: "ambiguous" })),
      ...createMapleFake().handlers,
    ];
    await render(createElement(Maple, { defaultOpen: true, options: options(handlers) }));

    await vi.waitFor(() =>
      expect(
        document.querySelector("[data-maple-overlay]")?.getAttribute("data-maple-reason"),
      ).toBe("ambiguous"),
    );
  });

  it("asks nothing when a branch is given", async () => {
    const asked: string[] = [];
    let contextCalls = 0;
    const handlers = [
      http.get(CONTEXT, () => {
        contextCalls += 1;
        return HttpResponse.json(RESOLVED);
      }),
      branchesAsked(asked),
      ...createMapleFake().handlers,
    ];
    await render(createElement(Maple, { branch: "feat/given", options: options(handlers) }));

    await vi.waitFor(() => expect(asked).toContain("feat/given"));
    expect(contextCalls).toBe(0);
  });

  it("lets a prop override the response", async () => {
    const handlers = [
      http.get(CONTEXT, () => HttpResponse.json(RESOLVED)),
      ...createMapleFake().handlers,
    ];
    await render(
      createElement(Maple, { defaultOpen: true, label: "Header work", options: options(handlers) }),
    );

    await vi.waitFor(() => expect(chip()).toBe("Header work"));
  });

  it("reads the context again after the reviewer links GitHub", async () => {
    const asked: string[] = [];
    let linked = false;
    let contextCalls = 0;
    const handlers = [
      http.get(CONTEXT, () => {
        contextCalls += 1;
        return HttpResponse.json(linked ? RESOLVED : UNRESOLVED);
      }),
      http.post(`${MAPLE_BASE}/auth/github`, () =>
        HttpResponse.json({
          userCode: "ABCD-1234",
          verificationUri: "https://github.com/login/device",
          expiresAt: Date.now() + 60_000,
          interval: 0,
        }),
      ),
      http.patch(`${MAPLE_BASE}/auth/github`, () => {
        linked = true;
        return HttpResponse.json({ status: "linked", login: "dana" });
      }),
      branchesAsked(asked),
      ...createMapleFake().handlers,
    ];

    await render(
      createElement(MapleRoot, { options: options(handlers) }, createElement(LinkButton)),
    );

    await vi.waitFor(() => expect(asked).toContain("pr-7-abc"));
    const button = document
      .querySelector("[data-maple-overlay]")
      ?.shadowRoot?.querySelector<HTMLButtonElement>("[data-testid=link]");
    button?.click();

    await vi.waitFor(() => expect(asked).toContain("feat/header"), { timeout: 5000 });
    expect(contextCalls).toBe(2);
  });

  it("keeps the overlay, on the key, when the read after linking fails with a 502", async () => {
    const asked: string[] = [];
    let contextCalls = 0;
    const handlers = [
      http.get(CONTEXT, () => {
        contextCalls += 1;
        return contextCalls === 1
          ? HttpResponse.json(UNRESOLVED)
          : HttpResponse.json({ error: "GitHub could not be reached" }, { status: 502 });
      }),
      http.post(`${MAPLE_BASE}/auth/github`, () =>
        HttpResponse.json({
          userCode: "ABCD-1234",
          verificationUri: "https://github.com/login/device",
          expiresAt: Date.now() + 60_000,
          interval: 0,
        }),
      ),
      http.patch(`${MAPLE_BASE}/auth/github`, () =>
        HttpResponse.json({ status: "linked", login: "dana" }),
      ),
      branchesAsked(asked),
      ...createMapleFake().handlers,
    ];

    await render(
      createElement(MapleRoot, { options: options(handlers) }, createElement(LinkButton)),
    );
    await vi.waitFor(() => expect(asked).toContain("pr-7-abc"));
    document
      .querySelector("[data-maple-overlay]")
      ?.shadowRoot?.querySelector<HTMLButtonElement>("[data-testid=link]")
      ?.click();

    await vi.waitFor(() => expect(contextCalls).toBe(2), { timeout: 5000 });
    await settle();
    expect(overlays()).toBe(1);
    expect(asked.at(-1)).toBe("pr-7-abc");
  });
});
