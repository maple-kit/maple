import { describe, expect, it } from "vitest";

import { DEFAULT_PILLARS, UnknownPillarError } from "../src/connectors/classifier.js";
import { keywordClassifier } from "../src/connectors/keyword.js";

import type { CommentKind } from "../src/connectors/types.js";

const classifier = keywordClassifier();

/** The level a pillar reached, by pillar id, for one body. */
async function levels(body: string): Promise<Record<string, number>> {
  const scores = await classifier.score?.({ body });
  return Object.fromEntries((scores ?? []).map((score) => [score.pillar, score.level]));
}

async function kindOf(body: string): Promise<CommentKind> {
  return (await classifier.classify?.({ body }))?.kind ?? "other";
}

describe("the keyword baseline's pillars", () => {
  const cases: readonly { body: string; pillar: string; level: number; why: string }[] = [
    {
      body: "this looks broken",
      pillar: "specific",
      level: 0,
      why: "a vague word and nothing named",
    },
    {
      body: "The tooltip label is cut off at 320px",
      pillar: "specific",
      level: 2,
      why: "two nouns and a measurement",
    },
    {
      body: "The footer overlaps the logo",
      pillar: "actionable",
      level: 0,
      why: "a report with no instruction in it",
    },
    {
      body: "Move the badge below the heading",
      pillar: "actionable",
      level: 2,
      why: "an imperative opening plus a place",
    },
    {
      body: "The heading should wrap instead",
      pillar: "actionable",
      level: 2,
      why: "two phrases naming the change",
    },
    {
      body: "Tooltip is truncated",
      pillar: "concise",
      level: 2,
      why: "three words",
    },
    {
      body: `So one thing I noticed while I was clicking around, and I am not sure whether this is
        something we already know about or not, but it seemed worth writing down anyway because it
        might matter later on, is that when you open the panel and then scroll down a long way and
        then come back up again to the place you started from, the thing at the top does not look
        quite the way I remember it looking before, although possibly I am misremembering that`,
      pillar: "concise",
      level: 0,
      why: "eighty words for one observation",
    },
    {
      body: "this is wrong",
      pillar: "standalone",
      level: 0,
      why: "opens on a pronoun and names nothing",
    },
    {
      body: "The sidebar badge sits on the border",
      pillar: "standalone",
      level: 2,
      why: "names two things outright",
    },
    {
      body: "Spacing is tight",
      pillar: "located",
      level: 0,
      why: "nothing says where on the page",
    },
    {
      body: "The icon in the header is off-centre",
      pillar: "located",
      level: 2,
      why: "a place and a prepositional phrase",
    },
  ];

  for (const { body, pillar, level, why } of cases) {
    it(`puts "${body.slice(0, 40).trim()}" at level ${String(level)} on ${pillar} — ${why}`, async () => {
      expect((await levels(body))[pillar]).toBe(level);
    });
  }

  it("scores an empty field at the bottom of every pillar", async () => {
    const scored = await levels("   ");

    expect(Object.values(scored)).toEqual(DEFAULT_PILLARS.map(() => 0));
  });

  it("refuses a pillar it has no measure for", async () => {
    await expect(
      classifier.score?.({ body: "anything", pillars: ["tone"] }),
    ).rejects.toBeInstanceOf(UnknownPillarError);
  });

  it("keeps the level's own probability as the confidence", async () => {
    const scores =
      (await classifier.score?.({ body: "The tooltip label is cut off at 320px" })) ?? [];

    for (const score of scores) expect(score.confidence).toBe(score.distribution[score.level]);
  });
});

describe("the keyword baseline's kinds", () => {
  const cases: readonly { body: string; kind: CommentKind }[] = [
    { body: "The avatar is missing on this row", kind: "bug" },
    { body: "Can we add a filter here?", kind: "request" },
    { body: "Typo in the heading", kind: "copy" },
    { body: "Is the sidebar meant to be sticky", kind: "question" },
    { body: "Love this, the spacing is lovely", kind: "praise" },
    { body: "The sidebar", kind: "other" },
  ];

  for (const { body, kind } of cases) {
    it(`reads "${body}" as ${kind}`, async () => {
      expect(await kindOf(body)).toBe(kind);
    });
  }

  it("leaves every kind some probability, so one keyword is never a certainty", async () => {
    const guess = await classifier.classify?.({ body: "Typo in the heading" });

    expect(Object.values(guess?.distribution ?? {}).every((share) => share > 0)).toBe(true);
    expect(guess?.confidence).toBeLessThan(0.5);
  });
});
