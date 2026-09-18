# The agent loop

Maple's half of the loop is four MCP tools and one hook. The reviewer's half is
the overlay. Neither knows about the other; they meet in the store.

## The four tools

| Tool                  | Reads | What it is for                           |
| --------------------- | ----- | ---------------------------------------- |
| `list_comments`       | ✓     | Everything on a branch, newest first.    |
| `wait_for_comments`   | ✓     | Block until something new arrives.       |
| `get_comment_context` | ✓     | Everything needed to act on one comment. |
| `resolve_comment`     |       | Mark one addressed, naming the commit.   |

### A timeout is a result

`wait_for_comments` is a long poll, and every coding client kills a tool call
that outlives its own ceiling — Cursor's ACP path hardcodes 60 seconds and Codex
defaults to the same. So the wait is clamped to 55 seconds and a timeout comes
back as `{ status: "timeout" }` rather than as a failure. An agent that treats
a timeout as an error will stop looping the first time nobody is looking.

### The cursor is a timestamp

Not a page. `wait_for_comments` returns the newest `createdAt` it saw; pass it
back to get only what is newer. Omit it on the first call and the tool drains
whatever is already waiting, so an agent that starts after the reviewer does not
sit waiting for a second comment to notice the first.

## The Stop hook

MCP gives a server no way to interrupt a client, so the loop is closed from the
other end. Claude Code's `Stop` hook runs when the agent believes it is
finished; Maple's answers with the open comments.

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "npx -y @maple-kit/mcp maple-stop-hook" }] }
    ]
  }
}
```

It blocks at most **eight times**. A hook that can block forever is a hung
session, and the person watching an agent loop has no way out of one. On the
ninth it lets the session end and says what is still open, which is a better
outcome than an agent resolving comments to escape.

## Configuration

The client starts an MCP server with no arguments, so the environment is the
only channel there is. A missing value fails at startup rather than on the first
tool call, where a client would show it as a tool error and bury it.

| Variable                                  |                                                             |
| ----------------------------------------- | ----------------------------------------------------------- |
| `MAPLE_STORE`                             | `github`, the default and so far the only one.              |
| `MAPLE_GITHUB_OWNER`, `MAPLE_GITHUB_REPO` | The repository.                                             |
| `GITHUB_TOKEN`                            | Server-side only. Never in a file; use `op run --env-file`. |
| `MAPLE_GITHUB_API`                        | For Enterprise Server.                                      |
| `MAPLE_BRANCH`                            | The branch under review. Read by the Stop hook.             |

## What is not here yet

- **`resolve_comment` records the commit in its result, not in the store.** The
  store contract has nowhere to put a resolution's `sha` and `note`, so they are
  returned to the agent and lost on write. Closing that needs a field on the
  comment and a richer `setStatus`, which belongs with US2's gate rather than
  being half-added here.
- **Claude Code Channels**, which would let the server wake an idle session
  instead of the agent polling. It is a research preview; the Stop hook and
  `wait_for_comments` work everywhere today.
