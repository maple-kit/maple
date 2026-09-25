import { describe, expect, it, vi } from "vitest";

import { createNavigationGuard, navigateOnPurpose } from "../src/client/index.js";

import type { LeaveReason, NavigationView } from "../src/client/index.js";

/** A window-shaped stub: the guard only ever asks for these four things. */
function stub() {
  const listeners = new Map<string, Set<EventListener>>();
  const pushState = vi.fn();
  const replaceState = vi.fn();
  const assign = vi.fn();

  const add = (type: string, fn: EventListener): void => {
    const held = listeners.get(type) ?? new Set<EventListener>();
    held.add(fn);
    listeners.set(type, held);
  };

  const history = { pushState, replaceState } as unknown as History;
  const view = {
    document: { addEventListener: add, removeEventListener: () => undefined },
    history,
    location: {
      href: "https://preview.example.com/a",
      origin: "https://preview.example.com",
      assign,
    },
    addEventListener: add,
    removeEventListener: (type: string, fn: EventListener) => {
      listeners.get(type)?.delete(fn);
    },
  } as unknown as NavigationView;

  return {
    view,
    history,
    pushState,
    assign,
    attached: (type: string) => listeners.get(type)?.size ?? 0,
    emit: (type: string, event: Partial<Event> = {}) => {
      for (const fn of listeners.get(type) ?? []) fn(event as Event);
    },
  };
}

function guard(dirty = true, confirmOnUnload = false) {
  const page = stub();
  const save = vi.fn();
  const onLeave = vi.fn<(reason: LeaveReason) => void>();
  const guarded = createNavigationGuard({
    view: page.view,
    save,
    isDirty: () => dirty,
    onLeave,
    confirmOnUnload,
  });

  return { ...page, save, onLeave, guarded };
}

/**
 * The regression this exists for: a `beforeunload` listener left attached
 * costs bfcache on every page in the host application, and Maple gets blamed.
 */
describe("beforeunload", () => {
  it("exists only while a draft is dirty", () => {
    const { guarded, attached } = guard();
    guarded.start();
    expect(attached("beforeunload")).toBe(0);

    guarded.setDirty(true);
    expect(attached("beforeunload")).toBe(1);

    guarded.setDirty(false);
    expect(attached("beforeunload")).toBe(0);
  });

  it("is attached once however often dirtiness is re-announced", () => {
    const { guarded, attached } = guard();
    guarded.start();
    guarded.setDirty(true);
    guarded.setDirty(true);

    expect(attached("beforeunload")).toBe(1);
  });

  it("comes off when the guard stops, whatever state it was in", () => {
    const { guarded, attached } = guard();
    guarded.start();
    guarded.setDirty(true);
    guarded.stop();

    expect(attached("beforeunload")).toBe(0);
  });

  it("saves rather than asking, unless the caller asked for the browser's dialog", () => {
    const { guarded, save, emit } = guard();
    guarded.start();
    guarded.setDirty(true);
    const preventDefault = vi.fn();
    emit("beforeunload", { preventDefault });

    expect(save).toHaveBeenCalledTimes(1);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("asks when the caller wants the dialog and the reviewer did not choose to leave", () => {
    const { guarded, emit } = guard(true, true);
    guarded.start();
    guarded.setDirty(true);
    const preventDefault = vi.fn();
    emit("beforeunload", { preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("saves but does not ask on a navigation the reviewer chose, and only that one", () => {
    const { guarded, save, emit, view, assign } = guard(true, true);
    guarded.start();
    guarded.setDirty(true);
    navigateOnPurpose(view, "https://preview.example.com/a?maple-mock=x");
    const chosen = vi.fn();
    emit("beforeunload", { preventDefault: chosen });

    expect(assign).toHaveBeenCalledWith("https://preview.example.com/a?maple-mock=x");
    expect(save).toHaveBeenCalledTimes(1);
    expect(chosen).not.toHaveBeenCalled();

    const next = vi.fn();
    emit("beforeunload", { preventDefault: next });
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("a route change inside the application", () => {
  it("saves and then lets the navigation happen", () => {
    const { guarded, save, onLeave, history, pushState } = guard();
    guarded.start();
    history.pushState({ page: 2 }, "", "/b");

    expect(save).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledWith("history");
    expect(pushState).toHaveBeenCalledWith({ page: 2 }, "", "/b");
  });

  it("does not write when there is nothing unsent", () => {
    const { guarded, save, history } = guard(false);
    guarded.start();
    history.pushState(null, "", "/b");

    expect(save).not.toHaveBeenCalled();
  });

  it("puts the original methods back when it stops", () => {
    const { guarded, history, pushState } = guard();
    guarded.start();
    guarded.stop();
    history.pushState(null, "", "/b");

    expect(pushState).toHaveBeenCalledTimes(1);
  });
});

/** A back button cannot be cancelled: save, let it happen, restore on return. */
describe("going back", () => {
  it("saves and tells the caller, rather than trying to stop it", () => {
    const { guarded, save, onLeave, emit } = guard();
    guarded.start();
    emit("popstate");

    expect(save).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledWith("popstate");
  });
});
