---
"@maple-kit/cli": minor
---

Add `maple lint` and `maple ci lint`, and export `runCiLint`. `maple lint` runs the rendered design lint against a preview and exits 1 on an error finding. `maple ci lint` also writes SARIF and publishes the `maple/design-lint` check run, reading its inputs from flags or the GitHub Actions environment; a preview that cannot be reached is neutral. Flags may now repeat (`FlagType` gains `"strings"`).
