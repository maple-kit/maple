# @maple-kit/mcp

The Model Context Protocol server that hands a coding agent the review comments
[Maple](https://github.com/maple-kit/maple) collected on a preview deployment.

**Pre-release.** Every package here is 0.x and makes no compatibility promise.

## Install

```sh
npm install @maple-kit/mcp
```

Two binaries ship: `maple-mcp`, the server, and `maple-stop-hook`, which stops
an agent from calling itself finished while comments are still open.

## Tools

| Tool                                 | What it does                                                      |
| ------------------------------------ | ----------------------------------------------------------------- |
| `list_comments`                      | Every open comment on the branch                                  |
| `wait_for_comments(cursor, timeout)` | Blocks for up to 55s, then returns `timeout` rather than an error |
| `get_comment_context(id)`            | The anchor, the viewport and what the reviewer was looking at     |
| `resolve_comment(id, sha, note)`     | Closes a thread against the commit that closed it                 |

`wait_for_comments` is clamped to 55 seconds because every coding client cuts a
tool call off at 60, and it emits `notifications/progress` every 15 seconds.

## Documentation

- [The agent loop](https://github.com/maple-kit/maple/blob/main/docs/agent-loop.md)

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
