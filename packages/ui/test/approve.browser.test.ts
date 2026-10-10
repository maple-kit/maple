import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import { Approve, Logo } from "../src/island/index.js";
import { COMMENTS } from "./fixtures.js";

import type { Comment, MapleUser } from "@maple-kit/core";
import type { Approval } from "@maple-kit/core";
import type { ReactElement } from "react";

const BRANCH = "feat/ui-approve";
const ORIGIN = "https://preview.example";
const COMMIT = "1f3c9ab";

/** What the route answers, which is the whole of what the row depends on. */
interface Route {
  /** False answers 501 on `/approvals`: a store with nowhere to keep one. */
  readonly keepsApprovals?: boolean;
  readonly required?: boolean;
  readonly user?: MapleUser | null;
  readonly approvals?: readonly Approval[];
  readonly comments?: readonly Comment[];
  /** How long a write takes, so a test can look at the state while it is out. */
  readonly slowMs?: number;
  /** Told the id of each comment the page changed the status of. */
  readonly onPatch?: (id: string) => void;
}

const later = (ms: number | undefined) => new Promise<void>((done) => setTimeout(done, ms ?? 0));

function approval(author: { id: string; name: string }): Approval {
  return {
    id: `app_${author.id}`,
    branch: BRANCH,
    commit: COMMIT,
    author: { ...author, provenance: "server" },
    at: "2026-09-22T09:00:00.000Z",
  };
}

function routeFetch(route: Route): typeof globalThis.fetch {
  const held = [...(route.approvals ?? [])];
  const comments = [...(route.comments ?? [])];

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";

    const one = /\/comments\/([^/?]+)/.exec(url)?.[1];
    if (one !== undefined && method === "PATCH") {
      const status = (JSON.parse(init?.body as string) as { status: Comment["status"] }).status;
      route.onPatch?.(one);
      const found = comments.findIndex((comment) => comment.id === one);
      comments[found] = { ...comments[found]!, status };
      return json(comments[found], 200);
    }
    if (url.includes("/approvals")) {
      if (method !== "GET") await later(route.slowMs);
      if (route.keepsApprovals === false) {
        return json({ error: "This store keeps no approvals" }, 501);
      }
      if (method === "POST") {
        const made = approval({ id: route.user?.id ?? "u_7", name: route.user?.name ?? "Dana" });
        held.push(made);
        return json(made, 201);
      }
      if (method === "DELETE") {
        held.length = 0;
        return json({ branch: BRANCH }, 200);
      }
      return json({ approvals: held }, 200);
    }
    if (url.includes("/me")) {
      return Promise.resolve(
        json(
          {
            user: route.user === undefined ? { id: "u_7", name: "Dana" } : route.user,
            approval: { required: route.required === true },
          },
          200,
        ),
      );
    }
    return json({ comments }, 200);
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function tree(route: Route): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: routeFetch(route), origin: ORIGIN } },
    createElement(Logo),
    createElement(Approve),
  );
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function button(): HTMLButtonElement | null {
  return root().querySelector<HTMLButtonElement>(".mk-approve");
}

/** Waits for the button to settle, so a race is not a finding. */
async function settled(
  accept: (found: HTMLButtonElement | null) => boolean,
): Promise<HTMLButtonElement | null> {
  await expect.poll(() => accept(button())).toBe(true);
  return button();
}

const pressed = (one: HTMLButtonElement | null) => one?.getAttribute("aria-pressed") === "true";

describe("the sign-off button", () => {
  it("draws nothing where the store keeps no approvals", async () => {
    await render(tree({ keepsApprovals: false }));
    await expect.poll(() => root().querySelector(".mk-approve")).toBeNull();
  });

  it("is one icon with its words as the label, and no sentence beside it", async () => {
    await render(tree({}));
    const found = await settled((one) => one !== null);

    expect(found?.getAttribute("aria-label")).toBe("Approve");
    expect(found?.textContent).toBe("");
    expect(found?.querySelector("svg")).not.toBeNull();
    expect(pressed(found)).toBe(false);
    expect(found?.classList.contains("mk-icon-btn-ok")).toBe(true);
  });

  it("records an approval and shows it as pressed", async () => {
    await render(tree({}));
    await settled((one) => one !== null);

    button()?.click();
    const found = await settled(pressed);

    expect(found?.getAttribute("aria-label")).toBe("Approve");
    expect(found?.classList.contains("mk-icon-btn-ok")).toBe(false);
  });

  it("takes it back again", async () => {
    await render(tree({}));
    await settled((one) => one !== null);

    button()?.click();
    await settled(pressed);

    button()?.click();
    await settled((one) => one !== null && !pressed(one));
  });

  it("is not pressed by somebody else's sign-off", async () => {
    await render(tree({ approvals: [approval({ id: "u_9", name: "Sam" })] }));
    const found = await settled((one) => one !== null);

    expect(pressed(found)).toBe(false);
  });

  it("will not let a guest sign, and says why", async () => {
    await render(tree({ user: null }));
    await settled((one) => one !== null);

    expect(button()?.disabled).toBe(true);
    expect(button()?.title).toContain("Sign in first");
  });

  it("also resolves the comments its author left open, and only theirs", async () => {
    const mine = COMMENTS.filter((one) => one.author.id === "sam" && one.status === "open");
    const others = COMMENTS.filter((one) => one.author.id !== "sam" && one.status === "open");
    expect(mine.length).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);
    const changed: string[] = [];

    await render(
      tree({
        user: { id: "sam", name: "Sam" },
        comments: COMMENTS,
        onPatch: (id) => changed.push(id),
      }),
    );
    await settled((one) => one !== null);

    button()?.click();
    await expect.poll(() => changed.length).toBe(mine.length);
    expect(changed.toSorted((a, b) => a.localeCompare(b))).toEqual(
      mine.map((one) => one.id).toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it("spins in place of the check, and beside the wordmark, while the store answers", async () => {
    await render(tree({ slowMs: 300 }));
    await settled((one) => one !== null);
    expect(root().querySelector(".mk-working")).toBeNull();

    button()?.click();
    await expect.poll(() => button()?.querySelector(".mk-spin") !== null).toBe(true);
    expect(button()?.querySelector("svg")).toBeNull();
    expect(button()?.disabled).toBe(true);
    expect(root().querySelector(".mk-head-title .mk-working .mk-spin")).not.toBeNull();

    await settled(pressed);
    await expect.poll(() => root().querySelector(".mk-working")).toBeNull();
    expect(button()?.disabled).toBe(false);
  });
});
