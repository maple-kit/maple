import { describe, expect, it } from "vitest";

import { findTool, TOOL_NAMES, TOOLS } from "../src/tools.js";

describe("the advertised tool list", () => {
  it("advertises exactly the declared names", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
  });

  it("uses no duplicate names", () => {
    expect(new Set(TOOLS.map((tool) => tool.name)).size).toBe(TOOLS.length);
  });

  it("gives every tool a title and a description", () => {
    for (const tool of TOOLS) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("marks only resolve_comment as writing", () => {
    const writers = TOOLS.filter((tool) => !tool.readOnly).map((tool) => tool.name);

    expect(writers).toEqual(["resolve_comment"]);
  });

  it("says in wait_for_comments' description that a timeout is not a failure", () => {
    expect(findTool("wait_for_comments")?.description).toMatch(/timeout.*rather than failing/s);
  });
});

describe("findTool", () => {
  it("finds a tool by name", () => {
    expect(findTool("list_comments")?.name).toBe("list_comments");
  });

  it("returns undefined for a name it does not know", () => {
    expect(findTool("drop_database")).toBeUndefined();
  });
});
