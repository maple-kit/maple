import { createMapleClient } from "@maple-kit/core/client";
import { toCommentContext } from "@maple-kit/core/overlay";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { MapleActions } from "../src/composer/actions.js";
import { ATTACH_WORDS, MapleAttachments } from "../src/composer/attachments.js";
import { MapleContextBadge } from "../src/composer/badge.js";
import { MapleBody } from "../src/composer/body.js";
import { MapleComposer } from "../src/composer/composer.js";
import { createLeaveAsk } from "../src/composer/leave.js";
import { LEAVE_DISCARD, LEAVE_KEEP } from "../src/composer/phrase.js";
import { MapleTarget } from "../src/composer/target.js";
import { MapleRoot } from "../src/index.js";
import {
  createMapleFake,
  fetchThrough,
  MAPLE_BASE,
  UPLOAD_PATH,
  uploadRoute,
  uploadUnavailable,
} from "./msw/composer.js";

import type { LeaveAsk } from "../src/composer/leave.js";
import type { MediaRef } from "@maple-kit/core";
import type { ClientView, MapleClient, MapleClientOptions } from "@maple-kit/core/client";
import type { PageContext } from "@maple-kit/core/overlay";
import type { PastedImage } from "@maple-kit/core/screenshot";
import type { RequestHandler } from "msw";
import type { ReactElement } from "react";

const BRANCH = "feat/ui-composer";
const WIDE: readonly [number, number] = [1100, 760];

const PAGE: PageContext = {
  url: "https://preview.example.com/dashboard",
  viewport: { width: 1440, height: 900, contentWidth: 1020, dpr: 2 },
  scheme: "dark",
  breakpoint: "lg",
  locale: "en-GB",
  timeZone: "Europe/Berlin",
  reducedMotion: false,
  regions: [{ role: "complementary", label: "Copilot", width: 420 }],
  capturedAt: "2026-03-02T10:00:00.000Z",
};

let client: MapleClient;
let assigned: string[];

beforeEach(async () => {
  localStorage.clear();
  assigned = [];
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(...WIDE);
});

afterEach(async () => {
  client.destroy();
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
  for (const stray of document.querySelectorAll("[data-probe]")) stray.remove();
  await page.viewport(...WIDE);
});

/** Everything the composer's route answers, and nothing else. */
function routes(...extra: RequestHandler[]): typeof globalThis.fetch {
  const fake = createMapleFake({ user: { id: "u_7", name: "Reviewer" } });
  return fetchThrough([...extra, ...fake.handlers, uploadRoute()]);
}

function started(options: Partial<MapleClientOptions> = {}): MapleClient {
  client = createMapleClient({
    branch: BRANCH,
    basePath: MAPLE_BASE,
    fetch: routes(),
    debounceMs: 0,
    ...options,
  });
  client.start();
  return client;
}

/** A view whose navigation is recorded rather than performed. */
function recorded(): ClientView {
  return {
    document,
    history: window.history,
    location: {
      href: window.location.href,
      origin: window.location.origin,
      assign: (url: string) => assigned.push(url),
    },
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    matchMedia: window.matchMedia.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
  };
}

interface TreeOptions {
  readonly upload?: (image: PastedImage) => Promise<MediaRef>;
  readonly leave?: LeaveAsk;
  readonly peek?: boolean;
}

function tree(options: TreeOptions = {}): ReactElement {
  const composer = createElement(
    MapleComposer,
    {
      ...(options.leave === undefined ? {} : { leave: options.leave }),
      ...(options.peek === undefined ? {} : { peek: options.peek }),
    },
    createElement(MapleTarget, { key: "t" }),
    createElement(MapleBody, { key: "b" }),
    createElement(MapleContextBadge, { key: "c" }),
    createElement(MapleContextBadge, { key: "p", context: PAGE, className: "probe-page" }),
    createElement(MapleContextBadge, {
      key: "s",
      context: toCommentContext(PAGE),
      className: "probe-stored",
    }),
    createElement(MapleAttachmentsWith, { key: "a", ...options }),
    createElement(MapleActions, { key: "f" }),
  );

  return createElement(MapleRoot, { branch: BRANCH, client, children: composer });
}

/** The strip, with whatever upload the test wants behind it. */
function MapleAttachmentsWith(options: TreeOptions): ReactElement {
  return createElement(MapleAttachments, options.upload ? { upload: options.upload } : {});
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function panel(): HTMLElement {
  const found = root().querySelector<HTMLElement>(".mk-composer");
  if (!found) throw new Error("the composer is not rendered");
  return found;
}

async function open(options: TreeOptions = {}): Promise<HTMLElement> {
  await render(tree(options));
  await vi.waitFor(() => expect(root().querySelector(".mk-composer")).not.toBeNull());

  client.openComposer({
    kind: "element",
    anchor: { component: "YieldCard" },
    label: "the Yield card",
    context: toCommentContext(PAGE),
  });
  await vi.waitFor(() => expect(panel().getAttribute("data-mk-open")).toBe("true"));
  return panel();
}

/**
 * The trap this gate is named for: `c` opens comment mode, `Ctrl`+`C` is copy,
 * and the first build fired on the key alone.
 */
describe("the bare-key shortcut, with a real selection on the page", () => {
  function selectAPassage(): Selection {
    const passage = document.createElement("p");
    passage.dataset["probe"] = "passage";
    passage.textContent = "Retention fell after the March release, and nobody said why.";
    document.body.append(passage);

    const selection = window.getSelection();
    if (!selection) throw new Error("this browser has no selection");
    selection.removeAllRanges();
    selection.selectAllChildren(passage);
    return selection;
  }

  function press(init: KeyboardEventInit, target: EventTarget = document): void {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true, ...init }));
  }

  it.each([
    ["ctrl", { ctrlKey: true }],
    ["meta", { metaKey: true }],
    ["alt", { altKey: true }],
  ])("leaves the composer alone while %s is held over a selection", async (_which, modifier) => {
    started();
    await render(tree());
    const selection = selectAPassage();

    press(modifier);

    expect(client.getState().pick.armed).toBe(false);
    expect(client.getState().composer.open).toBe(false);
    expect(selection.toString()).toContain("Retention fell");
  });

  it("arms element picking on a bare c, selection or not", async () => {
    started();
    await render(tree());
    selectAPassage();

    press({});

    expect(client.getState().pick).toEqual({ armed: true, kind: "element" });
  });

  it("stays out of the way of anyone typing a c", async () => {
    started();
    await render(tree());
    const field = document.createElement("input");
    field.dataset["probe"] = "field";
    document.body.append(field);

    press({}, field);

    expect(client.getState().pick.armed).toBe(false);
  });
});

/** There is no `variant="sheet"`. The only thing that decides is the width. */
describe("the panel and the sheet", () => {
  it("is 360px of side panel above the breakpoint", async () => {
    started();
    const surface = await open();

    expect(getComputedStyle(surface).width).toBe("360px");
    expect(getComputedStyle(surface).borderTopLeftRadius).toBe("0px");
  });

  it("becomes a full-width sheet below it, through the media query alone", async () => {
    started();
    const surface = await open();
    await page.viewport(500, 760);

    await vi.waitFor(() => expect(getComputedStyle(surface).width).toBe("500px"));
    expect(getComputedStyle(surface).borderTopLeftRadius).toBe("10px");
    expect(surface.getAttribute("data-mk-detent")).toBe("half");
  });

  it("offers the second detent only where there is a sheet to resize", async () => {
    started();
    const surface = await open();
    const grabber = surface.querySelector<HTMLButtonElement>(".mk-grab");

    expect(getComputedStyle(grabber!).display).toBe("none");
    await page.viewport(500, 760);
    await vi.waitFor(() => expect(getComputedStyle(grabber!).display).toBe("block"));

    grabber!.click();
    await vi.waitFor(() => expect(surface.getAttribute("data-mk-detent")).toBe("full"));
  });

  it("opens in 400ms and closes in 350ms, with no overshoot on either", async () => {
    started();
    const surface = await open();

    expect(getComputedStyle(surface).transitionDuration).toBe("0.4s, 0.4s");
    client.closeComposer();

    await vi.waitFor(() => expect(surface.getAttribute("data-mk-open")).toBe("false"));
    expect(getComputedStyle(surface).transitionDuration).toBe("0.35s, 0.35s");
    expect(getComputedStyle(surface).transitionTimingFunction).toContain("cubic-bezier(0.22, 1");
  });
});

/** One formatter, two inputs: a fresh capture and a comment stored months ago. */
describe("the context badge", () => {
  /** The badge's rows as label to value, which is what it is drawn as. */
  function rows(selector: string): Record<string, string> {
    const list = root().querySelector(selector);
    const labels = [...(list?.querySelectorAll("dt") ?? [])].map((one) => one.textContent ?? "");
    const values = [...(list?.querySelectorAll("dd") ?? [])].map((one) => one.textContent ?? "");
    return Object.fromEntries(labels.map((label, index) => [label, values[index] ?? ""]));
  }

  it("renders the same badge from a captured page and from a stored comment", async () => {
    started();
    await open();

    expect(rows(".probe-page")).toEqual(rows(".probe-stored"));
  });

  it("states how much of the width was covered rather than two numbers to subtract", async () => {
    started();
    await open();

    expect(rows(".probe-page")).toEqual({
      Width: "1440px · 420px covered",
      Theme: "dark",
      Open: "Copilot",
    });
  });

  it("names the layout width, the breakpoint, the ratio and the locale in developer detail", async () => {
    started();
    await open();
    client.setDetail("developer");

    await vi.waitFor(() => expect(rows(".probe-page")["Window"]).toBe("1440px"));
    expect(rows(".probe-page")).toEqual({
      Window: "1440px",
      Content: "1020px",
      Breakpoint: "lg",
      Scheme: "dark",
      DPR: "2×",
      Locale: "en-GB",
      Open: "Copilot",
    });
  });

  it("is a labelled list inside its card, so its values line up in one column", async () => {
    started();
    await open();
    const list = root().querySelector<HTMLElement>(".probe-page .mk-ctx");

    expect(list?.tagName).toBe("DL");
    expect(getComputedStyle(list!).display).toBe("grid");
  });

  it("sets every width in tabular figures, because they change in place", async () => {
    started();
    await open();
    const value = root().querySelector<HTMLElement>(".probe-page .mk-ctx dd");

    expect(getComputedStyle(value!).fontVariantNumeric).toContain("tabular-nums");
  });
});

/** Paste first. The preview is a blob: URL, which is the one directive Maple asks for. */
describe("attachments", () => {
  function pasteAnImage(surface: HTMLElement): void {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" }),
    );
    surface.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, composed: true }),
    );
  }

  function uploadThrough(fetcher: typeof globalThis.fetch) {
    return async (image: PastedImage): Promise<MediaRef> => {
      const response = await fetcher(UPLOAD_PATH, { method: "POST", body: image.blob });
      if (!response.ok) throw new Error("the upload failed");
      return (await response.json()) as MediaRef;
    };
  }

  it("previews a pasted image and attaches it to the comment", async () => {
    started();
    const surface = await open({ upload: uploadThrough(fetchThrough([uploadRoute()])) });

    pasteAnImage(surface);

    const shot = await vi.waitFor(() => {
      const found = root().querySelector<HTMLImageElement>("img.mk-shot");
      if (!found) throw new Error("no preview yet");
      return found;
    });
    expect(shot.src.startsWith("blob:")).toBe(true);
    expect(shot.alt).toBe(ATTACH_WORDS.alt);

    await vi.waitFor(() => expect(client.getState().composer.attachments).toHaveLength(1));
  });

  it("keeps the preview and says so when the upload fails", async () => {
    started();
    const surface = await open({ upload: uploadThrough(fetchThrough([uploadUnavailable()])) });

    pasteAnImage(surface);

    await vi.waitFor(() =>
      expect(root().querySelector(".mk-shots")?.textContent).toContain(ATTACH_WORDS.failed),
    );
    expect(client.getState().composer.attachments).toHaveLength(0);
    expect(root().querySelector("img.mk-shot")).not.toBeNull();
  });

  it("asks for a paste or a drop, and offers no button to do it with", async () => {
    started();
    await open();
    const strip = root().querySelector(".mk-shots");

    expect(strip?.textContent).toContain(ATTACH_WORDS.hint);
    expect(strip?.querySelector("button")).toBeNull();
    expect(strip?.querySelector("input[type=file]")).toBeNull();
  });

  it("outlines the thumbnail rather than bordering it", async () => {
    started();
    const surface = await open({ upload: uploadThrough(fetchThrough([uploadRoute()])) });
    pasteAnImage(surface);

    const shot = await vi.waitFor(() => {
      const found = root().querySelector<HTMLImageElement>("img.mk-shot");
      if (!found) throw new Error("no preview yet");
      return found;
    });
    expect(getComputedStyle(shot).outlineWidth).toBe("1px");
    expect(getComputedStyle(shot).borderTopWidth).toBe("0px");
  });
});

/** The panel covers the page it is about, so it gets out of the way on request. */
describe("hold-to-peek", () => {
  it("drops to 8% and takes no pointer while Space is held, and comes straight back", async () => {
    started();
    const surface = await open();

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    await vi.waitFor(() => expect(getComputedStyle(surface).opacity).toBe("0.08"));
    expect(surface.getAttribute("data-mk-peek")).toBe("true");
    expect(getComputedStyle(surface).pointerEvents).toBe("none");

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    await vi.waitFor(() => expect(getComputedStyle(surface).opacity).toBe("1"));
    expect(surface.getAttribute("data-mk-peek")).toBe("false");
  });

  it("leaves Space alone inside the comment being written", async () => {
    started();
    const surface = await open();
    const field = surface.querySelector<HTMLTextAreaElement>(".mk-field");
    field?.focus();

    field?.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, composed: true }),
    );

    expect(surface.getAttribute("data-mk-peek")).toBe("false");
  });

  it("can be turned off where Space means something else", async () => {
    started();
    const surface = await open({ peek: false });

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));

    expect(surface.getAttribute("data-mk-peek")).toBe("false");
  });
});

/** Never lose an unsent comment: the prompt names it rather than asking a question. */
describe("the leave prompt", () => {
  async function anUnsentComment(ask: LeaveAsk): Promise<void> {
    started({ view: recorded(), askToLeave: ask.askToLeave });
    await open({ leave: ask });
    client.setBody("The number is wrong.");
    expect(client.getState().composer.dirty).toBe(true);
  }

  function clickALink(): void {
    const link = document.createElement("a");
    link.dataset["probe"] = "link";
    link.href = "/elsewhere";
    link.textContent = "Elsewhere";
    document.body.append(link);
    link.click();
  }

  it("names what is at stake and offers keeping it", async () => {
    const ask = createLeaveAsk();
    await anUnsentComment(ask);

    clickALink();

    const card = await vi.waitFor(() => {
      const found = root().querySelector<HTMLElement>(".mk-leave");
      if (found?.getAttribute("data-mk-open") !== "true") throw new Error("not asked yet");
      return found;
    });
    expect(card.textContent).toContain("You have an unsent comment on the Yield card");
    expect(card.textContent).toContain(LEAVE_KEEP);
    expect(card.textContent).toContain(LEAVE_DISCARD);
    expect(card.textContent?.toLowerCase()).not.toContain("are you sure");
  });

  it("discards the draft and follows the link when discard is chosen", async () => {
    const ask = createLeaveAsk();
    await anUnsentComment(ask);
    const draftId = client.getState().composer.draftId;

    clickALink();
    const discard = await vi.waitFor(() => {
      const buttons = [...root().querySelectorAll<HTMLButtonElement>(".mk-leave button")];
      const found = buttons.find((button) => button.textContent === LEAVE_DISCARD);
      if (!found) throw new Error("not asked yet");
      return found;
    });
    discard.click();

    await vi.waitFor(() => expect(client.getState().composer.dirty).toBe(false));
    expect(client.getState().drafts.map((draft) => draft.id)).not.toContain(draftId);
    expect(assigned).toHaveLength(1);
  });

  it("keeps the draft and stays on the page when keep writing is chosen", async () => {
    const ask = createLeaveAsk();
    await anUnsentComment(ask);

    clickALink();
    const keep = await vi.waitFor(() => {
      const buttons = [...root().querySelectorAll<HTMLButtonElement>(".mk-leave button")];
      const found = buttons.find((button) => button.textContent === LEAVE_KEEP);
      if (!found) throw new Error("not asked yet");
      return found;
    });
    keep.click();

    await vi.waitFor(() =>
      expect(root().querySelector(".mk-leave")?.getAttribute("data-mk-open")).toBe("false"),
    );
    expect(client.getState().composer.dirty).toBe(true);
    expect(assigned).toHaveLength(0);
  });
});

/** The target line, the field and the two actions, which is the whole surface. */
describe("writing a comment", () => {
  it("names what the comment is on, in words rather than a selector", async () => {
    started();
    const surface = await open();

    expect(surface.querySelector(".mk-target")?.textContent).toBe("on the Yield card");
    expect(surface.querySelector(".mk-target-on")?.textContent).not.toContain("#");
  });

  /**
   * The target carries the bare name and the panel puts "an area of" round it
   * once. A phrase stored on the target read back as "an area of an area of".
   */
  it("phrases a region once, whatever the target was named", async () => {
    started();
    const surface = await open();

    client.openComposer({
      kind: "region",
      anchor: { component: "YieldCard", region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } },
      label: "the Yield card",
    });
    await vi.waitFor(() =>
      expect(surface.querySelector(".mk-target-on")?.textContent).toContain("an area of"),
    );

    const said = surface.querySelector(".mk-target-on")?.textContent ?? "";
    expect(said.match(/an area of/g)).toHaveLength(1);
    expect(said).toBe("on an area of the Yield card");
  });

  /**
   * The kind was a word beside the icon until the two together read as two
   * facts. They are one, and the sentence after them already says which.
   */
  it("says the kind with an icon, and keeps the word for a screen reader", async () => {
    started();
    const surface = await open();
    const kind = surface.querySelector(".mk-target-kind");

    expect(kind?.textContent).toBe("");
    expect(kind?.querySelector("svg")).not.toBeNull();
    expect(kind?.getAttribute("aria-label")).toBe("element");
  });

  it("leaves the rung, the confidence and the paths to developer mode", async () => {
    started();
    const surface = await open();

    expect(surface.querySelector("[data-mk-detail]")?.getAttribute("data-mk-detail")).toBe(
      "default",
    );
    expect(surface.textContent).not.toContain("%");
  });

  it("will not publish an empty comment, and publishes what was written", async () => {
    started();
    const surface = await open();
    const send = [...surface.querySelectorAll<HTMLButtonElement>(".mk-composer-foot button")].at(
      -1,
    );

    expect(send?.disabled).toBe(true);
    client.setBody("The yield number is wrong.");
    await vi.waitFor(() => expect(send?.disabled).toBe(false));

    send?.click();
    await vi.waitFor(() => expect(client.getState().comments).toHaveLength(1));
    expect(client.getState().composer.open).toBe(false);
    expect(client.getState().drafts).toHaveLength(0);
  });

  it("keeps the comment unsent when Keep is pressed, and closes", async () => {
    started();
    const surface = await open();
    client.setBody("Worth saying, not yet.");

    const keep = surface.querySelector<HTMLButtonElement>(".mk-composer-foot button");
    await vi.waitFor(() => expect(keep?.disabled).toBe(false));
    keep?.click();

    await vi.waitFor(() => expect(client.getState().composer.open).toBe(false));
    expect(client.getState().drafts).toHaveLength(1);
    expect(client.getState().comments).toHaveLength(0);
  });

  it("closes on Escape and keeps the unsent comment where it was", async () => {
    started();
    const surface = await open();
    client.setBody("Half a thought.");

    surface.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    await vi.waitFor(() => expect(client.getState().composer.open).toBe(false));
    expect(client.getState().drafts).toHaveLength(1);
  });

  it("says who the reviewer is with the avatar's form, never with the word", async () => {
    started();
    await client.load();
    const surface = await open();

    expect(surface.getAttribute("data-provenance")).toBe("server");
    expect(surface.textContent?.toLowerCase()).not.toContain("guest");
  });
});
