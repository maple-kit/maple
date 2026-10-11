---
"@maple-kit/classifier": minor
---

Add `jevRules(options)`, a `RuleConnector` for the judged tier of design lint (#126). It asks jev one `noul` question per (rule, element), all in one request while they fit jev's 64k-token limit (a page past 80,000 characters is split into several requests; `jevRules` neither selects nor truncates elements, lint does, and one element past 80,000 characters rejects naming its rule), and returns a `judged` `Finding` for each element at or above `threshold` (default 0.5), with the rule's `severity` or `advice`. Options: `apiKey`, `rules`, `baseUrl`, `model`, `threshold`, `timeoutMs` (default 60 s). Failures reject with `ClassifierRequestError`.
