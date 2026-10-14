import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  looksLikePreview,
  patchConfig,
  PRESET_ENV,
  setupPreviewMirrord,
} from "../src/commands/setup-preview.js";
import { run } from "../src/run.js";

const ENV = { ...PRESET_ENV };

interface Row {
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly expected: Record<string, unknown>;
  readonly warnings?: readonly string[];
}

const ROWS: readonly Row[] = [
  {
    name: "an empty config gets steal and the three variables",
    input: {},
    expected: {
      feature: { network: { incoming: { mode: "steal" } }, env: { override: ENV } },
    },
  },
  {
    name: "no mode: steal is added beside an existing filter",
    input: { feature: { network: { incoming: { http_filter: { header_filter: "x-a: b" } } } } },
    expected: {
      feature: {
        network: { incoming: { http_filter: { header_filter: "x-a: b" }, mode: "steal" } },
        env: { override: ENV },
      },
    },
  },
  {
    name: "mirror is warned about and kept",
    input: { feature: { network: { incoming: { mode: "mirror" } } } },
    expected: { feature: { network: { incoming: { mode: "mirror" } }, env: { override: ENV } } },
    warnings: ['feature.network.incoming.mode is "mirror"'],
  },
  {
    name: "a string incoming mode is read as the mode",
    input: { feature: { network: { incoming: "mirror" } } },
    expected: { feature: { network: { incoming: "mirror" }, env: { override: ENV } } },
    warnings: ['feature.network.incoming.mode is "mirror"'],
  },
  {
    name: "steal is left as it is",
    input: { feature: { network: { incoming: { mode: "steal" } } } },
    expected: { feature: { network: { incoming: { mode: "steal" } }, env: { override: ENV } } },
  },
  {
    name: "an existing override keeps its own values and gains the missing ones",
    input: {
      feature: {
        network: { incoming: "steal" },
        env: { exclude: "SECRET", override: { MAPLE_PREVIEW_KEY: "fixed", OTHER: "1" } },
      },
    },
    expected: {
      feature: {
        network: { incoming: "steal" },
        env: {
          exclude: "SECRET",
          override: { ...ENV, MAPLE_PREVIEW_KEY: "fixed", OTHER: "1" },
        },
      },
    },
  },
  {
    name: "unrelated top-level keys survive",
    input: { target: "deployment/web", feature: { fs: "read" } },
    expected: {
      target: "deployment/web",
      feature: {
        fs: "read",
        network: { incoming: { mode: "steal" } },
        env: { override: ENV },
      },
    },
  },
  {
    name: "a non-object env is warned about and not replaced",
    input: { feature: { network: { incoming: "steal" }, env: true } },
    expected: { feature: { network: { incoming: "steal" }, env: true } },
    warnings: ["feature.env is not an object"],
  },
];

describe("patchConfig", () => {
  it.each(ROWS)("$name", ({ input, expected, warnings = [] }) => {
    const patch = patchConfig(input);

    expect(patch.config).toEqual(expected);
    expect(patch.warnings).toHaveLength(warnings.length);
    warnings.forEach((text, index) => expect(patch.warnings[index]).toContain(text));
  });

  it.each(ROWS)("is idempotent: $name", ({ input }) => {
    const once = patchConfig(input);
    const twice = patchConfig(once.config);

    expect(twice.changes).toEqual([]);
    expect(twice.config).toEqual(once.config);
  });

  it("does not mutate its input", () => {
    const input = { feature: {} };
    patchConfig(input);

    expect(input).toEqual({ feature: {} });
  });
});

describe("the written values", () => {
  it("template the key and GitHub's variables, in single quotes, with no placeholder", () => {
    expect(ENV).toEqual({
      MAPLE_PREVIEW_KEY: "{{ key }}",
      MAPLE_PULL_REQUEST: "{{ get_env(name='MAPLE_PULL_REQUEST', default='') }}",
      MAPLE_BRANCH:
        "{{ get_env(name='MAPLE_BRANCH', default=get_env(name='GITHUB_HEAD_REF', default='')) }}",
      MAPLE_REF: "{{ get_env(name='MAPLE_REF', default=get_env(name='GITHUB_REF', default='')) }}",
      MAPLE_COMMIT: "{{ get_env(name='MAPLE_COMMIT', default='') }}",
    });
    for (const value of Object.values(ENV)) {
      expect(value).not.toContain("@@");
      expect(value).not.toContain('\\"');
    }
  });
});

describe("looksLikePreview", () => {
  it.each([
    { name: "a top-level key", config: { key: "k" }, expected: true },
    {
      name: "a preview file name, with no key",
      config: { target: "d/x" },
      path: "p/Preview.JSON",
      expected: true,
    },
    {
      name: "a name that only contains preview",
      config: {},
      path: "p/web-preview-2.json",
      expected: true,
    },
    { name: "a feature.preview section", config: { feature: { preview: {} } }, expected: true },
    {
      name: "this command's own override",
      config: { feature: { env: { override: { MAPLE_PREVIEW_KEY: "x" } } } },
      expected: true,
    },
    {
      name: "a local-dev config",
      config: { target: "d/x", feature: { fs: "read" } },
      expected: false,
    },
    {
      name: "a top-level preview, which mirrord rejects",
      config: { preview: {} },
      expected: false,
    },
    { name: "a non-string key", config: { key: 1 }, expected: false },
  ])("$name: $expected", ({ config, expected, path }) => {
    expect(looksLikePreview(config, path ?? ".mirrord/mirrord.json")).toBe(expected);
  });
});

describe("maple setup preview mirrord", () => {
  let cwd: string;
  const file = (name: string) => join(cwd, ".mirrord", name);
  const preview = (flags: string[] = []) =>
    run(["setup", "preview", "mirrord", ...flags], { version: "0", cwd });
  const seed = (name: string, text: string) => {
    mkdirSync(join(cwd, ".mirrord"), { recursive: true });
    writeFileSync(file(name), text);
  };

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "maple-preview-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("prints what would change and touches nothing without --write", async () => {
    seed("preview.json", '{"key":"k","target":"deployment/web"}\n');

    const result = await preview();

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(".mirrord/preview.json: would update");
    expect(result.output).toContain('feature.network.incoming.mode = "steal"');
    expect(result.output).toContain('mirrord preview start -k "$KEY" -f .mirrord/preview.json');
    expect(result.output).toContain("nothing else is needed");
    expect(result.output).toContain("export MAPLE_PULL_REQUEST (a number) or MAPLE_BRANCH");
    expect(result.output).toContain("mirrord({ env: process.env })");
    expect(result.output).not.toMatch(/sed|@@/);
    expect(readFileSync(file("preview.json"), "utf8")).toBe(
      '{"key":"k","target":"deployment/web"}\n',
    );
  });

  it("edits each preview config with --write, keeping the file's indentation", async () => {
    seed("a.json", '{\n    "key": "a",\n    "target": "deployment/web"\n}\n');
    seed("b.json", '{"feature":{"preview":{}}}');
    seed("notes.txt", "not a config");

    const result = await preview(["--write"]);
    const a = readFileSync(file("a.json"), "utf8");

    expect(result.output).toContain(".mirrord/a.json: updated");
    expect(a.startsWith('{\n    "key": "a",\n    "target": "deployment/web",\n    "feature"')).toBe(
      true,
    );
    expect(JSON.parse(readFileSync(file("b.json"), "utf8"))).toMatchObject({
      feature: { env: { override: ENV } },
    });
    expect(readFileSync(file("notes.txt"), "utf8")).toBe("not a config");
  });

  it("changes nothing the second time", async () => {
    seed("mirrord.json", '{"key":"k"}');
    await preview(["--write"]);
    const first = readFileSync(file("mirrord.json"), "utf8");

    const result = await preview(["--write"]);

    expect(result.output).toContain(".mirrord/mirrord.json: already set up.");
    expect(readFileSync(file("mirrord.json"), "utf8")).toBe(first);
  });

  it("creates .mirrord/preview.json when there is no config", async () => {
    const result = await preview(["--write"]);

    expect(result.output).toContain(".mirrord/preview.json: created");
    expect(JSON.parse(readFileSync(file("preview.json"), "utf8"))).toMatchObject({
      feature: { network: { incoming: { mode: "steal" } } },
    });
  });

  it("warns on mirror mode and leaves it", async () => {
    seed("mirrord.json", '{"key":"k","feature":{"network":{"incoming":{"mode":"mirror"}}}}');

    const result = await preview(["--write"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('warning: feature.network.incoming.mode is "mirror"');
    expect(JSON.parse(readFileSync(file("mirrord.json"), "utf8"))).toMatchObject({
      feature: { network: { incoming: { mode: "mirror" } } },
    });
  });

  it("refuses a config with comments, untouched, and exits 1", async () => {
    const text = '{\n  // which pod\n  "key": "k"\n}\n';
    seed("mirrord.json", text);

    const result = await preview(["--write"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("edit it by hand");
    expect(readFileSync(file("mirrord.json"), "utf8")).toBe(text);
  });

  it("edits only the file --config names", async () => {
    seed("a.json", "{}");
    seed("b.json", "{}");

    await preview(["--write", "--config", ".mirrord/b.json"]);

    expect(readFileSync(file("a.json"), "utf8")).toBe("{}");
    expect(readFileSync(file("b.json"), "utf8")).toContain("MAPLE_PREVIEW_KEY");
  });

  it("patches only preview configs, and lists the ones it skipped", async () => {
    const local = '{"target":"deployment/web"}';
    seed("mirrord.json", local);
    seed("preview.json", '{"key":"k"}');

    const result = await preview(["--write"]);

    expect(readFileSync(file("mirrord.json"), "utf8")).toBe(local);
    expect(readFileSync(file("preview.json"), "utf8")).toContain("MAPLE_PREVIEW_KEY");
    expect(result.output).toContain("Skipped, not a preview config: .mirrord/mirrord.json.");
    expect(result.output).toContain("-f .mirrord/preview.json");
  });

  it("patches a target-only preview.json whose key is passed with -k", async () => {
    seed("preview.json", '{"target":"deployment/web"}');

    const result = await preview(["--write"]);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(file("preview.json"), "utf8")).toContain("MAPLE_PREVIEW_KEY");
  });

  it("says so, and suggests --config, when no config is a preview config", async () => {
    seed("mirrord.json", '{"target":"deployment/web"}');

    const result = await preview(["--write"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("No preview config found");
    expect(result.output).toContain("--config");
    expect(readFileSync(file("mirrord.json"), "utf8")).toBe('{"target":"deployment/web"}');
  });

  it("edits a config --config names even when it does not look like a preview config", async () => {
    seed("mirrord.json", "{}");

    await preview(["--write", "--config", ".mirrord/mirrord.json"]);

    expect(readFileSync(file("mirrord.json"), "utf8")).toContain("MAPLE_PREVIEW_KEY");
  });

  describe("with mirrord on PATH", () => {
    /** A stand-in `mirrord` that records its arguments and answers with `stdout`. */
    function fakeMirrord(stdout: string, status = 0): NodeJS.ProcessEnv {
      const bin = join(cwd, "bin");
      mkdirSync(bin, { recursive: true });
      const script = `#!/bin/sh\necho "$@" > "${join(cwd, "args.txt")}"\ncat <<'EOF'\n${stdout}\nEOF\nexit ${String(status)}\n`;
      writeFileSync(join(bin, "mirrord"), script);
      chmodSync(join(bin, "mirrord"), 0o755);
      return { PATH: `${bin}:/usr/bin:/bin` };
    }
    const write = (env: NodeJS.ProcessEnv) =>
      setupPreviewMirrord({ write: true, config: ".mirrord/preview.json" }, { cwd, env });

    it("verifies the written config with --resolved", () => {
      seed("preview.json", '{"key":"k"}');

      const result = write(fakeMirrord('{"type":"Success"}'));

      expect(result.exitCode).toBe(0);
      expect(readFileSync(join(cwd, "args.txt"), "utf8").trim()).toBe(
        `verify-config --resolved ${file("preview.json")}`,
      );
    });

    describe.each([
      ["no key", '{"target":"deployment/web"}'],
      ["a key that is itself a template", '{"key":"{{ key }}"}'],
    ])("a config with %s", (_name, config) => {
      it("is verified as a temp copy with a literal key, removed afterwards", () => {
        seed("preview.json", config);
        const bin = join(cwd, "bin");
        mkdirSync(bin, { recursive: true });
        const script = `#!/bin/sh\nfor last; do :; done\necho "$last" > "${join(cwd, "path.txt")}"\ncp "$last" "${join(cwd, "seen.json")}"\necho '{"type":"Success"}'\n`;
        writeFileSync(join(bin, "mirrord"), script);
        chmodSync(join(bin, "mirrord"), 0o755);

        const result = write({ PATH: `${bin}:/usr/bin:/bin` });

        const seen = JSON.parse(readFileSync(join(cwd, "seen.json"), "utf8")) as Record<
          string,
          unknown
        >;
        const checked = readFileSync(join(cwd, "path.txt"), "utf8").trim();
        expect(result.exitCode).toBe(0);
        expect(seen["key"]).toBe("maple-verify");
        expect(checked).not.toBe(file("preview.json"));
        expect(existsSync(checked)).toBe(false);
        expect(readFileSync(file("preview.json"), "utf8")).not.toContain("maple-verify");
      });
    });

    it("reports a failure and exits 1, keeping the written file", () => {
      seed("preview.json", '{"key":"k"}');

      const result = write(fakeMirrord('{"type":"Fail","errors":["Variable `key` not found"]}'));

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(".mirrord/preview.json: mirrord verify-config failed.");
      expect(result.output).toContain("Variable `key` not found");
      expect(readFileSync(file("preview.json"), "utf8")).toContain("MAPLE_PREVIEW_KEY");
    });

    it("does not verify without --write", () => {
      seed("preview.json", '{"key":"k"}');
      const env = fakeMirrord('{"type":"Fail","errors":["no"]}');

      const result = setupPreviewMirrord({ config: ".mirrord/preview.json" }, { cwd, env });

      expect(result.exitCode).toBe(0);
    });

    it("finds mirrord.exe through PATHEXT on Windows", () => {
      seed("preview.json", '{"key":"k"}');
      const bin = join(cwd, "bin");
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(bin, "mirrord.exe"),
        `#!/bin/sh\necho "$@" > "${join(cwd, "args.txt")}"\necho '{"type":"Success"}'\n`,
      );
      chmodSync(join(bin, "mirrord.exe"), 0o755);
      writeFileSync(join(bin, "mirrord"), "not a windows executable");
      chmodSync(join(bin, "mirrord"), 0o755);
      const platform = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", { value: "win32" });
      try {
        const result = write({ PATH: bin, PATHEXT: ".COM;.EXE" });
        expect(result.exitCode).toBe(0);
        expect(result.output).not.toContain("verify-config failed");
        expect(readFileSync(join(cwd, "args.txt"), "utf8")).toContain("verify-config");
      } finally {
        if (platform) Object.defineProperty(process, "platform", platform);
      }
    });

    it("skips silently when mirrord is not installed", () => {
      seed("preview.json", '{"key":"k"}');

      const result = write({ PATH: join(cwd, "empty") });

      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain("verify-config");
    });
  });

  it("prints usage for an unknown preset", async () => {
    const result = await run(["setup", "preview", "other"], { version: "0", cwd });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("maple setup preview mirrord");
  });
});
