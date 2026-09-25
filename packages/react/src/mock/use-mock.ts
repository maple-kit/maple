/**
 * `useMock()`: the mock box's controller, as one subscription.
 *
 * It builds and starts a client for the component's lifetime, or reads one the
 * caller built and owns. Every rule lives in `@maple-kit/mock/client`; this is
 * a `useSyncExternalStore` over it and nothing more.
 */

import { createMockClient } from "@maple-kit/mock/client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { MockClient, MockClientOptions, MockClientState } from "@maple-kit/mock/client";

/** How the hook gets its client. */
export interface UseMockOptions extends MockClientOptions {
  /** A client the caller built, started and destroys. Options are ignored with one. */
  readonly client?: MockClient;
}

/** The state to draw, and the client to call. */
export interface MockBinding {
  readonly state: MockClientState;
  readonly client: MockClient;
}

/** The box's state, re-rendered on every change, and its stable client. */
export function useMock(options: UseMockOptions = {}): MockBinding {
  const { client: given, ...rest } = options;
  const [owned] = useState(() => (given === undefined ? createMockClient(rest) : undefined));
  const client = given ?? owned!;

  useEffect(() => {
    if (owned === undefined) return;
    owned.start();
    return () => owned.destroy();
  }, [owned]);

  const subscribe = useCallback((listener: () => void) => client.subscribe(listener), [client]);
  const read = useCallback(() => client.getState(), [client]);
  const state = useSyncExternalStore(subscribe, read, read);
  return { state, client };
}
