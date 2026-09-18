"use client";

import { useState } from "react";

/** A client component, so the client bundle is exercised too. */
export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}
