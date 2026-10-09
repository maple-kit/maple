#!/bin/sh
# Prints the preview hostname for a branch: <slug>.<domain>.
# Usage: preview-host.sh <branch> <domain>
# The slug is a DNS label: lowercase, [a-z0-9-] only, at most 63 characters.
# A truncated slug ends in a short hash of the whole branch, so two long
# branches with the same start do not share a hostname.
set -eu
branch="$1"
domain="$2"
slug=$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')
[ -n "$slug" ] || slug=branch
if [ "${#slug}" -gt 63 ]; then
  hash=$(printf '%s' "$branch" | sha1sum | cut -c1-6)
  slug="$(printf '%s' "$slug" | cut -c1-56 | sed 's/-$//')-$hash"
fi
printf '%s.%s\n' "$slug" "$domain"
