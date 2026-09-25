/**
 * The boilerplate every part in this package repeats, written once.
 *
 * A part takes `asChild`, passes `className` through and forwards its ref, so
 * an application can hand it its own button and keep the focus ring and the
 * analytics already on it. None of them takes a visual variant.
 */

import { createElement } from "react";

import { Slot } from "./slot.js";

import type { ElementType, ReactNode } from "react";

/** The two props every part has beyond its own element's. */
export interface PartProps {
  /** Render the single child instead of the part's own element. */
  readonly asChild?: boolean;
  readonly className?: string;
}

/**
 * Renders `tag`, or the caller's own element when `asChild` is set. Props are
 * merged by `Slot`, so handlers compose and both refs are called.
 */
export function renderPart(
  tag: ElementType,
  asChild: boolean | undefined,
  props: Record<string, unknown>,
  children?: ReactNode,
): ReactNode {
  return createElement(asChild ? Slot : tag, props, children);
}
