import "./mock.js";

import { Maple } from "@maple-kit/ui/maple";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";

import "./app/app.css";

// The branch under review. A real deployment reads this from whatever its CI
// stamped into the build; the example takes it from the env or falls back.
const BRANCH = import.meta.env.VITE_MAPLE_BRANCH ?? "feat/example";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App overlay={<Maple branch={BRANCH} />} />
    </StrictMode>,
  );
}
