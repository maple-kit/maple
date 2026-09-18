---
"@maple-kit/mcp": minor
---

Implement the MCP server behind the tool contract, and add the Stop hook.

`maple-mcp` serves `list_comments`, `wait_for_comments`, `resolve_comment` and
`get_comment_context` over stdio. The wait is clamped to 55 seconds, under
every client's ceiling, and a timeout comes back as a result rather than an
error.

`maple-stop-hook` keeps an agent from finishing while comments are open, and
gives up after eight attempts rather than hanging the session.
