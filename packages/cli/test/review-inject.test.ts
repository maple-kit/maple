import { describe, expect, it } from "vitest";

import { injectOverlay, overlayTag, relaxMeta } from "../src/review/inject.js";

const TAG = {
  src: "/__maple/overlay.js",
  branch: "feat/x",
  basePath: "/__maple/api",
  root: "/work/app",
  appDir: "apps/web",
} as const;

describe("overlayTag", () => {
  it("carries what the script reads, and the nonce when there is one", () => {
    expect(overlayTag({ ...TAG, nonce: "abc" })).toBe(
      '<script src="/__maple/overlay.js" data-branch="feat/x" data-base-path="/__maple/api" data-root="/work/app" data-app-dir="apps/web" nonce="abc"></script>',
    );
  });

  it("escapes a value that would end the attribute", () => {
    expect(overlayTag({ ...TAG, branch: 'a"><b' })).toContain('data-branch="a&quot;&gt;&lt;b"');
  });
});

describe("injectOverlay", () => {
  it.each([
    [
      "before the last closing body tag",
      "<html><body><p>hi</p></BODY></html>",
      "<p>hi</p>",
      "</BODY>",
    ],
    ["at the end of a page with no body tag", "<p>hi</p>", "<p>hi</p>", ""],
  ] as const)("adds the tag %s", (_name, html, before, after) => {
    const result = injectOverlay(html, TAG);

    expect(result.added).toBe(true);
    expect(result.html).toContain(`${before}${overlayTag(TAG)}${after}`);
  });

  it("changes nothing else about the page", () => {
    const html =
      "<!doctype html><html><head><title>x</title></head><body>\n<p>  hi </p>\n</body></html>";

    expect(injectOverlay(html, TAG).html.replace(overlayTag(TAG), "")).toBe(html);
  });

  it("does not add the tag twice", () => {
    const once = injectOverlay("<body></body>", TAG).html;

    expect(injectOverlay(once, TAG)).toEqual({ html: once, added: false });
  });
});

describe("relaxMeta", () => {
  it("relaxes a policy carried in a meta tag, in either quote style", () => {
    const html =
      "<head><meta http-equiv=\"Content-Security-Policy\" content=\"script-src https://cdn.test\"><meta http-equiv='content-security-policy' content='default-src none'></head>";

    const relaxed = relaxMeta(html, () => "N");

    expect(relaxed.html).toContain(
      "content=\"script-src https://cdn.test; script-src-elem https://cdn.test 'self'\"",
    );
    expect(relaxed.changed).toContain("script-src-elem");
  });

  it("leaves a page with no policy alone", () => {
    const html =
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>';

    expect(relaxMeta(html, () => "N")).toEqual({ html, changed: [] });
  });
});
