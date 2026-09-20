# @maple-kit/cli

The `maple` binary for [Maple](https://github.com/maple-kit/maple) — visual
review comments on deployed previews, written for people and read by agents.

**Pre-release.** Every package here is 0.x and makes no compatibility promise.

## Install

```sh
npm install -g @maple-kit/cli
```

## Use

```sh
maple list              # every comment on the current branch
maple inspect <id>      # one comment, with its anchor and its context
maple reply <id>        # answer a reviewer without leaving the terminal
maple resolve <id>      # close a thread, with the commit that closed it
maple reopen <id>
maple open <id>         # the preview, at the comment
```

`--json` works everywhere. The branch is inferred from the working tree.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
