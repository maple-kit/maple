import {
  GateNotice,
  MetricRow,
  ReviewTable,
  SettingsForm,
  SideNav,
  ThroughputChart,
  TopBar,
} from "./app/components.js";

import type { ReactNode } from "react";

/** The page, with whatever Maple mounts beside it: the overlay, or the mock box alone. */
export function App({ overlay }: { readonly overlay: ReactNode }) {
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
      {overlay}
    </div>
  );
}
