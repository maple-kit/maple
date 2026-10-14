/**
 * Keeping the overlay usable while the page has a modal open.
 *
 * A modal dialog makes everything outside its subtree inert and sits in the
 * top layer above any z-index, so an overlay left in `<body>` is both hidden
 * and dead. A script-built modal does the same with a focus trap and an
 * outside-pointerdown dismiss. Moving the host inside the topmost modal is the
 * one placement that beats all of them. docs/overlay-modals.md has the limits.
 */

const NATIVE = "dialog:modal";
const SCRIPTED = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';
const MODAL_LIKE = 'dialog, [aria-modal], [role="dialog"], [role="alertdialog"]';
const WATCHED = ["open", "aria-modal", "role", "hidden", "style", "class"];

/** Native modals before scripted ones: the top layer is above everything else. */
export function topmostModal(doc: Document): Element | undefined {
  const native = all(doc, NATIVE);
  if (native.length > 0) return native[native.length - 1];
  return all(doc, SCRIPTED)
    .filter((node) => node.checkVisibility?.() ?? true)
    .at(-1);
}

/** `:modal` throws in a browser that lacks it, and then there is nothing to find. */
function all(doc: Document, selector: string): readonly Element[] {
  try {
    return [...doc.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

/**
 * Appends the container to `to`. A move blurs focus and drops a modal inside
 * the overlay out of the top layer, so both are put back.
 */
function relocate(container: HTMLElement, to: Element): void {
  const root = container.shadowRoot;
  const focused = root?.activeElement;
  to.append(container);

  for (const own of root?.querySelectorAll<HTMLDialogElement>("dialog[open]") ?? []) {
    if (own.matches(":modal")) continue;
    // Removing `open` first keeps the close event, and the unmount it drives, quiet.
    own.removeAttribute("open");
    own.showModal();
  }
  if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
}

function mentionsModal(node: Node): boolean {
  return (
    node instanceof Element && (node.matches(MODAL_LIKE) || node.querySelector(MODAL_LIKE) !== null)
  );
}

/** Whether a record could have opened or closed a modal, or moved the one we are in. */
function mattersToModals(record: MutationRecord, container: HTMLElement): boolean {
  if (record.type === "attributes") {
    const target = record.target;
    return target instanceof Element && (target.matches(MODAL_LIKE) || target.contains(container));
  }
  return [...record.addedNodes, ...record.removedNodes].some(mentionsModal);
}

/**
 * Follows the topmost open modal with the container, and returns to `home`
 * when none is left. Returns the function that stops following.
 */
export function followModal(container: HTMLElement, home: Element): () => void {
  const doc = container.ownerDocument;

  const settle = (): void => {
    const target = topmostModal(doc) ?? (home.isConnected ? home : doc.documentElement);
    if (!Object.is(container.parentElement, target)) relocate(container, target);
  };
  // Re-appended only when its home left too: a container removed on purpose stays out.
  const orphaned = (): boolean => !container.isConnected && !home.isConnected;
  const observer = new MutationObserver((records) => {
    if (orphaned() || records.some((record) => mattersToModals(record, container))) {
      settle();
    }
  });

  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: WATCHED,
  });
  doc.addEventListener("close", settle, true);
  doc.addEventListener("cancel", settle, true);
  settle();

  return () => {
    observer.disconnect();
    doc.removeEventListener("close", settle, true);
    doc.removeEventListener("cancel", settle, true);
  };
}
