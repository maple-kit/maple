# Status

**US1 is most of the way there.** Every mechanism a comment passes through
exists and is tested: it can be anchored, written, exported, stored on a pull
request, and read and resolved by an agent. What is missing is the interface a
reviewer touches.

The loop is buildable end to end today by a caller that supplies its own UI.
It is not yet demonstrable to a person, and that is the honest gap.

## The path a comment takes, and what is built

| Step                            | Where                                     | State                                          |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Element is tagged at build time | `core/tagger`, `core/vite`, `core/loader` | ✅ both emitters, asserted by two example apps |
| Reviewer picks a target         | `core/overlay`                            | ✅ element, region and text picking            |
| The pick becomes an anchor      | `core/anchor`                             | ✅ five rungs, four orphan reasons             |
| The page's shape is recorded    | `core/overlay`                            | ✅ badge, regions, breakpoint                  |
| A screenshot is attached        | `core/screenshot`                         | ✅ paste, drop, file, capture                  |
| The reviewer writes it          | —                                         | ❌ **no composer, no sidebar, no pins**        |
| It is posted as them            | `core/auth`                               | 🟡 Device Flow works; not wired to the route   |
| It is stored                    | `core/connectors/github`                  | ✅ default store, contract-clean               |
| It reaches the pull request     | `core/export`                             | ✅ table over a visible fence                  |
| An agent reads and resolves it  | `@maple-kit/mcp`                          | ✅ four tools, plus the Stop hook              |

## What US1 added

### `@maple-kit/core`

Nine new entrypoints on top of Phase 0's four.

- **`/tagger`, `/vite`, `/loader`** — the build-time JSX tagger and its two
  emitters. One Babel plugin behind both, so they cannot drift. Not an SWC
  plugin: that is a Rust crate compiled to WebAssembly, for a transform that
  already exists in TypeScript.
- **`/anchor`** — the cascade, `data-maple-key` → source → component → quote →
  selector, with four orphan reasons and no silent ancestor snap. The fuzzy
  quote matcher is ported from Hypothesis; the approximate search under it is
  Sellers with Ukkonen's cutoff rather than a port of Myers' bit-parallel
  algorithm, because it can be checked against a brute-force reference, and 400
  seeded cases do that on every run.
- **`/overlay`** — the host (shadow root, adopted stylesheets only), the three
  pickers, the context badge and the per-branch draft store.
- **`/export`** — the human table over a visible ` ```maple ` fence, with a
  byte budget that sheds detail in a fixed order and never drops a comment.
- **`/route`** — one web-standard handler, plus a Node adapter. The author of a
  comment comes from the identity connector and never from the request body.
- **`/auth`** — GitHub Device Flow, including `slow_down` back-off.
- **`/screenshot`** — paste and drop first, capture second.
- **`/connectors`** — `githubStore`, the default store, passing the shared
  contract.

### `@maple-kit/mcp`

`maple-mcp` serves the four tools over stdio; `maple-stop-hook` keeps an agent
from finishing while comments are open, and gives up after eight attempts
rather than hanging a session. Verified against a real MCP handshake, not only
in unit tests.

### The examples

`examples/vite-app` and `examples/next-app` are real applications that assert
on their own build output, and they run in CI. Between them they answered the
question `docs/tagger.md` left open: **`reactRemoveProperties` does reach the
server bundle.** Proving it needed a third build that tags _and_ strips — a
production build never tags, so finding it clean proves only that nothing
happened.

### Numbers

**317 tests** — 242 in Node, 75 in Chromium, up from 101. Thirteen changesets.
`lint typecheck format test test:browser build publint attw gitleaks lockfile
dco` all green, and `main` is protected by a ruleset requiring the eight CI
jobs, one approval and signed commits.

## What is deliberately absent

- **The overlay's interface.** The composer, the pin markers and the sidebar,
  including the orphan list. These are visual design decisions rather than
  mechanics, and guessing at them would be the expensive kind of wrong — the
  orphan list in particular is meant to be a first-class tab, not a footnote.
- **Device Flow wired into the route.** The flow works and the route works;
  joining them needs a decision about where a token lives and how the session
  is signed, which is a security design rather than plumbing.
- **The Next codemod.** `app/api/maple/[...maple]/route.ts` is three lines a
  person can write today; the codemod that writes it is convenience, and the
  example does not have one checked in yet.
- **The CLI's comment commands.** `maple connectors` is all that exists.
  `list|inspect|reply|resolve|open` come with the TUI decision.
- **`resolve_comment` cannot record its commit.** The store contract has
  nowhere to put a resolution's `sha` and `note`, so they are returned to the
  agent and lost on write. Closing it means a field on `Comment` and a richer
  `setStatus`, which belongs with the gate.
- **Eval cases.** Still no AI path to score.

## What is now known that was not

Four things cost time once and would cost it again.

1. **`as: "*.tsx"` on a Turbopack rule renames the module.** Turbopack's `*`
   captures the filename including its extension, so `page.tsx` becomes
   `page.tsx.tsx` and every relative import stops resolving. Omit `as`.
2. **An app-router application with no `"use client"` produces a client bundle
   containing none of its own markup.** A client-side assertion about stripping
   passes against an empty string.
3. **snapdom's `toBlob` defaults to SVG**, and takes `type: "png"` rather than
   a MIME type. An SVG "screenshot" is a re-render of the page, which is the
   failure the paste path exists to hedge against.
4. **`localStorage` throws on _access_, not only on use**, in a private window
   and wherever site data is blocked. Reaching it has to be guarded too.

## What US2 needs next

In dependency order:

1. **The overlay's interface** — composer, pins, sidebar, orphan tab. Everything
   underneath it is built and tested; this is the last thing between the
   mechanisms and a person using them.
2. **Device Flow through the route**, with a decided session shape.
3. **A `GateConnector` kind.** The store is vendor-agnostic and the gate is not:
   `maple/visual-review` is a GitHub check run, GitLab uses external status
   checks, and Bitbucket's enforcement is Premium-only. Defining the kind before
   writing the GitHub one keeps the check-run API out of core.
4. **The check run itself**, held at `in_progress` while comments are open, with
   `merge_group` auto-passing and `integration_id` pinned.
5. **A resolution record on `Comment`**, so `resolve_comment` can keep the
   commit that addressed it.
