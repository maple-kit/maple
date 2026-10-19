/**
 * A fake of Maple's `POST {base}/mock/recipes`, recording what the page sent.
 * It answers an id by default, and `answerNext` answers the next with a status.
 */

import { http, HttpResponse } from "msw";

import type { RequestHandler } from "msw";

export const RECIPES_URL = "https://preview.example.com/api/maple/mock/recipes";
export const STORED_ID = "k3v9x0q7m2n5b8c1d4f6g";

export interface RecipesFake {
  readonly handlers: RequestHandler[];
  readonly stored: unknown[];
  answerNext(status: number): void;
  failNext(): void;
  reset(): void;
}

export function createRecipesFake(): RecipesFake {
  const stored: unknown[] = [];
  let status: number | undefined;
  let fail = false;

  const handlers = [
    http.post(RECIPES_URL, async ({ request }) => {
      if (fail) {
        fail = false;
        return HttpResponse.error();
      }
      if (status !== undefined) {
        const answer = status;
        status = undefined;
        return HttpResponse.json({ error: "refused" }, { status: answer });
      }
      stored.push(await request.json());
      return HttpResponse.json({ id: STORED_ID });
    }),
  ];

  return {
    handlers,
    stored,
    answerNext: (next) => {
      status = next;
    },
    failNext: () => {
      fail = true;
    },
    reset: () => {
      stored.length = 0;
      status = undefined;
      fail = false;
    },
  };
}
