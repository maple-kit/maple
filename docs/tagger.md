# The JSX tagger

**Status:** design, committed to. Not implemented in Phase 0.

## The problem

A comment is only as useful as the anchor under it. "The spacing here is wrong"
needs to become "`src/components/DashboardHeader.tsx:42`", or the agent starts
by searching instead of fixing.

React used to make this easy. `_debugSource` carried the JSX file and line into
the fiber tree, and a devtool could read it straight off the DOM node. React 19
removed it, and `captureOwnerStack` returns `null` outside development. Every
tool that reads component source from the tree today — react-grab among them —
is a development-only tool for exactly this reason.

Previews are production builds. So there is nothing to read.

## The decision

Maple emits the source location at build time, into the DOM, on preview builds
only:

```html
<h1 data-maple-src="src/components/DashboardHeader.tsx:42:7" data-maple-name="DashboardHeader"></h1>
```

- `data-maple-src` — `path:line:column`, repository-relative and POSIX-separated
  so it is identical on every machine.
- `data-maple-name` — the component's display name, which survives minification
  and is what a reviewer actually recognises.

Production builds strip both. The attributes exist in preview and nowhere else.

## Why this is the highest-leverage decision in the plan

It is not only about file paths. Without it, anchoring falls back to CSS
selectors, and modern styling defeats selector generation: Tailwind utility
classes are not identifying, and CSS-module class names are content hashes that
change on every build. What is left is `nth-child` paths, which break when a
list reorders.

`data-maple-name` gives the anchor cascade a durable rung above the selector,
and `data-maple-src` gives the agent somewhere to start. One build flag fixes
both.

## Emitting

Two implementations, one behaviour.

### SWC (Next)

A plugin in the compiler pipeline, enabled from `next.config.ts` when the build
is a preview:

```ts
const isPreview = process.env["MAPLE_PREVIEW"] === "1";

export default {
  experimental: { swcPlugins: isPreview ? [["@maplekit/swc-plugin-tagger", {}]] : [] },
  compiler: { reactRemoveProperties: isPreview ? false : { properties: ["^data-maple-"] } },
};
```

### Babel / Vite

A Babel plugin for projects on Babel, and for Vite a transform inside the Maple
plugin so no extra configuration is needed:

```ts
import { maple } from "@maplekit/core/vite";

export default defineConfig({ plugins: [maple({ tagger: mode !== "production" })] });
```

## Stripping

Production correctness matters more than the feature. The attributes are removed
by the framework's own dead-attribute pass, not by a Maple step:

- **Next** — `compiler.reactRemoveProperties: { properties: ["^data-maple-"] }`.
- **Vite** — the plugin does not run the transform outside preview mode, so
  there is nothing to strip.

Both are regex-based removals over the whole property name space, so a stray
`data-maple-key` set by the application is removed too. That is correct:
`data-maple-key` is an anchoring hint for reviewers, and production has none.

## What the tagger must not do

- **Never tag in production.** The attributes name source paths. Leaking them is
  a disclosure, not a nuisance.
- **Never tag host components the application did not write.** Tagging a
  `node_modules` component gives the agent a path it must not edit.
- **Never change runtime behaviour.** Attributes only; no wrappers, no extra
  elements, no changed prop identity. A React tree that renders differently
  under the tagger is a tagger bug.
- **Never assume the tagger ran.** Every consumer treats `data-maple-src` as
  optional and falls through the anchor cascade when it is absent.

## Verification before implementation

- Confirm that the `jsxImportSource` shortcut some libraries document is not
  gated on `NODE_ENV`. If it is, it cannot be used for preview builds.
- Confirm `reactRemoveProperties` runs on the server bundle as well as the
  client bundle, not only in the browser output.

## Open

- Vue, Svelte and Solid each have a development-only equivalent. The same
  "keep it on in preview" flip should apply, but the emitters are separate work.
