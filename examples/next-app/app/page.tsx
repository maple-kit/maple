import { headers } from "next/headers";

import { serverFlag } from "../server/flags";
import { Counter } from "./counter";
import { Projects } from "./projects";

type Search = Promise<Record<string, string | string[] | undefined>>;

/** The request as Maple Mock reads it: the page's own query, and its cookies. */
async function pageRequest(searchParams: Search) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) {
    for (const one of [value ?? []].flat()) query.append(name, one);
  }
  return { url: `/?${query.toString()}`, headers: await headers() };
}

export default async function Page({ searchParams }: { readonly searchParams: Search }) {
  // Evaluated on the server, so it is in the HTML before any script runs.
  const launchWeek = await serverFlag("launch-week", false, () => pageRequest(searchParams));

  return (
    <main>
      <h1>Maple example</h1>
      <p>This paragraph is tagged on a preview build and on no other.</p>
      {launchWeek && (
        <p className="launch" data-testid="launch">
          Launch week: every project ships a preview.
        </p>
      )}
      <Projects />
      <Counter />
    </main>
  );
}
