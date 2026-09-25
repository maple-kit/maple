import { createInventory } from "@maple-kit/mock";
import { createMockClient } from "@maple-kit/mock/client";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useMock } from "../src/mock/index.js";

import type { MockBinding, UseMockOptions } from "../src/mock/index.js";
import type { MockHandle } from "@maple-kit/mock/client";

function handle(): MockHandle {
  const inventory = createInventory();
  inventory.record("/", { key: "rest:GET /api/a", status: 200, body: [], at: 1 });
  return { recipe: undefined, inventory, dispose: () => undefined };
}

/** Renders the hook and hands back what it returned last. */
async function probe(options: UseMockOptions) {
  let last: MockBinding | undefined;
  function Probe() {
    last = useMock(options);
    return createElement("output", null, last.state.open ? "open" : "closed");
  }
  const screen = await render(createElement(Probe));
  return { screen, binding: () => last! };
}

describe("useMock", () => {
  it("builds and starts a client, so m opens it", async () => {
    const { binding, screen } = await probe({ handle: handle() });
    expect(binding().state.installed).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true }));
    await vi.waitFor(() => expect(screen.container.textContent).toBe("open"));
  });

  it("re-renders on a change the client makes", async () => {
    const { binding, screen } = await probe({ handle: handle() });
    binding().client.choose("rest:GET /api/a", "empty");

    await vi.waitFor(() => expect(binding().state.draft).toHaveLength(1));
    binding().client.setOpen(true);
    await vi.waitFor(() => expect(screen.container.textContent).toBe("open"));
  });

  it("leaves a client the caller owns alone on unmount", async () => {
    const client = createMockClient({ handle: handle() });
    const destroy = vi.spyOn(client, "destroy");
    const { binding, screen } = await probe({ client });

    expect(binding().client).toBe(client);
    await screen.unmount();
    expect(destroy).not.toHaveBeenCalled();
  });
});
