import { Maple } from "@maple-kit/ui/maple";

import {
  GateNotice,
  MetricRow,
  ReviewTable,
  SettingsForm,
  SideNav,
  ThroughputChart,
} from "./app/components.js";

// The branch under review. A real deployment reads this from whatever its CI
// stamped into the build; the example takes it from the env or falls back.
const BRANCH = import.meta.env.VITE_MAPLE_BRANCH ?? "feat/example";

export function App() {
  return (
    <div className="shell">
      <SideNav />
      <main>
        <header className="page-head">
          <h1>Review overview</h1>
          <p>Everything on this page is a named component, so every pick has something to say.</p>
        </header>
        <MetricRow />
        <div className="split">
          <ThroughputChart />
          <GateNotice />
        </div>
        <ReviewTable />
        <SettingsForm />
      </main>
      <Maple branch={BRANCH} />
    </div>
  );
}
