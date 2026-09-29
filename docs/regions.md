# Anchoring a region

A region is a rectangle a reviewer drew, and what it is about is the things
under it. This page records how one is anchored and why.

## The problem with a container

The first design stored the rectangle as fractions of the smallest element that
holds all of it. That is steady while the container is about the size of what
was drawn over. A rectangle a few pixels wider than a card is not held by the
card, so the walk climbs to the page shell, whose height is the length of the
page. Anything that changes that height moves the rectangle: a narrower window,
one more list row, the same component on another route.

## What is recorded

A region anchor keeps everything it had (`region` as fractions, plus the
container's own rungs) and adds `members`, each a full anchor for one element
the rectangle covers:

- `anchor`: the member's own rungs. A tagged element records its key, source,
  component, quote and selector. An untagged element with words of its own
  records its quote and selector only, and is not recorded without both,
  because tags inherited from an ancestor would resolve it to the ancestor.
- `offset`: pixels from the member's border box out to the drawn edges. Positive
  where the rectangle reaches past the member, negative where it cuts in.
- `overlap`: the share of the member's area inside the rectangle.

Capture (`captureMembers` in `@maple-kit/core/anchor`):

1. Take every element at least 0.6 inside the rectangle. A card the edge clips
   is not the subject.
2. Among tagged elements, drop any that holds another kept tagged element, so
   the result is `BrewGuideCard` and `SectionHeading`, not the shell.
3. Keep an untagged element only where no tagged member already covers it, and
   drop one that holds another untagged element.
4. Rank tagged before untagged, then by area inside the rectangle, and keep four.

A rectangle over a gap, or over a whole list, records no members. The container
is then the honest subject and the anchor resolves as it always did.

## Resolving

`resolveAnchor` handles it, so a region resolves wherever an element does.

1. Every member goes through `resolveAnchor` itself, so each check the cascade
   makes applies to each member. A member that only a selector placed is also
   held to its words, because a removed sibling moves the next one into its
   position.
2. The rectangle is the union of each resolved member grown by its own offsets.
   On an unchanged page those are all the drawn rectangle.
3. Confidence is resolved over recorded, times the mean confidence of the rungs
   that placed them. It is held below the "fair" band when members are missing
   or when the grown boxes disagree by more than 16 px, which means the members
   moved apart (a narrower window stacked them). The union is still drawn
   rather than inventing a position.
4. With no member resolved it falls back to the container's fractions, then to
   an orphan, in that order.

An anchor stored without `members` has always resolved through the container,
and still does.

## Naming

`nameMembers` reads a region as its first member and a count: `BrewGuideCard +1`.
The ring's label, the markdown table, the gate's list of open comments and the
Stop hook use it in place of the page shell's name, and the MCP
`get_comment_context` lists a `covers <source>` line per member, which is the
file to open.

## Not done

The composer's detail rows still describe the region by its container fractions,
and the ring's developer-detail source line still reads the resolved container.
