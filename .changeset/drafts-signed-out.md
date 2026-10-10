---
"@maple-kit/ui": minor
"@maple-kit/core": patch
---

Only a kept draft is a draft, and a reviewer who has not signed in cannot publish. `Maple.Unsent`, the "Some comments are unpublished" line with its split Publish button, is removed with its `UnsentProps` and most of `UNSENT_COPY`; Publish all is the composer's Publish, and Download (a file, beside Import) replaces Copy as Markdown and Copy as JSON. The composer without a sign-in shows Save as draft as the primary button and "Sign in to publish directly" in place of Publish; Download carries a green dot while signed out with saved drafts. The comment being typed was stored on every keystroke and so counted as a draft in the filter and the unpublished line; `ComposerState` gains `resumed`, and `useSavedDrafts` and `useSignedOut` are exported from `@maple-kit/ui/island`. The settings control is a cog, the context card is titled "Page context", and the branch chip is green when it links.
