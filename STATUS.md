# Status

**Phase 0 complete.** Three repositories exist, the toolchain is green, and
every decision that is expensive to change later has been made and written down.

No product behaviour ships in this phase. What ships is the shape everything
else has to fit.

## What Phase 0 delivered

### Repositories

| Repository     | What is in it                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maple`        | This monorepo: `core`, `cli`, `mcp`, docs, evals, repo skills.                                                                                          |
| `maple-action` | GitHub Action skeleton. `action.yml` at the root, `node24`, ncc bundle. Inputs and the gate decision are implemented and tested; the API calls are not. |
| `maple-tui`    | README only. Rust + ratatui, deliberately not started.                                                                                                  |

### `@maplekit/core`

- **The connector contract** — `StoreConnector`, `MediaConnector`,
  `ObservabilityConnector`, `IdentityConnector`. Plain Promises, structural
  types, no Effect anywhere near it.
- **Capability detection by presence** — `capabilitiesOf`, `supports`,
  `assertUsable`. One source of truth, so the docs table and the code cannot
  disagree.
- **`createCommentStore`** — the Promise-facing store API, with retries, a
  timeout and one public error type.
- **Effect v3, internal only** — `src/internal/effect/` wraps connector calls in
  typed errors and a jittered retry schedule. It unwraps the exit itself rather
  than letting `Effect.runPromise` reject with a `FiberFailure`, so no caller
  ever sees an Effect type. `no-restricted-imports` is the backstop.
- **`createLogger({ sinks })`** — console and memory sinks, child loggers, a
  broken sink cannot take the caller down. Raw `console.*` is a lint error
  everywhere but the console sink itself.
- **Standard Schema v1 config validation** — `validateConfig`,
  `validateConfigSync`. No validation library is bundled.
- **`stableStringify`** in `src/lib/` — a ported helper rather than a
  dependency, with its reasoning recorded in that directory's README.
- **The shared connector contract suite** in `@maplekit/core/testing`, plus an
  in-memory reference connector that runs against it.

### `@maplekit/cli`

`maple connectors` prints the capability matrix, derived from core's tables.
`--json` everywhere. Zero runtime dependencies beyond core; argument parsing is
about forty lines.

### `@maplekit/mcp`

The tool contract: `list_comments`, `wait_for_comments`, `resolve_comment`,
`get_comment_context`, with the wait clamped to 55 seconds — under the 60-second
ceiling every coding client enforces — and a timeout modelled as a normal
result, never an error.

### Toolchain

- pnpm workspaces, changesets, tsdown, publint.
- `.npmrc`: exact versions, engine-strict, no install scripts.
  `pnpm-workspace.yaml` refuses anything published in the last three days.
- ESLint flat config, errors not warnings: no console, comment budget,
  cyclomatic ≤ 20, cognitive ≤ 15, nesting ≤ 4, params ≤ 4, 150 lines per
  function, import ordering, unused-import removal. Suppressions are frozen and
  CI fails on a diff from `--prune-suppressions`.
- A local ESLint plugin implementing `max-comment-lines`.
- vitest for logic, vitest browser mode in real Chromium for anything that
  depends on constructed stylesheets or shadow DOM.
- lefthook: gitleaks, eslint, prettier, conventional-commit and DCO checks.
- CI: lint, typecheck, format, test, browser test, build, publint, attw,
  gitleaks, DCO.

**97 tests pass** — 94 in Node, 3 in Chromium. `pnpm lint && pnpm typecheck &&
pnpm test && pnpm build` is green, and all three packages are publint-clean.

### Documented decisions

- `docs/tagger.md` — the build-time JSX tagger, committed to, not implemented.
- `docs/overlay-csp.md` — exactly which CSP directives Maple needs, stated as a
  sentence that can be falsified.
- `docs/connectors.md` — the capability matrix, with the Datadog row filled in
  and its three caveats explained.
- `docs/setup-owner.md` — everything a person has to do by hand.
- `evals/README.md` — eval conventions, fixed before the first case exists.

### Repo skills

`contribute-connector` and `maple-review`, in `.claude/skills/`.

## What is deliberately absent

Knowing what was skipped on purpose is worth as much as knowing what landed.

- **The overlay.** `@maplekit/core/overlay` is an entrypoint, two constraints
  and one function. There is no UI.
- **msw.** Maple makes no network calls yet. `test/msw/README.md` fixes the
  conventions; the dependency arrives with the first handler.
- **evalite.** No AI code means no eval cases. `evals/` holds the config and the
  conventions. Note for whoever adds it: evalite pulls `better-sqlite3`, which
  builds at install time, so it needs an entry in `onlyBuiltDependencies`.
- **The examples.** `examples/next-app` and `examples/vite-app` are READMEs
  stating what each has to prove. Pulling a framework into the lockfile to
  demonstrate nothing is cost without return.
- **`@arethetypeswrong/cli`** runs through `pnpm dlx` in CI rather than as a
  dependency: it is a publish gate, not part of the development loop.

## What the first milestone needs next

US1 is local-first comments on a deployed preview, copied as markdown, posted to
a pull request as the reviewer, and picked up by an agent.

In dependency order:

1. **The JSX tagger**, both emitters. Everything below anchors better with it,
   and the design in `docs/tagger.md` is ready to implement.
2. **The anchor cascade** — `data-maple-key`, then source, then component, then
   text quote, then selector — with an explicit orphan state. Port the fuzzy
   quote matcher rather than depending on it, and expect roughly a quarter of
   anchors to orphan over time. Orphans are a first-class list, never a silent
   ancestor snap.
3. **The overlay**, as a bundled component: element, text and rectangle
   comments, drafts in localStorage keyed by branch, and a context badge
   carrying viewport, DPR, scheme, breakpoint and locale. Every style through
   `createOverlayStyleSheet`.
4. **The SDK route**, with the Vite plugin (auto-mounting) and the Next codemod
   that writes `app/api/maple/[...maple]/route.ts`.
5. **The markdown exporter** — human table above, visible ` ```maple ` fence
   below, under 8 KB. Screenshots must be hosted URLs; `data:` images are
   stripped from a pull request body.
6. **GitHub Device Flow login**, so a reviewer signs in from a wildcard preview
   host and the comment is posted as them.
7. **Screenshots** via a client-side capture, **with the paste-a-real-screenshot
   escape hatch on day one.** Client capture fails hardest on exactly the visual
   details people comment about, so the escape hatch is not a later refinement.
8. **The MCP server** behind the contract in `@maplekit/mcp`, plus a Stop hook
   that blocks an agent from finishing while comments are open.

The first connector to write with `contribute-connector` is the GitHub PR store,
since that is the default. Datadog is the first observability connector, and
`docs/connectors.md` already records what it can and cannot do.
