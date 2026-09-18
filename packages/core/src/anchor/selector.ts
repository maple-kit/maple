/**
 * A CSS path to an element, as the cascade's last resort.
 *
 * It is last for a reason: Tailwind utilities identify nothing and CSS-module
 * class names are content hashes that change on every build, so a generator
 * that leans on classes produces a selector that breaks on the next deploy.
 * This one uses structure only, which at least fails honestly.
 */

const ID = /^[A-Za-z][\w-]*$/;

/**
 * A selector matching only `element` within `root`, or undefined when the
 * element is not in it.
 */
export function cssPathTo(element: Element, root: ParentNode = document): string | undefined {
  if (!contains(root, element)) return undefined;

  const identifier = uniqueId(element, root);
  if (identifier) return identifier;

  const steps: string[] = [];
  for (let current: Element | null = element; current; current = current.parentElement) {
    steps.unshift(step(current));
    const selector = steps.join(" > ");
    if (root.querySelectorAll(selector).length === 1) return selector;
  }
  return undefined;
}

function uniqueId(element: Element, root: ParentNode): string | undefined {
  const { id } = element;
  if (!id || !ID.test(id)) return undefined;
  const selector = `#${id}`;
  return root.querySelectorAll(selector).length === 1 ? selector : undefined;
}

function step(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (!parent) return tag;

  const siblings = [...parent.children].filter((child) => child.tagName === element.tagName);
  if (siblings.length === 1) return tag;
  return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})`;
}

function contains(root: ParentNode, element: Element): boolean {
  return root === element.ownerDocument || (root as Node).contains(element);
}
