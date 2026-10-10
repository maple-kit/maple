import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";

import { MapleRoot } from "../src/index.js";
import { Account, SignIn } from "../src/island/index.js";

import type { ReactElement } from "react";

const BRANCH = "feat/ui-account";
const ORIGIN = "https://preview.example";

/** The three route answers the row depends on, and nothing else. */
interface Route {
  /** What `GET /me` says about the link. Absent: a route with no sign-in. */
  readonly github?: { linked: boolean; login?: string };
  /** Successive answers to `PATCH /auth/github`, consumed in order. */
  readonly attempts?: { status: "linked" | "pending"; interval?: number; login?: string }[];
  /**
   * Seconds before the first exchange. Zero where a test wants the answer and
   * the attempt after it ends the run; five everywhere else, so nothing spins.
   */
  readonly startInterval?: number;
}

function routeFetch(route: Route): typeof globalThis.fetch {
  const attempts = [...(route.attempts ?? [])];
  /** Once an exchange comes back linked, `/me` says so, as a real route does. */
  const github = route.github === undefined ? undefined : { ...route.github };

  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    const said = answer(url, method, { ...route, ...(github ? { github } : {}) }, attempts);
    if (github && (said as { status?: string }).status === "linked" && method === "PATCH") {
      Object.assign(github, { linked: true, login: (said as { login?: string }).login });
    }
    return Promise.resolve(json(said));
  };
}

function answer(url: string, method: string, route: Route, attempts: Route["attempts"]): unknown {
  if (url.includes("/auth/github") && method === "POST") {
    return {
      userCode: "WDJB-MJHT",
      verificationUri: "https://github.com/login/device",
      expiresAt: Date.now() + 900_000,
      interval: route.startInterval ?? 5,
    };
  }
  if (url.includes("/auth/github") && method === "PATCH") {
    return attempts?.shift() ?? { status: "pending", interval: 5 };
  }
  if (url.includes("/auth/github")) return { status: "signed-out" };
  if (url.includes("/me")) {
    return { user: null, ...(route.github === undefined ? {} : { github: route.github }) };
  }
  return { comments: [] };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function tree(route: Route): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: routeFetch(route), origin: ORIGIN } },
    createElement(Account),
    createElement(SignIn),
  );
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function row(): HTMLElement | null {
  return root().querySelector<HTMLElement>("[data-mk-link]");
}

/** Waits for the row to reach a state, so a race is not a finding. */
async function settled(state: string): Promise<HTMLElement> {
  await vi.waitFor(() => expect(row()?.dataset["mkLink"]).toBe(state));
  return row()!;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  for (const node of document.querySelectorAll("[data-maple-overlay]")) node.remove();
});

describe("a route that serves no sign-in", () => {
  it("draws nothing, rather than an offer nobody can take", async () => {
    await render(tree({}));

    await vi.waitFor(() => expect(root()).toBeTruthy());
    await Promise.resolve();
    expect(row()).toBeNull();
  });
});

describe("a reviewer who has not linked", () => {
  it("offers to link, and says what linking is for", async () => {
    await render(tree({ github: { linked: false } }));
    const found = await settled("unlinked");

    expect(found.querySelector(".mk-acct-do")?.textContent).toBe("Link");
    expect(found.textContent).toContain("Not linked");
  });

  it("shows a code to type and where to type it, once they ask", async () => {
    await render(tree({ github: { linked: false } }));
    await settled("unlinked");

    root().querySelector<HTMLButtonElement>(".mk-acct-do")!.click();
    const found = await settled("linking");

    expect(found.querySelector("code")?.textContent).toBe("WDJB-MJHT");
    expect(found.querySelector("a")?.getAttribute("href")).toBe("https://github.com/login/device");
  });

  it("walks them through it in a popup: the code, GitHub, then the wait", async () => {
    await render(tree({ github: { linked: false } }));
    await settled("unlinked");

    root().querySelector<HTMLButtonElement>(".mk-acct-do")!.click();
    await settled("linking");

    const popup = root().querySelector<HTMLDialogElement>(".mk-popup")!;
    expect(popup.open).toBe(true);
    expect(popup.querySelector(".mk-step-code")?.textContent).toBe("WDJB-MJHT");
    expect(popup.querySelector(".mk-step-open")?.getAttribute("href")).toBe(
      "https://github.com/login/device",
    );
    expect(popup.querySelector("[role=status]")?.textContent).toContain("Waiting");

    popup.querySelector<HTMLButtonElement>(".mk-iconbtn")!.click();
    await vi.waitFor(() => expect(root().querySelector(".mk-popup")).toBeNull());
    expect((await settled("linking")).querySelector("code")?.textContent).toBe("WDJB-MJHT");
  });

  it("answers a real click inside the popup, not only its close button", async () => {
    let copied = "";
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: (text: string) => {
          copied = text;
          return Promise.resolve();
        },
      },
    });
    await render(tree({ github: { linked: false } }));
    await settled("unlinked");
    root().querySelector<HTMLButtonElement>(".mk-acct-do")!.click();
    await settled("linking");

    const copy = root().querySelector<HTMLButtonElement>(".mk-popup .mk-acct-do")!;
    await userEvent.click(copy, { timeout: 2000 });

    await vi.waitFor(() => expect(copied).toBe("WDJB-MJHT"));
    vi.unstubAllGlobals();
  });

  it("closes the popup by itself once GitHub has the code", async () => {
    await render(
      tree({ github: { linked: false }, startInterval: 0, attempts: [{ status: "linked" }] }),
    );
    await settled("unlinked");

    root().querySelector<HTMLButtonElement>(".mk-acct-do")!.click();

    await settled("linked");
    expect(root().querySelector(".mk-popup")).toBeNull();
  });

  it("offers nothing to press while the reviewer is away on github.com", async () => {
    await render(tree({ github: { linked: false } }));
    await settled("unlinked");

    root().querySelector<HTMLButtonElement>(".mk-acct-do")!.click();
    const found = await settled("linking");

    expect(found.querySelector(".mk-acct-do")).toBeNull();
  });

  it("names them once the exchange comes back linked", async () => {
    await render(
      tree({
        github: { linked: false },
        startInterval: 0,
        attempts: [{ status: "linked", login: "octocat" }],
      }),
    );
    await settled("unlinked");

    root().querySelector<HTMLButtonElement>(".mk-acct-do")!.click();
    const found = await settled("linked");

    expect(found.textContent).toContain("octocat");
  });
});

describe("a reviewer who has", () => {
  it("names the account, and offers to forget it here", async () => {
    await render(tree({ github: { linked: true, login: "octocat" } }));
    const found = await settled("linked");

    expect(found.textContent).toContain("Linked • octocat");
    expect(found.querySelector(".mk-acct-do")?.textContent).toBe("Unlink");
  });

  it("says plainly that unlinking is not revoking", async () => {
    await render(tree({ github: { linked: true, login: "octocat" } }));
    const found = await settled("linked");

    expect(found.querySelector(".mk-acct-do")?.getAttribute("title")).toContain("revoke");
  });

  it("draws Unlink as the destructive control it is", async () => {
    await render(tree({ github: { linked: true, login: "octocat" } }));
    const found = await settled("linked");

    expect(found.querySelector(".mk-acct-do")?.classList.contains("mk-acct-danger")).toBe(true);
  });

  it("goes back to an offer when they unlink", async () => {
    await render(tree({ github: { linked: true, login: "octocat" } }));
    await settled("linked");

    root().querySelector<HTMLButtonElement>(".mk-acct-do")!.click();
    expect((await settled("unlinked")).querySelector(".mk-acct-do")?.textContent).toBe("Link");
  });

  it("says linked without a name when GitHub would not give one", async () => {
    await render(tree({ github: { linked: true } }));
    const found = await settled("linked");

    expect(found.textContent).toContain("Linked");
    expect(found.textContent).not.toContain("•");
  });
});
