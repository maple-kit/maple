/**
 * A vendor's flags on the wire: the request a vendor's SDK makes for flag
 * values, and the stream it keeps open for changes. A flag source reads the
 * real values for the box and writes the recipe's in; nothing else in the
 * interceptor knows a vendor's format.
 */

import type { FlagValue } from "@maple-kit/core/mock";

/** The recipe's flags, as a source writes them. */
export type Flags = Readonly<Record<string, FlagValue>>;

/** A vendor's streamed flag updates. */
export interface FlagStream {
  /** Whether an `EventSource` at `url` is this vendor's. */
  claims(url: string): boolean;
  /** One event's data under the recipe's flags, or undefined to drop the event. */
  event(type: string, data: string, flags: Flags): string | undefined;
}

/** How a vendor's SDK asks for flag values. */
export interface FlagSource {
  readonly name: string;
  /** Whether `request` asks this vendor for flag values. */
  claims(request: Request): boolean;
  /** The real values in an answer, by key, or undefined when it cannot be read. */
  read(body: unknown): Flags | undefined;
  /** The answer with the recipe's flags written in. */
  write(body: unknown, flags: Flags): unknown;
  /** Its streamed updates, when the vendor streams them. */
  readonly stream?: FlagStream;
}

/** The type a box shows a flag as, from its value. */
export function flagType(value: FlagValue): "boolean" | "number" | "object" | "string" {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return typeof value as "boolean" | "number" | "string";
  }
  return "object";
}

type Listener = EventListenerOrEventListenerObject;
type Options = AddEventListenerOptions | boolean;

/**
 * Wraps the page's `EventSource` so a vendor's stream is read through its
 * source, and an update to a named flag never arrives. Returns the undo.
 */
export function holdStreams(sources: readonly FlagSource[], flags: Flags): () => void {
  const Native = globalThis.EventSource as typeof EventSource | undefined;
  const streams = sources.flatMap((source) => (source.stream ? [source.stream] : []));
  if (Native === undefined || streams.length === 0) return () => undefined;

  const Base = Native as unknown as new (url: string | URL, init?: EventSourceInit) => EventTarget;

  class HeldEventSource extends Base {
    readonly #stream: FlagStream | undefined;
    readonly #held = new Map<Listener, EventListener>();

    constructor(url: string | URL, init?: EventSourceInit) {
      super(url, init);
      this.#stream = streams.find((stream) => stream.claims(String(url)));
    }

    override addEventListener(type: string, listener: Listener | null, options?: Options): void {
      const stream = this.#stream;
      if (stream === undefined || typeof listener !== "function") {
        super.addEventListener(type, listener, options);
        return;
      }
      const held = (event: Event) => {
        const { data } = event as MessageEvent<string>;
        const next = stream.event(type, data, flags);
        if (next === undefined) return;
        listener.call(this, next === data ? event : new MessageEvent(type, { data: next }));
      };
      this.#held.set(listener, held);
      super.addEventListener(type, held, options);
    }

    override removeEventListener(type: string, listener: Listener | null, options?: Options): void {
      const held = listener === null ? undefined : this.#held.get(listener);
      super.removeEventListener(type, held ?? listener, options);
    }
  }

  globalThis.EventSource = HeldEventSource as unknown as typeof EventSource;
  return () => {
    globalThis.EventSource = Native;
  };
}
