"use client";

/**
 * The mock box alone, with no review overlay: `m` opens it. `MAPLE_MOCK` is
 * inlined, so every build but a preview and `next dev` drops the import.
 */

import dynamic from "next/dynamic";

const MapleMock =
  process.env.MAPLE_MOCK === "1"
    ? dynamic(() => import("@maple-kit/ui/mock").then((module) => module.MapleMock), {
        ssr: false,
      })
    : undefined;

export function MockBox() {
  return MapleMock === undefined ? null : <MapleMock />;
}
