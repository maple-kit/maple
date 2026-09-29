/**
 * Reading where a React element was written, off the DOM node itself.
 *
 * A development build of React 19 keeps, on every fiber, the stack of the call
 * that created it (`_debugStack`) and the component that was rendering then
 * (`_debugOwner`). Those are private fields, so nothing here is trusted: each
 * read is guarded, and a page that is not React, or is a production build,
 * simply answers nothing. `docs/review.md` says what this is worth.
 */

/** One line of a stack: a position in a served file. Column is 1-based, as browsers print it. */
export interface StackFrame {
  readonly url: string;
  readonly line: number;
  readonly column: number;
}

/** Where one element's JSX was written, and the component whose render wrote it. */
export interface OwnerFrame extends StackFrame {
  readonly component?: string;
}

/** The frames that are React's own way in, which sit above the component's call. */
const RUNTIME = /jsx-?(?:dev-?)?runtime|\bjsxDEV|\bcreateElement\b|react[-_]stack/i;

/** How many owners to climb looking for one that is application code. */
const MAXIMUM_OWNERS = 24;

/** The fields read off a fiber, which is what React calls its unit of work. */
interface FiberLike {
  readonly _debugStack?: { readonly stack?: unknown };
  readonly _debugOwner?: FiberLike | null;
  readonly type?: unknown;
}

/**
 * Parses one stack line, or undefined where it names no position. Chromium
 * prints `at name (url:1:2)` or `at url:1:2`; Firefox and Safari `name@url:1:2`.
 */
function parseFrame(line: string): StackFrame | undefined {
  const text = line.trim().replace(/\)$/, "");
  const column = text.lastIndexOf(":");
  const row = text.lastIndexOf(":", column - 1);
  const head = text.slice(0, row);
  const url = head.slice(
    Math.max(head.lastIndexOf("("), head.lastIndexOf(" "), head.indexOf("@http")) + 1,
  );
  const position = [text.slice(row + 1, column), text.slice(column + 1)].map(Number);
  if (row < 1 || url === "" || position.some((value) => !Number.isInteger(value))) return undefined;
  return { url, line: position[0]!, column: position[1]! };
}

/**
 * The frame that called React to create the element: the first one below the
 * run of React's own frames that opens the stack. A stack that does not open
 * with that run answers nothing, so an ordinary error's is never mistaken for one.
 */
export function creationFrame(stack: string): StackFrame | undefined {
  const lines = stack.split("\n");
  const below = lines.findIndex((line) => !RUNTIME.test(line));
  if (below < 1) return undefined;
  return lines
    .slice(below)
    .map(parseFrame)
    .find((frame) => frame !== undefined);
}

/** The fiber React attached to a DOM node, under a key that changes on every page load. */
function fiberOf(element: Element): FiberLike | undefined {
  const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
  return key === undefined ? undefined : (element as unknown as Record<string, FiberLike>)[key];
}

/** A component's name as a person would say it, from what React keeps on its type. */
function nameOf(fiber: FiberLike | null | undefined): string | undefined {
  const type = fiber?.type as
    { displayName?: unknown; name?: unknown; render?: { name?: unknown } } | null | undefined;
  const name = type?.displayName ?? type?.name ?? type?.render?.name;
  return typeof name === "string" && name !== "" ? name : undefined;
}

/**
 * Where the element's JSX was written, then where each component above it was,
 * nearest first. The element's own frame is the exact place; an owner's is the
 * next best when that one lies in a library.
 */
export function ownerFrames(element: Element): OwnerFrame[] {
  const frames: OwnerFrame[] = [];
  let fiber = fiberOf(element);
  for (let step = 0; fiber && step < MAXIMUM_OWNERS; step += 1) {
    const stack = fiber._debugStack?.stack;
    const frame = typeof stack === "string" ? creationFrame(stack) : undefined;
    const component = nameOf(fiber._debugOwner);
    if (frame) frames.push({ ...frame, ...(component === undefined ? {} : { component }) });
    fiber = fiber._debugOwner ?? undefined;
  }
  return frames;
}
