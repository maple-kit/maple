#!/bin/sh
# Writes one comment on a pull request and rewrites it on every later call.
# Usage: sticky-comment.sh <pull request number> <marker> <body>
# The marker is a line of the body, and is how the earlier comment is found.
# Needs GH_TOKEN with pull-requests: write, and GITHUB_REPOSITORY.
set -eu

number=$1
marker=$2
body=$3

id=$(gh api --paginate "repos/$GITHUB_REPOSITORY/issues/$number/comments" \
  --jq ".[] | select(.body | contains(\"$marker\")) | .id" | head -n 1)

if [ -n "$id" ]; then
  gh api --method PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -f body="$body" > /dev/null
else
  gh api --method POST "repos/$GITHUB_REPOSITORY/issues/$number/comments" -f body="$body" > /dev/null
fi
