import { mirrord } from "@maple-kit/core/preview";
import { describe, expect, it } from "vitest";

import type { PreviewIdentity } from "@maple-kit/core/preview";

type Env = Record<string, string | undefined>;

interface Row {
  readonly name: string;
  readonly headers?: Record<string, string>;
  readonly env?: Env;
  readonly expected: Partial<PreviewIdentity> | null;
}

const URL = "https://preview.example.com/";

async function identify(row: Row): Promise<PreviewIdentity | null> {
  return mirrord({ env: row.env ?? {} }).identify({ headers: row.headers ?? {}, url: URL });
}

const ROWS: readonly Row[] = [
  { name: "no signal anywhere", expected: null },
  { name: "unrelated headers only", headers: { host: "app.example.com" }, expected: null },
  {
    name: "the host is never an identity",
    headers: { host: "maple-test.share.dev" },
    expected: null,
  },
  {
    name: "mirrord-key",
    headers: { "mirrord-key": "maple-test" },
    expected: { key: "maple-test", source: "header" },
  },
  {
    name: "mirrord-key, any case",
    headers: { "Mirrord-Key": "maple-test" },
    expected: { key: "maple-test", source: "header" },
  },
  {
    name: "mirrord-key is trimmed",
    headers: { "mirrord-key": "  maple-test " },
    expected: { key: "maple-test", source: "header" },
  },
  { name: "a blank mirrord-key is no key", headers: { "mirrord-key": "   " }, expected: null },
  {
    name: "a key with inner whitespace is noise",
    headers: { "mirrord-key": "a b" },
    expected: null,
  },
  { name: "an overlong key is noise", headers: { "mirrord-key": "k".repeat(256) }, expected: null },
  {
    name: "a blank mirrord-key falls through to baggage",
    headers: { "mirrord-key": "", baggage: "mirrord-session=from-baggage" },
    expected: { key: "from-baggage", source: "baggage" },
  },
  {
    name: "baggage among other members",
    headers: { baggage: "a=1,mirrord-session=k,b=2" },
    expected: { key: "k", source: "baggage" },
  },
  {
    name: "baggage with spaces around members",
    headers: { baggage: "foo=bar, mirrord-session=maple-test , x=y" },
    expected: { key: "maple-test", source: "baggage" },
  },
  {
    name: "baggage properties are dropped",
    headers: { baggage: "mirrord-session=k;prop=x" },
    expected: { key: "k", source: "baggage" },
  },
  {
    name: "baggage with two entries, the first wins",
    headers: { baggage: "mirrord-session=first,mirrord-session=second" },
    expected: { key: "first", source: "baggage" },
  },
  {
    name: "baggage value is percent-decoded",
    headers: { baggage: "mirrord-session=PR_123%2FFoo.Bar" },
    expected: { key: "PR_123/Foo.Bar", source: "baggage" },
  },
  {
    name: "baggage with a malformed escape",
    headers: { baggage: "mirrord-session=%E0%A4%A" },
    expected: null,
  },
  { name: "baggage with an empty value", headers: { baggage: "mirrord-session=" }, expected: null },
  { name: "baggage with no equals sign", headers: { baggage: "mirrord-session" }, expected: null },
  {
    name: "an entry name that merely contains the name is not matched",
    headers: { baggage: "not-mirrord-session=k" },
    expected: null,
  },
  {
    name: "an entry name that extends the name is not matched",
    headers: { baggage: "mirrord-session-extra=k" },
    expected: null,
  },
  {
    name: "a value that merely contains the key is its own key",
    headers: { baggage: "mirrord-session=maple-test2" },
    expected: { key: "maple-test2", source: "baggage" },
  },
  {
    name: "the header beats baggage when they disagree",
    headers: { "mirrord-key": "maple-test", baggage: "mirrord-session=maple-test2" },
    expected: { key: "maple-test", source: "header" },
  },
  {
    name: "env alone",
    env: { MAPLE_PREVIEW_KEY: "from-env" },
    expected: { key: "from-env", source: "env" },
  },
  {
    name: "env beats the header: the pod belongs to one session",
    env: { MAPLE_PREVIEW_KEY: "from-env" },
    headers: { "mirrord-key": "from-header" },
    expected: { key: "from-env", source: "env" },
  },
  { name: "a blank env key is no key", env: { MAPLE_PREVIEW_KEY: "  " }, expected: null },
  {
    name: "env commit and pull request ride with the env key",
    env: { MAPLE_PREVIEW_KEY: "k", MAPLE_COMMIT: "ABC1234", MAPLE_PULL_REQUEST: "42" },
    expected: { key: "k", commit: "abc1234", pullRequest: 42 },
  },
  {
    name: "env commit and pull request describe a keyless pod's header session",
    env: { MAPLE_COMMIT: "abc1234", MAPLE_PULL_REQUEST: "42" },
    headers: { "mirrord-key": "k" },
    expected: { key: "k", source: "header", commit: "abc1234", pullRequest: 42 },
  },
  {
    name: "env commit alone is no identity",
    env: { MAPLE_COMMIT: "abc1234" },
    expected: null,
  },
  {
    name: "a malformed commit and pull request are dropped",
    env: { MAPLE_PREVIEW_KEY: "k", MAPLE_COMMIT: "not-a-sha", MAPLE_PULL_REQUEST: "0042" },
    expected: { key: "k" },
  },
  ...pullRequestRows(),
  ...branchRows(),
];

function pullRequestRows(): readonly Row[] {
  const refs: readonly (readonly [string, string])[] = [
    ["a merge ref", "refs/pull/42/merge"],
    ["a head ref", "refs/pull/42/head"],
    ["a padded ref", " refs/pull/42/merge "],
  ];
  const ignored: readonly (readonly [string, string])[] = [
    ["a ref with no number", "refs/pull/x/merge"],
    ["a ref with a zero number", "refs/pull/0/merge"],
    ["a ref with a trailing part", "refs/pull/42/merge/extra"],
    ["a tag ref", "refs/tags/v1"],
    ["a bare number, which is not a ref", "42"],
    ["an empty string", ""],
  ];
  return [
    {
      name: "MAPLE_PULL_REQUEST as a bare number",
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_PULL_REQUEST: "42" },
      expected: { key: "k", pullRequest: 42 },
    },
    {
      name: "MAPLE_PULL_REQUEST is a bare number only, not a ref",
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_PULL_REQUEST: "refs/pull/42/merge" },
      expected: { key: "k" },
    },
    {
      name: "a bare MAPLE_PULL_REQUEST beats MAPLE_REF",
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_PULL_REQUEST: "7", MAPLE_REF: "refs/pull/42/merge" },
      expected: { key: "k", pullRequest: 7 },
    },
    ...refs.map(([name, value]): Row => ({
      name: `MAPLE_REF as ${name} gives the pull request`,
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_REF: value },
      expected: { key: "k", pullRequest: 42 },
    })),
    ...ignored.map(([name, value]): Row => ({
      name: `MAPLE_REF as ${name} is no pull request`,
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_REF: value },
      expected: { key: "k" },
    })),
  ];
}

function branchRows(): readonly Row[] {
  return [
    {
      name: "MAPLE_BRANCH is the exact head branch",
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_BRANCH: "feat/Login" },
      expected: { key: "k", branch: "feat/Login" },
    },
    {
      name: "MAPLE_BRANCH rides with a header session of a keyless pod",
      env: { MAPLE_BRANCH: "feat/login" },
      headers: { "mirrord-key": "k" },
      expected: { key: "k", branch: "feat/login" },
    },
    {
      name: "an empty MAPLE_BRANCH is unset",
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_BRANCH: "" },
      expected: { key: "k" },
    },
    {
      name: "MAPLE_REF as refs/heads gives the branch, slashes kept",
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_REF: "refs/heads/feat/sandbox-check" },
      expected: { key: "k", branch: "feat/sandbox-check" },
    },
    {
      name: "MAPLE_BRANCH beats MAPLE_REF",
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_BRANCH: "a", MAPLE_REF: "refs/heads/b" },
      expected: { key: "k", branch: "a" },
    },
    {
      name: "observed on push: ref is a branch and the head ref is empty",
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_REF: "refs/heads/feat/sandbox-check", MAPLE_BRANCH: "" },
      expected: { key: "k", branch: "feat/sandbox-check" },
    },
    {
      name: "observed on pull_request: merge ref and head branch",
      env: {
        MAPLE_PREVIEW_KEY: "k",
        MAPLE_REF: "refs/pull/1/merge",
        MAPLE_BRANCH: "feat/sandbox-check",
      },
      expected: { key: "k", pullRequest: 1, branch: "feat/sandbox-check" },
    },
    {
      name: "MAPLE_REF as a pull request is no branch",
      env: { MAPLE_PREVIEW_KEY: "k", MAPLE_REF: "refs/pull/1/merge" },
      expected: { key: "k", pullRequest: 1 },
    },
  ];
}

describe("mirrord identify", () => {
  it.each(ROWS)("$name", async (row) => {
    const found = await identify(row);

    if (row.expected === null) {
      expect(found).toBeNull();
      return;
    }
    expect(found).toMatchObject(row.expected);
    if (row.expected.commit === undefined) expect(found).not.toHaveProperty("commit");
    if (row.expected.pullRequest === undefined) expect(found).not.toHaveProperty("pullRequest");
    if (row.expected.branch === undefined) expect(found).not.toHaveProperty("branch");
  });

  it("reads env once, when it is built", async () => {
    const env: Env = { MAPLE_PREVIEW_KEY: "first" };
    const preview = mirrord({ env });
    env["MAPLE_PREVIEW_KEY"] = "second";

    expect((await preview.identify({ headers: {}, url: URL }))?.key).toBe("first");
  });

  it("never throws on odd headers", async () => {
    const preview = mirrord();
    for (const baggage of [",,,", "=", "=x", ";;;", "%", "mirrord-session=;"]) {
      await expect(preview.identify({ headers: { baggage }, url: URL })).resolves.toBeNull();
    }
  });

  it("reads the branch and pull request from custom env names", async () => {
    const custom = mirrord({
      env: { K: "k", PR: "9", BR: "feat/x", RF: "refs/pull/3/merge" },
      envNames: { key: "K", pullRequest: "PR", branch: "BR", ref: "RF" },
    });
    expect(await custom.identify({ headers: {}, url: URL })).toMatchObject({
      pullRequest: 9,
      branch: "feat/x",
    });
  });

  it("says whether the env key was there", () => {
    expect(mirrord({ env: { MAPLE_PREVIEW_KEY: "k" } }).envKey).toEqual({
      name: "MAPLE_PREVIEW_KEY",
      set: true,
    });
    expect(mirrord().envKey).toEqual({ name: "MAPLE_PREVIEW_KEY", set: false });
  });

  it("honours custom names and can switch a signal off", async () => {
    const custom = mirrord({
      env: { PREVIEW: "custom" },
      envNames: { key: "PREVIEW" },
    });
    expect((await custom.identify({ headers: {}, url: URL }))?.key).toBe("custom");

    const quiet = mirrord({ header: false, baggage: false });
    const request = { headers: { "mirrord-key": "k", baggage: "mirrord-session=k" }, url: URL };
    expect(await quiet.identify(request)).toBeNull();

    const renamed = mirrord({ header: "x-preview", baggage: "session" });
    expect((await renamed.identify({ headers: { "x-preview": "a" }, url: URL }))?.key).toBe("a");
    expect((await renamed.identify({ headers: { baggage: "session=b" }, url: URL }))?.key).toBe(
      "b",
    );
  });
});

describe("mirrord matches", () => {
  const identity = (key: string): PreviewIdentity => ({ key, source: "header" });

  it.each([
    { head: "feat/Login-Form", key: "feat-login-form", expected: true },
    { head: "PR_123/Foo.Bar", key: "pr-123-foo-bar", expected: true },
    { head: "feat/login-form-2", key: "feat-login-form", expected: false },
    { head: "other", key: "feat-login-form", expected: false },
  ])("$head against $key is $expected", ({ head, key, expected }) => {
    expect(mirrord().matches?.(head, identity(key))).toBe(expected);
  });
});

describe("mirrord({ matches })", () => {
  const ticket = (head: string, identity: PreviewIdentity): boolean =>
    head.toLowerCase().startsWith(`${identity.key.toLowerCase()}-`);
  const identity: PreviewIdentity = { key: "ENG-884", source: "env" };

  it("replaces the slug comparison for a key that is not a branch name", () => {
    const preview = mirrord({ matches: ticket });
    expect(preview.matches?.("eng-884-remove-flag", identity)).toBe(true);
    expect(preview.matches?.("eng-8840-other", identity)).toBe(false);
    expect(mirrord().matches?.("eng-884-remove-flag", identity)).toBe(false);
  });
});
