# Design lint

Visual review catches what a person notices. A design system also has rules a
machine can check on every pull request, and this is where those live.

Lint reports a `Finding`, the same shape from every tier:

```ts
interface Finding {
  rule: string;
  tier: "static" | "rendered" | "judged";
  severity: "error" | "warn" | "advice";
  message: string;
  anchor: { src?: string; selector?: string; quote?: TextQuote };
  url?: string;
}
```

`anchor` is the cascade's own `Anchor`, not a shape of lint's own, so a finding
and a comment mean the same thing by "where". The page is read through
`describeElement`, which records every rung it can — the source location, the
component name, a text quote, and the CSS path that is always there.

## The tiers

| Tier         | Sees                                     | May block                |
| ------------ | ---------------------------------------- | ------------------------ |
| **static**   | The source, before it is built.          | Yes                      |
| **rendered** | The page, after the browser laid it out. | Yes                      |
| **judged**   | What a model thinks of the page.         | Only when a host says so |

The deterministic tiers may gate because they are reproducible. A judged rule
defaults to `advice`: a gate that depends on a model's opinion is a gate that
changes its mind between runs.

## The rendered tier

`@maple-kit/lint` runs Chromium against a deployed preview and reads what the
cascade, the theme and the media queries finally produced. That is the point of
the tier: an off-token colour that arrived through three layers of `var()` is
invisible to a static linter and plain here.

```ts
import { lintRendered } from "@maple-kit/lint";

const findings = await lintRendered({
  url: "https://preview-123.example.app",
  tokenFiles: ["src/styles/tokens.css"],
  viewports: [{ width: 375, height: 812 }],
  bypassHeaders: { "x-vercel-protection-bypass": process.env.PREVIEW_BYPASS! },
});
```

Every tagged element — anything carrying `data-maple-src` — is read at each
viewport. An untagged build still lints; its findings anchor on the selector
alone.

### Rules

| Rule                             | What it finds                                               |
| -------------------------------- | ----------------------------------------------------------- |
| `maple/rendered-color-token`     | A text or background colour the token set does not declare. |
| `maple/rendered-type-scale`      | A font size that is not on the type scale.                  |
| `maple/rendered-touch-target`    | An interactive element under 24px on either axis.           |
| `maple/rendered-contrast`        | Text under the WCAG AA ratio for its size.                  |
| `maple/rendered-motion-property` | Motion on a property other than `opacity` or `transform`.   |
| `maple/rendered-reduced-motion`  | Motion that survives `prefers-reduced-motion`.              |

A token used at any alpha is still that token: `rgb(17 17 17 / 0.6)` matches an
`--ink: #111111`, because secondary text written that way is using the token
rather than a raw colour beside it.

The token set is read from the `tokenFiles` the static tier is configured with,
so the two tiers cannot disagree about what a token is. A `rem` in a token file
converts at a 16px root; `ROOT_FONT_SIZE` overrides that. Only tokens whose
name reads as type (`--…-text-…`, `--…-font-…`, `--…-type-…`) form the scale,
because a spacing token is a length too and a scale that admitted them would
admit nearly any size.

### Two passes

Each viewport is read twice: once as a reviewer sees it, and once with reduced
motion emulated. A page that honours the query computes every duration to zero
under it, so whatever still moves in the second pass has hard-coded its motion.
This is the only way to tell the two apart from the outside.

A pure `opacity` fade that survives is not reported. Opacity is the property
the safe list permits, and flagging it here would set the two motion rules
against each other; reduced-motion guidance is about movement, not fades.

### Contrast

Contrast is judged only on elements that paint text themselves. `textContent`
includes every descendant, so a wrapper whose text is all painted by a child
would otherwise be judged on a colour that never reaches the screen — and a
perfectly accessible page would fail.

It is measured against the first opaque background at or above the element,
which is what the eye actually sees, and a translucent text colour is
composited onto it first. Large text — 24px, or 18.66px at weight 700 — is held
to 3:1 and everything else to 4.5:1, as WCAG 2.1 AA defines them.

### Colours it can read

Hex in all four lengths, `rgb()`, `hsl()`, `color(srgb …)` — which is what
`color-mix()` computes to — and the 148 CSS named colours. A token written
`--ink: black` or `--scrim: #00000080` is a token, not a gap.

A wider gamut (`oklch()`, `color(display-p3 …)`) still cannot be read, and that
is reported rather than passed over: a run warns through Maple's logger, naming
the token and the value, and again for any colour on the page it could not
judge. A colour nobody can parse is not a clean page, it is an unchecked one.
Pass your own `logger` to capture those instead.

### Viewports

With no `viewports` configured a run uses a phone, a tablet and a laptop:
375×812, 768×1024 and 1440×900. A finding at every viewport is reported once,
as written. A finding at only some of them names them, because "only on the
phone" is most of what the reader needs.

### Pinning a finding

`findingComment(finding, { branch, context })` turns a finding into a `Comment`,
which is what the overlay draws marks from:

```ts
import { findingComments, lintRendered } from "@maple-kit/lint";

const run = await lintRendered({ url, tokenFiles });
const pinned = findingComments(run.findings, { branch: "feature/x", context: run.context });
```

`commentsForRun(run, { branch })` does the whole run at once and gives each
comment the viewport it was actually seen in, so a phone-only finding does not
store a 1440px context.

Hand them to `MapleMarkLayer`'s `comments` prop and they pin where they were
found, beside the human ones. The author is `Maple lint`, never a person.

The id is derived from the branch, the rule, the most durable anchor rung and
the message, so a second run over an unchanged page produces the same ids and a
store that already holds them can say so rather than appending them twice.

This is a separate export, and a run does not call it. Whether findings belong
in the PR ledger at all is [discussion #112][112]'s first open question, and
nothing here answers it: the adapter makes pinning possible without making it
happen.

[112]: https://github.com/maple-kit/maple/discussions/112

### Loading, and a preview that pushes back

A page is read after `load`, with a `timeout` (default 30s) and an optional
`settleMs` for an app that paints after hydration. Waiting for network idle
would be more thorough and never finishes: one websocket, poll or analytics
beacon keeps a preview busy forever.

Contexts run with `bypassCSP`, because the reader is injected and a preview
with a strict `script-src` would otherwise refuse it and fail the whole run
rather than be linted. See [docs/overlay-csp.md](overlay-csp.md).

### When a run checks less than you think

A misconfigured `tokenFiles` is the quiet failure this tier is most prone to,
so it is not quiet. With no colour token the colour rule reports nothing rather
than reporting everything, with no type token the type-scale rule does the
same, and both say so through the logger. The same goes for a token or a
painted colour that could not be read.

### Authentication

A run sends the preview platform's bypass as request headers and nothing else.
Reviewer cookies are never used: CI's lint run does not borrow a person's
session to see a page.

## From the command line

`maple lint --url=<preview> --tokens=<file.css>` runs the rendered tier and
prints the findings grouped by rule with their `file:line:col`. It exits 1 when
a finding is an error.

`maple ci lint` is the same run as CI does it: `--sarif <path>` writes SARIF,
and the `maple/design-lint` check run is published on the head commit with
annotations. Inputs fall back to `GITHUB_REPOSITORY`, the pull request's head
commit in `GITHUB_EVENT_PATH` (then `GITHUB_SHA`) and `GITHUB_OUTPUT`; the token
is `MAPLE_GITHUB_TOKEN`, then `GITHUB_TOKEN`, never an argument. `--dry-run`
prints the verdict and publishes nothing. A preview that cannot be reached is
neutral, not a failure. `runCiLint` from `@maple-kit/cli` is the same thing as a
function.
