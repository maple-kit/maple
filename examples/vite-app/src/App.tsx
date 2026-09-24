import { Maple } from "@maple-kit/ui/maple";

import {
  GateNotice,
  MetricRow,
  ReviewTable,
  SettingsForm,
  SideNav,
  ThroughputChart,
  TopBar,
} from "./app/components.js";
// The branch under review. A real deployment reads this from whatever its CI
// stamped into the build; the example takes it from the env or falls back.
const BRANCH = import.meta.env.VITE_MAPLE_BRANCH ?? "feat/example";

export function App() {
  return (
    <div className="shell">
      <SideNav />
      <main>
        <TopBar />
        <header className="page-head">
          <h1>Review overview</h1>
          <p>Every repository with a preview, over the last 28 days.</p>
        </header>
        <MetricRow />
        <div className="split" data-maple-label="the chart and the gate notice">
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
