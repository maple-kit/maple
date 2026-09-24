/**
 * Records the README's demo from the Vite example: a reviewer opens the
 * island, picks an element, writes a comment the assist tier scores as it is
 * typed, and publishes it. Frames come from the DevTools screencast, which is
 * lossless where Playwright's own video is not; `encode.sh` turns them into
 * the GIF and the MP4. The example has to be running first, with a key.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

import type { CDPSession, Page } from "playwright";

const URL = process.env["DEMO_URL"] ?? "http://localhost:5173/";
const OUT = process.env["DEMO_OUT"] ?? join(import.meta.dirname, ".frames");
/** The branch the example reviews, matching its own fallback. */
const BRANCH = process.env["VITE_MAPLE_BRANCH"] ?? "feat/example";
const VIEWPORT = { width: 1440, height: 900 };

const COMMENT = "Chart bars use a raw blue. Use the accent token.";

/** A cursor the screencast can see. The real one is never in a frame. */
const CURSOR = `
addEventListener("DOMContentLoaded", () => {
  const dot = document.createElement("div");
  dot.id = "demo-cursor";
  dot.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 8.2-6.6 1.6L8.6 18z" fill="#111318" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(dot.style, {
    position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none",
    transform: "translate(-100px,-100px)", transition: "scale 120ms ease-out", transformOrigin: "3px 2px",
    filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))",
  });
  document.documentElement.append(dot);
  addEventListener("mousemove", (e) => { dot.style.transform = "translate(" + (e.clientX - 3) + "px," + (e.clientY - 2) + "px)"; }, true);
  addEventListener("mousedown", () => { dot.style.scale = "0.86"; }, true);
  addEventListener("mouseup", () => { dot.style.scale = "1"; }, true);
});`;

interface Frame {
  readonly file: string;
  readonly at: number;
}

/** Collects every frame the compositor paints, with the time it painted it. */
async function startScreencast(cdp: CDPSession, frames: Frame[]): Promise<void> {
  cdp.on("Page.screencastFrame", (event) => {
    const file = `f${String(frames.length).padStart(5, "0")}.png`;
    frames.push({ file, at: event.metadata.timestamp ?? Date.now() / 1000 });
    void writeFile(join(OUT, file), Buffer.from(event.data, "base64"));
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId });
  });
  await cdp.send("Page.startScreencast", {
    format: "png",
    maxWidth: VIEWPORT.width * 2,
    maxHeight: VIEWPORT.height * 2,
  });
}

let cursor = { x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.55 };

/** Moves the way a hand does: eased at both ends, never in a straight tick. */
async function glide(page: Page, x: number, y: number, ms = 700): Promise<void> {
  const from = cursor;
  const steps = Math.max(12, Math.round(ms / 16));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
    await page.waitForTimeout(ms / steps);
  }
  cursor = { x, y };
}

/** Glides to the middle of whatever the locator finds, and clicks it. */
async function clickOn(page: Page, target: ReturnType<Page["locator"]>, ms?: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Nothing to click");
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, ms);
  await page.waitForTimeout(160);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

async function perform(page: Page): Promise<void> {
  await page.mouse.move(cursor.x, cursor.y);
  await page.waitForTimeout(500);

  await clickOn(page, page.getByRole("button", { name: /^Open Maple/ }), 600);
  await page.waitForTimeout(650);
  await clickOn(page, page.getByRole("button", { name: "Element", exact: true }), 450);
  await page.waitForTimeout(250);

  // Onto the chart, so the picker names it before the click lands.
  const bar = page.locator(".bar.gated").nth(3);
  const box = await bar.boundingBox();
  if (box) await glide(page, box.x + box.width / 2, box.y + 30, 750);
  await page.waitForTimeout(400);
  await clickOn(page, bar, 200);
  await page.waitForTimeout(600);

  await page.keyboard.type(COMMENT, { delay: 26 });
  // However long the classifier takes, the scores are the point: wait for them.
  await page.getByText("Names the fault").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1100);

  await clickOn(page, page.getByRole("button", { name: "Publish", exact: true }), 600);
  await page.waitForTimeout(1600);
}

/** The store is in memory, so a second take would start with the first one's comment. */
async function assertFreshStore(): Promise<void> {
  const answer = await fetch(new globalThis.URL(`api/maple/comments?branch=${BRANCH}`, URL));
  const { comments } = (await answer.json()) as { comments: { body: string }[] };
  if (comments.some((comment) => comment.body === COMMENT)) {
    throw new Error("The last take's comment is still in the store: restart the dev server.");
  }
}

async function main(): Promise<void> {
  await assertFreshStore();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const frames: Frame[] = [];
  const cdp = await context.newCDPSession(page);
  await startScreencast(cdp, frames);
  await perform(page);
  await cdp.send("Page.stopScreencast");
  await browser.close();

  // The concat demuxer's input: each frame held until the next one painted.
  const lines = frames.flatMap((frame, index) => {
    const next = frames[index + 1]?.at ?? frame.at + 0.5;
    return [`file '${frame.file}'`, `duration ${(next - frame.at).toFixed(4)}`];
  });
  const last = frames.at(-1);
  if (last) lines.push(`file '${last.file}'`);
  await writeFile(join(OUT, "frames.txt"), `${lines.join("\n")}\n`);
  process.stdout.write(`${String(frames.length)} frames in ${OUT}\n`);
}

await main();
