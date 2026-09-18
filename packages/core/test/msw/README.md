# Network mocks

Every network call Maple makes is mocked here with [msw](https://mswjs.io), and
the same handlers are reused by Storybook so a story and a test never disagree
about what an API returns.

## Layout

One file per upstream, named after it:

```
msw/
  github.ts       handlers for the GitHub REST and GraphQL calls
  handlers.ts     the array every test server starts from
  server.ts       setupServer() for Node tests
```

## Conventions

- A handler returns the shape the real API returns, including its error shapes.
  A test that only ever sees a 200 is not testing the code that handles a 500.
- Unhandled requests fail the test (`onUnhandledRequest: "error"`). A request
  nobody mocked is a request nobody noticed.
- Fixtures are trimmed real responses with identifiers replaced, never
  hand-written objects that drift from the API.

## Fakes, where fixed responses cannot do

`github.ts` is a small **fake** rather than a set of fixed responses. The
contract suite appends a comment and then reads it back, and a handler that
always answers with the same page cannot express read-your-writes — which is
exactly the property the GitHub connector claims. `createGitHubFake()` keeps
comments in a map, assigns ids, and emits GitHub's `Link` header when a page is
not the last, so pagination is exercised rather than asserted.

Each suite creates its own fake and resets it between tests. A shared one leaks
state and turns a real failure into a flake.

## Status

`msw-harness.test.ts` asserts the harness's two guarantees: a declared handler
answers, and an unmocked request fails the test. `github.ts` is the first
upstream.
