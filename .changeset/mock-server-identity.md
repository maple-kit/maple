---
"@maple-kit/core": minor
"@maple-kit/mock": minor
"@maple-kit/ui": patch
---

An app that renders the reviewer's roles on the server can now use a recipe's `as`. `RouteOptions.mock.identity` takes a `ServerIdentity` (`read(request)`, `roles`, optional `permissions` and `requires`) in place of a `CallIdentity`, and `/mock/identity` serves the rules with `server.current`, who `read` says the reviewer really is (`current: null` when nobody is signed in). `displayedIdentity` in `@maple-kit/mock/server` applies the recipe's `as` to that identity in a preview, for display only; never authorise with it. The client enforces `requires` with the recipe's role and no identity call, and the box says the role control reloads the page and reloads on a switch.

Breaking: `IdentitySource` is now `CallIdentity | ServerIdentity`, and `IdentityRules.call` is optional, absent when the server renders the identity. `IdentityRules.role` and `permissions` have an optional `path`. `MockSchemas.identity` takes the request.
