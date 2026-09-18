import { describe, expect, it } from "vitest";

import {
  captureElement,
  CaptureUnavailableError,
  imageFrom,
  imageIn,
  MAXIMUM_BYTES,
  previewOf,
} from "../src/screenshot/index.js";

function file(name: string, type: string, bytes = 8): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** A DataTransfer as a paste or a drop delivers it. */
function transfer(...files: File[]): DataTransfer {
  const data = new DataTransfer();
  for (const one of files) data.items.add(one);
  return data;
}

describe("an image the reviewer already has", () => {
  it("takes a pasted image", () => {
    const image = imageFrom(transfer(file("shot.png", "image/png")));
    expect(image?.type).toBe("image/png");
    expect(image?.name).toBe("shot.png");
  });

  it("takes the first image and ignores what is not one", () => {
    const image = imageFrom(transfer(file("notes.txt", "text/plain"), file("a.jpg", "image/jpeg")));
    expect(image?.type).toBe("image/jpeg");
  });

  it("finds nothing in a transfer with no image", () => {
    expect(imageFrom(transfer(file("notes.txt", "text/plain")))).toBeUndefined();
  });

  it("finds nothing in nothing", () => {
    expect(imageFrom(null)).toBeUndefined();
    expect(imageIn(null)).toBeUndefined();
  });

  it("refuses an image too large to wait on", () => {
    const enormous = file("huge.png", "image/png", MAXIMUM_BYTES + 1);
    expect(imageFrom(transfer(enormous))).toBeUndefined();
  });

  it("refuses an empty file, which is a failed drag rather than an image", () => {
    expect(imageFrom(transfer(file("empty.png", "image/png", 0)))).toBeUndefined();
  });

  it("takes an image chosen from a file input", () => {
    expect(imageIn([file("shot.png", "image/png")])?.type).toBe("image/png");
  });
});

describe("previewing before upload", () => {
  it("gives a blob URL an <img> can load", async () => {
    const image = imageFrom(transfer(file("shot.png", "image/png")))!;
    const preview = previewOf(image);

    expect(preview.url.startsWith("blob:")).toBe(true);
    expect((await fetch(preview.url)).ok).toBe(true);

    preview.revoke();
  });

  it("releases the blob when revoked", async () => {
    const image = imageFrom(transfer(file("shot.png", "image/png")))!;
    const preview = previewOf(image);
    preview.revoke();

    await expect(fetch(preview.url)).rejects.toThrow();
  });
});

describe("capturing the page", () => {
  function mount(html: string): HTMLElement {
    const page = document.createElement("div");
    page.setAttribute("style", "width: 200px; height: 80px; background: white");
    page.innerHTML = html;
    document.body.append(page);
    return page;
  }

  it("renders an element to an image", async () => {
    const page = mount(`<p style="font: 16px sans-serif">Revenue rose</p>`);

    try {
      const blob = await captureElement(page.querySelector("p")!, { ancestors: 0 });
      expect(blob.type).toBe("image/png");
      expect(blob.size).toBeGreaterThan(0);
    } finally {
      page.remove();
    }
  });

  it("widens to an ancestor, so the comment has context around it", async () => {
    const page = mount(`<section style="padding:20px"><b>Total</b></section>`);

    try {
      const tight = await captureElement(page.querySelector("b")!, { ancestors: 0, scale: 1 });
      const wide = await captureElement(page.querySelector("b")!, { ancestors: 1, scale: 1 });
      expect(wide.size).toBeGreaterThan(tight.size);
    } finally {
      page.remove();
    }
  });

  it("names the paste path when it cannot capture at all", () => {
    const error = new CaptureUnavailableError("The capture came out empty.");
    expect(error.message).toContain("pasted or dropped image");
  });
});
