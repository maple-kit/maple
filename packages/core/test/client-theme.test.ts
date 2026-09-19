import { describe, expect, it } from "vitest";

import { hostScheme, overlaySchemeFor, relativeLuminance, themeFrom } from "../src/client/index.js";

import type { ThemeSignals, ThemeSource } from "../src/client/index.js";

/**
 * Order of confidence, and nothing below the one that answered is consulted.
 * A site that says it is dark is dark even on a machine that prefers light.
 */
describe("reading the host's scheme", () => {
  const cases: Array<[string, ThemeSignals, "dark" | "light", ThemeSource]> = [
    ["data-theme wins over everything", { theme: "dark", prefersDark: false }, "dark", "attribute"],
    ["data-mode is the same claim", { mode: "light", prefersDark: true }, "light", "attribute"],
    ["a dark class is next", { classNames: ["dark"], prefersDark: false }, "dark", "class"],
    ["a light class is read too", { classNames: ["light"], prefersDark: true }, "light", "class"],
    ["color-scheme comes third", { colorScheme: "dark" }, "dark", "color-scheme"],
    ["light dark says nothing", { colorScheme: "light dark" }, "light", "preference"],
    [
      "a near-black background is a dark page",
      { background: "rgb(12, 12, 14)" },
      "dark",
      "luminance",
    ],
    [
      "a white background is a light page",
      { background: "rgb(255, 255, 255)" },
      "light",
      "luminance",
    ],
    [
      "a transparent background says nothing",
      { background: "rgba(0, 0, 0, 0)" },
      "light",
      "preference",
    ],
    [
      "an oklch background says nothing yet",
      { background: "oklch(0.2 0 0)" },
      "light",
      "preference",
    ],
    ["the preference is the last word", { prefersDark: true }, "dark", "preference"],
    ["and light when nothing at all is known", {}, "light", "preference"],
  ];

  it.each(cases)("%s", (_name, signals, scheme, source) => {
    expect(hostScheme(signals)).toEqual({ scheme, source });
  });
});

/** The two schemes are not the same scheme, and this is where that is decided. */
describe("the overlay's scheme", () => {
  it("is the opposite of the host's, so a guest is not camouflaged", () => {
    expect(themeFrom({ theme: "dark" })).toEqual({
      host: "dark",
      overlay: "light",
      source: "attribute",
    });
    expect(themeFrom({ theme: "light" }).overlay).toBe("dark");
  });
});

describe("relative luminance", () => {
  it("is 1 for white and 0 for black", () => {
    expect(relativeLuminance("rgb(255, 255, 255)")).toBeCloseTo(1, 5);
    expect(relativeLuminance("rgb(0, 0, 0)")).toBeCloseTo(0, 5);
  });

  it("reads a fully opaque rgba", () => {
    expect(relativeLuminance("rgba(255, 255, 255, 1)")).toBeCloseTo(1, 5);
  });

  it("refuses anything it cannot be sure of", () => {
    expect(relativeLuminance("transparent")).toBeUndefined();
    expect(relativeLuminance(undefined)).toBeUndefined();
    expect(relativeLuminance("rgb(1, 2)")).toBeUndefined();
  });
});

/**
 * The preference decides what the overlay is drawn in; the host's scheme is
 * what a comment records. Conflating them writes the wrong one onto the wire.
 */
describe("what the overlay is drawn in", () => {
  const overLight = themeFrom({ theme: "light" });
  const overDark = themeFrom({ theme: "dark" });

  it("takes the opposite of the host on auto", () => {
    expect(overlaySchemeFor("auto", overLight)).toBe("dark");
    expect(overlaySchemeFor("auto", overDark)).toBe("light");
  });

  it("takes the viewer at their word on light and on dark", () => {
    expect(overlaySchemeFor("light", overLight)).toBe("light");
    expect(overlaySchemeFor("dark", overLight)).toBe("dark");
    expect(overlaySchemeFor("light", overDark)).toBe("light");
    expect(overlaySchemeFor("dark", overDark)).toBe("dark");
  });

  it("leaves the host's own scheme alone whatever it is asked for", () => {
    expect(overLight.host).toBe("light");
    expect(overDark.host).toBe("dark");
  });
});
