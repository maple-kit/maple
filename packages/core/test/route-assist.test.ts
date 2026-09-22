import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PILLARS } from "../src/connectors/index.js";
import { createMapleHandler } from "../src/route/index.js";
import { createCommentStore } from "../src/store.js";
import { memoryClassifier } from "../src/testing/memory-classifier.js";
import { memoryStore } from "../src/testing/memory-store.js";

import type { ClassifierConnector, IdentityConnector } from "../src/connectors/types.js";
import type { AssistOptions } from "../src/route/index.js";

const BASE = "https://preview.example.com";
const WRITTEN = "The Save button's label is cut off at 320px.";

const reviewer: IdentityConnector = {
  name: "test-identity",
  resolveUser: (incoming) =>
    Promise.resolve({ id: incoming.headers["cookie"] ?? "anonymous", name: "Reviewer" }),
};

function handler(assist?: AssistOptions, identity?: IdentityConnector) {
  return createMapleHandler({
    store: createCommentStore(memoryStore()),
    ...(assist === undefined ? {} : { assist }),
    ...(identity === undefined ? {} : { identity }),
  });
}

function judge(body: unknown, cookie?: string): Request {
  return new Request(`${BASE}/api/maple/assist`, {
    method: "POST",
    body: JSON.stringify(body),
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  });
}

describe("POST /assist", () => {
  it("is not there at all until a classifier is configured", async () => {
    const answer = await handler()(judge({ body: WRITTEN }));
    expect(answer.status).toBe(404);
  });

  it("judges the comment, and says what it judged it against", async () => {
    const classifier = memoryClassifier();
    const answer = await handler({ classifier })(judge({ body: WRITTEN }));

    expect(answer.status).toBe(200);
    const judged = (await answer.json()) as {
      scores: { pillar: string }[];
      kind: { kind: string };
    };
    expect(judged.scores.map((score) => score.pillar)).toEqual(
      DEFAULT_PILLARS.map((pillar) => pillar.id),
    );
    expect(judged.kind.kind).toBe("other");
    expect(classifier.asked()).toEqual([WRITTEN, WRITTEN]);
  });

  it("reports the pillars on /me, so a card has labels before it has scores", async () => {
    const handle = handler({ classifier: memoryClassifier(), pillars: ["concise"] });
    const me = (await (await handle(new Request(`${BASE}/api/maple/me`))).json()) as {
      assist?: { pillars: { id: string }[] };
    };

    expect(me.assist?.pillars.map((pillar) => pillar.id)).toEqual(["concise"]);
  });

  it("says nothing about assist on /me when nothing judges", async () => {
    const me = (await (await handler()(new Request(`${BASE}/api/maple/me`))).json()) as object;
    expect(me).not.toHaveProperty("assist");
  });

  it("answers an empty comment without asking a model", async () => {
    const classifier = memoryClassifier();
    const answer = await handler({ classifier })(judge({ body: "   " }));

    expect(await answer.json()).toEqual({ scores: [], kind: null });
    expect(classifier.asked()).toEqual([]);
  });

  it("refuses a request carrying no comment, and one too long to judge", async () => {
    const handle = handler({ classifier: memoryClassifier() });

    expect((await handle(judge({}))).status).toBe(400);
    expect((await handle(judge({ body: "x".repeat(4001) }))).status).toBe(413);
  });

  it("costs one call for a pause and a retype", async () => {
    const classifier = memoryClassifier({ methods: ["classify"] });
    const handle = handler({ classifier });

    await handle(judge({ body: WRITTEN }));
    await handle(judge({ body: "something else entirely, at length" }));
    await handle(judge({ body: WRITTEN }));

    expect(classifier.asked()).toHaveLength(2);
  });

  it("counts a session's judgements against that session and no other", async () => {
    const classifier = memoryClassifier({ methods: ["classify"] });
    const handle = handler({ classifier, rate: { limit: 2, windowMs: 60_000 } }, reviewer);

    const statuses: number[] = [];
    for (const body of ["one comment here", "two comments here", "three comments here"]) {
      statuses.push((await handle(judge({ body }, "session=a"))).status);
    }
    expect(statuses).toEqual([200, 200, 429]);
    expect((await handle(judge({ body: "four comments here" }, "session=b"))).status).toBe(200);
  });

  it("opens the window again once it has passed", async () => {
    vi.useFakeTimers();
    try {
      const handle = handler({
        classifier: memoryClassifier({ methods: ["classify"] }),
        rate: { limit: 1, windowMs: 1000 },
      });

      expect((await handle(judge({ body: "the first comment" }))).status).toBe(200);
      expect((await handle(judge({ body: "the second comment" }))).status).toBe(429);
      vi.advanceTimersByTime(1001);
      expect((await handle(judge({ body: "the third comment" }))).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a provider that failed without saying what it said", async () => {
    const broken: ClassifierConnector = {
      name: "broken",
      pillars: DEFAULT_PILLARS,
      classify: () => Promise.reject(new Error("api key sk-live-xyz is invalid")),
    };
    const answer = await handler({ classifier: broken })(judge({ body: WRITTEN }));

    expect(answer.status).toBe(502);
    expect(JSON.stringify(await answer.json())).not.toContain("sk-live");
  });

  it("refuses anything but a POST", async () => {
    const handle = handler({ classifier: memoryClassifier() });
    const answer = await handle(new Request(`${BASE}/api/maple/assist`));

    expect(answer.status).toBe(405);
  });

  it("judges only the pillars a deployment narrowed to", async () => {
    const handle = handler({ classifier: memoryClassifier(), pillars: ["concise", "located"] });
    const judged = (await (await handle(judge({ body: WRITTEN }))).json()) as {
      scores: { pillar: string }[];
    };

    expect(judged.scores.map((score) => score.pillar)).toEqual(["concise", "located"]);
  });
});
