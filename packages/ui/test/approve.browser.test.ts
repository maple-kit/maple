import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import { Approve } from "../src/island/index.js";

import type { MapleUser } from "@maple-kit/core";
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
}

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

  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";

    if (url.includes("/approvals")) {
      if (route.keepsApprovals === false) {
        return Promise.resolve(json({ error: "This store keeps no approvals" }, 501));
      }
      if (method === "POST") {
        const made = approval({ id: route.user?.id ?? "u_7", name: route.user?.name ?? "Dana" });
        held.push(made);
        return Promise.resolve(json(made, 201));
      }
      if (method === "DELETE") {
        held.length = 0;
        return Promise.resolve(json({ branch: BRANCH }, 200));
      }
      return Promise.resolve(json({ approvals: held }, 200));
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
    return Promise.resolve(json({ comments: [] }, 200));
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

    expect(found?.getAttribute("aria-label")).toBe("Looked, found nothing wrong");
    expect(found?.textContent).toBe("");
    expect(found?.querySelector("svg")).not.toBeNull();
    expect(pressed(found)).toBe(false);
  });

  it("records an approval and shows it as pressed", async () => {
    await render(tree({}));
    await settled((one) => one !== null);

    button()?.click();
    const found = await settled(pressed);

    expect(found?.getAttribute("aria-label")).toBe("Looked, found nothing wrong");
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
});
