import { describe, expect, it } from "vitest";

import { relaxHeader, relaxPolicy } from "../src/review/csp.js";

const fresh = () => "N";

describe("relaxPolicy", () => {
  it.each([
    [
      "leaves a policy that only limits scripts, with a nonce, and reuses the nonce",
      "script-src 'nonce-abc' 'strict-dynamic'",
      "script-src 'nonce-abc' 'strict-dynamic'",
      "abc",
      [],
    ],
    [
      "adds only blob: to a policy that already allows itself everywhere",
      "default-src 'self'",
      "default-src 'self'; img-src 'self' blob:",
      undefined,
      ["img-src"],
    ],
    [
      "adds a nonce where strict-dynamic would ignore every host",
      "script-src 'strict-dynamic' 'sha256-x'",
      "script-src 'strict-dynamic' 'sha256-x'; script-src-elem 'strict-dynamic' 'sha256-x' 'nonce-N'",
      "N",
      ["script-src-elem"],
    ],
    [
      "adds self to a policy that names other hosts, on the script element alone",
      "script-src https://cdn.test",
      "script-src https://cdn.test; script-src-elem https://cdn.test 'self'",
      undefined,
      ["script-src-elem"],
    ],
    [
      "opens exactly three directives on a policy that allows nothing",
      "default-src 'none'",
      "default-src 'none'; script-src-elem 'self'; connect-src 'self'; img-src blob:",
      undefined,
      ["script-src-elem", "connect-src", "img-src"],
    ],
    [
      "lets the overlay call home when connect-src names only another host",
      "script-src 'self'; connect-src https://api.test; img-src * blob:",
      "script-src 'self'; connect-src https://api.test 'self'; img-src * blob:",
      undefined,
      ["connect-src"],
    ],
    [
      "leaves a policy with nothing to relax byte for byte",
      "script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:",
      "script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:",
      undefined,
      [],
    ],
    [
      "keeps the first of a repeated directive, as a browser does",
      "script-src 'self'; script-src 'none'",
      "script-src 'self'; script-src 'none'",
      undefined,
      [],
    ],
  ] as const)("%s", (_name, ...row) => {
    const [policy, expected, nonce, changed] = row as unknown as [
      string,
      string,
      string | undefined,
      string[],
    ];
    const relaxed = relaxPolicy(policy, fresh);

    expect(relaxed.policy).toBe(expected);
    expect(relaxed.nonce).toBe(nonce);
    expect(relaxed.changed).toEqual(changed);
  });

  it("does not mint a nonce for a policy that has one", () => {
    let minted = 0;
    relaxPolicy("script-src 'nonce-abc' 'strict-dynamic'; img-src 'self'", () => {
      minted += 1;
      return "N";
    });

    expect(minted).toBe(0);
  });
});

describe("relaxHeader", () => {
  it("relaxes each policy of a comma-joined header alone", () => {
    const relaxed = relaxHeader("default-src 'self', script-src https://cdn.test", fresh);

    expect(relaxed.header).toBe(
      "default-src 'self'; img-src 'self' blob:, script-src https://cdn.test; script-src-elem https://cdn.test 'self'",
    );
    expect(relaxed.changed).toEqual(["img-src", "script-src-elem"]);
  });
});
