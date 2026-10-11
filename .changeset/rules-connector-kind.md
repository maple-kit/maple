---
"@maple-kit/core": minor
"@maple-kit/lint": minor
"@maple-kit/cli": minor
---

Add `rules`, a seventh connector kind: the contract the judged tier of design lint (#126) is built on. `RuleConnector` carries `rules: Rule[]` (`{ id, question, appliesTo, severity? }`, `appliesTo` a CSS selector) and a required `evaluate(request: RuleRequest): Promise<Finding[]>`, where a `RuleRequest` is the page `url`, its `viewport` and the `targets` (rule id, serialised subtree HTML, anchor) the rules matched. `ConnectorKind`, `AnyConnector`, `CONNECTOR_METHODS` and `REQUIRED_METHODS` gain the kind, so `maple connectors` prints it.

Breaking: `Finding`, `Tier` and `Severity` moved from `@maple-kit/lint` to `@maple-kit/core` (and `@maple-kit/core/connectors`), so a connector author never depends on lint. `@maple-kit/lint` no longer exports them: import them from `@maple-kit/core`. `maple-action` and any other consumer must change the import.
