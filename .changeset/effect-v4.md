---
"@maple-kit/core": patch
"@maple-kit/classifier": minor
---

Move to Effect 4.0.3. Core's internal store layer is ported from Effect 3.20.0
and the classifier's peer range is now `^4.0.3`, so a host that pinned an Effect
4 release candidate must install 4.0.3 (breaking for the classifier). No public interface changed.
