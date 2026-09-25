import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createShapeIndex, readSchemaDocument } from "@maple-kit/core/mock";
import { describe, expect, it } from "vitest";

import { MOCK_SCHEMA_USAGE } from "../src/commands/mock-schema.js";
import { run } from "../src/run.js";

const ROUTER = join(import.meta.dirname, "fixtures", "router.ts");

describe("maple mock schema, over the real generator", () => {
  it("writes a stamped document the route reads as router shapes, dates as date-time", async () => {
    const directory = await mkdtemp(join(tmpdir(), "maple-schema-"));
    const out = join(directory, "nested", "schema.json");
    try {
      const result = await run(["mock", "schema", ROUTER, `--out=${out}`, "--superjson"], {
        version: "0",
      });
      expect(result).toEqual({ output: `Wrote 2 procedures to ${out}`, exitCode: 0 });

      const document = JSON.parse(await readFile(out, "utf8")) as unknown;
      const index = createShapeIndex([readSchemaDocument(document)]);
      const list = index.find("trpc:project.list");

      expect(list).toMatchObject({ source: "router", superjson: true });
      const text = JSON.stringify(list?.schema);
      expect(text).toContain('"format":"date-time"');
      expect(text).toContain('"paused"');
      expect(index.find("trpc:project.create")).toBeDefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("maple mock schema's edges", () => {
  const options = (generate: () => Promise<unknown>) => ({ version: "0", generate });

  it.each([[["mock"]], [["mock", "schema"]], [["mock", "other", "x.ts"]]])(
    "prints its usage for %j",
    async (argv) => {
      expect(
        await run(
          argv,
          options(() => Promise.resolve({})),
        ),
      ).toEqual({
        output: MOCK_SCHEMA_USAGE,
        exitCode: 1,
      });
    },
  );

  it("prints the document when there is nowhere to write it, under the export asked for", async () => {
    const asked: unknown[] = [];
    const result = await run(
      ["mock", "schema", "router.ts", "--export=ApiRouter"],
      options((...args: unknown[]) => {
        asked.push(args[1]);
        return Promise.resolve({ openapi: "3.1.0", paths: {} });
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      openapi: "3.1.0",
      paths: {},
      "x-maple-mock": { codec: "trpc", source: "router" },
    });
    expect(asked).toEqual([{ exportName: "ApiRouter", title: "ApiRouter", version: "0" }]);
  });

  it("says what failed when the router cannot be read", async () => {
    const result = await run(
      ["mock", "schema", "missing.ts"],
      options(() => Promise.reject(new Error("no such file"))),
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Could not read AppRouter from missing.ts");
    expect(result.output).toContain("no such file");
  });
});
