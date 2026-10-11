---
"@maple-kit/lint": minor
---

Add the judged tier's consumer. Pass a `RuleConnector` as `judged` to `lintRendered` and each viewport's matching elements (a rule's `appliesTo` selector; subtree HTML without scripts or styles, capped by `maxPerRule`, `maxTargets` and `maxHtml`) go to `connector.evaluate` once, reusing the page the rendered tier already opens. Findings come back `judged` at the rule's severity (`advice` by default), findings for unknown rule ids are dropped, and dedupe across viewports ignores a judged message, which the judge words differently each run. A rejected `evaluate` does not fail the run: `RenderedRun.judgedErrors` lists the viewports not judged and the logger warns. New exports: `lintJudged`, `readTargets`, `MAX_TARGETS`, `MAX_TARGETS_PER_RULE`, `MAX_TARGET_HTML`, `TRUNCATED` and their types. Breaking: `RenderedRun` gains `judgedErrors`, `Reading` gains `judged`, and `readPage` takes an optional `{ rules, ...limits }`. No screenshot is sent.
