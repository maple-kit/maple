import { describe, expect, it } from "vitest";

import {
  assertUsable,
  capabilitiesOf,
  MissingCapabilityError,
  missingRequirements,
  supports,
} from "../src/connectors/capabilities.js";
import { memoryStore } from "../src/testing/memory-store.js";

import type {
  AnyConnector,
  ClassifierConnector,
  RuleConnector,
  StoreConnector,
} from "../src/connectors/types.js";

describe("the rules kind", () => {
  const judge: RuleConnector = { name: "judge", rules: [], evaluate: () => Promise.resolve([]) };

  it("requires evaluate, and nothing else", () => {
    expect(() => assertUsable("rules", judge)).not.toThrow();
    expect(capabilitiesOf("rules", judge)).toEqual({ evaluate: true });
  });

  it("refuses a connector with a rules list and no evaluate", () => {
    const inert = { name: "inert", rules: [] } as unknown as RuleConnector;

    expect(missingRequirements("rules", inert)).toEqual(["evaluate"]);
    expect(() => assertUsable("rules", inert)).toThrow(MissingCapabilityError);
  });
});

describe("capability detection", () => {
  it("reports every method of the kind", () => {
    expect(capabilitiesOf("store", memoryStore())).toEqual({
      list: true,
      append: true,
      appendMany: true,
      setStatus: true,
      head: false,
      watch: false,
      approvals: true,
      approve: true,
      unapprove: true,
    });
  });

  it("reports an omitted optional method as absent", () => {
    expect(capabilitiesOf("store", memoryStore({ appendOnly: true })).setStatus).toBe(false);
  });

  it("treats a non-function property as not implemented", () => {
    const impostor = { name: "impostor", list: true, append: true } as unknown as AnyConnector;

    expect(supports(impostor, "list")).toBe(false);
  });

  it("lists nothing missing for a usable connector", () => {
    expect(missingRequirements("store", memoryStore())).toEqual([]);
  });

  it("names every missing required method", () => {
    const partial = { name: "partial", list: () => Promise.resolve({ comments: [] }) };

    expect(missingRequirements("store", partial as unknown as StoreConnector)).toEqual(["append"]);
  });
});

describe("assertUsable", () => {
  it("accepts a connector that meets its kind's requirements", () => {
    expect(() => assertUsable("store", memoryStore())).not.toThrow();
  });

  it("throws MissingCapabilityError naming the connector and the gap", () => {
    const partial = { name: "partial" } as unknown as StoreConnector;

    expect(() => assertUsable("store", partial)).toThrow(MissingCapabilityError);
    expect(() => assertUsable("store", partial)).toThrow(/partial.*list, append/s);
  });

  it("accepts a classifier that does nothing, because it requires nothing", () => {
    const inert = { name: "inert", pillars: [] } as ClassifierConnector;

    expect(() => assertUsable("classifier", inert)).not.toThrow();
    expect(capabilitiesOf("classifier", inert)).toEqual({
      classify: false,
      plan: false,
      score: false,
    });
  });
});
