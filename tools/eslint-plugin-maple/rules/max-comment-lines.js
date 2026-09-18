/**
 * Comments go stale; code does not. A comment that needs more than a few lines
 * is usually a sign the code below it should be clearer, or that the
 * explanation belongs in docs/ where it will be read and revised.
 *
 * Two exemptions keep the rule from fighting legitimate prose:
 * a file-header block gets a larger budget, and JSDoc on an exported symbol is
 * unlimited because it is the published API documentation.
 */

const DEFAULT_MAX = 4;
const DEFAULT_HEADER_MAX = 10;

/** Number of source lines a comment token spans. */
function commentLineSpan(comment) {
  return comment.loc.end.line - comment.loc.start.line + 1;
}

/** True when `comment` continues the run of line comments ending at `previous`. */
function continuesRun(previous, comment) {
  return (
    previous !== null &&
    previous.type === "Line" &&
    comment.type === "Line" &&
    comment.loc.start.line === previous.loc.end.line + 1
  );
}

/** Groups adjacent line comments into one block; block comments stand alone. */
function groupComments(comments) {
  const groups = [];
  let current = null;

  for (const comment of comments) {
    if (continuesRun(current?.end ?? null, comment)) {
      current.end = comment;
      current.lines += 1;
      continue;
    }
    current = { start: comment, end: comment, lines: commentLineSpan(comment) };
    groups.push(current);
  }

  return groups;
}

/** True when the first non-whitespace text after `group` starts an export. */
function documentsAnExport(sourceCode, group) {
  const after = sourceCode.text.slice(group.end.range[1]);
  return /^\s*export\b/.test(after);
}

/** True when `group` is JSDoc, i.e. a block comment opening with `/**`. */
function isJsDoc(group) {
  return group.start.type === "Block" && group.start.value.startsWith("*");
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Limit how many consecutive lines a comment may span" },
    schema: [
      {
        type: "object",
        properties: {
          max: { type: "integer", minimum: 1 },
          headerMax: { type: "integer", minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooLong:
        "Comment spans {{lines}} lines; the limit is {{max}}. Shorten it, make the code say it, or move the explanation into docs/.",
    },
  },

  create(context) {
    const { max = DEFAULT_MAX, headerMax = DEFAULT_HEADER_MAX } = context.options[0] ?? {};
    const sourceCode = context.sourceCode;

    return {
      Program() {
        const groups = groupComments(sourceCode.getAllComments());

        groups.forEach((group, index) => {
          if (isJsDoc(group) && documentsAnExport(sourceCode, group)) return;

          const isHeader = index === 0 && group.start.loc.start.line <= 2;
          const limit = isHeader ? headerMax : max;
          if (group.lines <= limit) return;

          context.report({
            loc: { start: group.start.loc.start, end: group.end.loc.end },
            messageId: "tooLong",
            data: { lines: String(group.lines), max: String(limit) },
          });
        });
      },
    };
  },
};

export default rule;
