/**
 * The same page with Maple Mock's box and no review overlay: what a host that
 * only mocks mounts. `pnpm verify` checks this entry carries none of the
 * island, the composer or the marks.
 */

import "./mock.js";

import { MapleMock } from "@maple-kit/ui/mock";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";

import "./app/app.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App overlay={<MapleMock />} />
    </StrictMode>,
  );
}
