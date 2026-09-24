/**
 * The demo's own components, each a real one with a real name.
 *
 * The tagger records the component a clicked element came from, and the
 * anchor cascade re-finds it by that name after a deploy. A page of bare
 * `div`s exercises neither: every part of this page is a named component, and
 * two of them carry `data-maple-label` so a reviewer reads "the yield card"
 * rather than the component's own spelling.
 */

import { GATE_WEEK, METRICS, ROWS, WEEKS } from "./data.js";

import type { Metric, Row } from "./data.js";
import type { ReactNode } from "react";

export function MetricCard({ metric }: { readonly metric: Metric }) {
  const rising = metric.delta >= 0;

  return (
    <article className="card metric">
      <h3>{metric.name}</h3>
      <p className="metric-value">{metric.value}</p>
      <p className={rising ? "delta up" : "delta down"}>
        <span aria-hidden="true">{rising ? "↑" : "↓"}</span> {Math.abs(metric.delta).toFixed(1)}%
      </p>
      <p className="metric-note">{metric.note}</p>
    </article>
  );
}

export function MetricRow() {
  return (
    <section className="metrics" aria-label="This month">
      {METRICS.map((metric) => (
        <MetricCard key={metric.name} metric={metric} />
      ))}
    </section>
  );
}

/** Round numbers the axis is drawn at, top first. */
const TICKS = [40, 20, 0];

export function ThroughputChart() {
  const top = TICKS[0] ?? 1;

  return (
    <article className="card chart" data-maple-label="the throughput chart">
      <header className="card-head">
        <h3>Reviews merged, by week</h3>
        <span className="legend">
          <span className="swatch" /> merged
        </span>
      </header>
      <div className="plot">
        <ol className="axis" aria-hidden="true">
          {TICKS.map((tick) => (
            <li key={tick}>{tick}</li>
          ))}
        </ol>
        <div className="bars" role="img" aria-label="Twelve weeks of merged reviews, rising">
          {WEEKS.map((count, week) => (
            <span
              key={week}
              className={week >= GATE_WEEK ? "bar gated" : "bar"}
              style={{ height: `${String(Math.min(100, Math.round((count / top) * 100)))}%` }}
            />
          ))}
        </div>
      </div>
      <p className="metric-note">Twelve weeks. The gate landed in week seven.</p>
    </article>
  );
}

export function ReviewTable() {
  return (
    <article className="card table-card">
      <header className="card-head">
        <h3>Open reviews</h3>
        <span className="count">{ROWS.length}</span>
      </header>
      <table>
        <thead>
          <tr>
            <th>Repository</th>
            <th>Branch</th>
            <th>Open</th>
            <th>Reviewer</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <ReviewRow key={row.branch} row={row} />
          ))}
        </tbody>
      </table>
    </article>
  );
}

function ReviewRow({ row }: { readonly row: Row }) {
  return (
    <tr>
      <td className="mono">{row.repo}</td>
      <td>
        <span className="branch mono">{row.branch}</span>
      </td>
      <td className="num">
        <span className={`pip ${row.state}`} /> {row.open}
      </td>
      <td>
        <span className="person">
          <span className={`avatar tint-${String(row.tint)}`} aria-hidden="true">
            {row.reviewer.charAt(0)}
          </span>
          {row.reviewer}
        </span>
      </td>
    </tr>
  );
}

export function GateNotice() {
  return (
    <aside className="card notice" data-maple-label="the gate notice" role="note">
      <h3>The merge gate is on</h3>
      <p>
        A pull request with an open comment is held at <code>in_progress</code> until an agent
        resolves it or a reviewer closes it. This paragraph is long enough to select part of, which
        is what the text pick is for.
      </p>
      <p className="check">
        <span className="pip waiting" /> maple/visual-review
      </p>
    </aside>
  );
}

export function SettingsForm() {
  return (
    <article className="card form-card">
      <h3>Notifications</h3>
      <form onSubmit={(event) => event.preventDefault()}>
        <Field label="Email digest">
          <select defaultValue="daily">
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
        <Field label="Only what is assigned to me">
          <input type="checkbox" defaultChecked />
        </Field>
        <Field label="Reply address">
          <input type="email" defaultValue="reviews@example.test" />
        </Field>
        <button type="submit">Save</button>
      </form>
    </article>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** One stroke glyph per section, drawn on a 16px grid. */
const ICONS: Readonly<Record<string, string>> = {
  Overview: "M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5h-4.5zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5h-4.5z",
  Reviews: "M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z",
  Agents: "M4 6.5h8v6.5h-8zM8 3.5v3M6.5 9.5h.01M9.5 9.5h.01",
  Connectors: "M5.5 5.5l5 5M3 7l4-4 2 2-4 4zM13 9l-4 4-2-2 4-4z",
  Settings: "M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2",
};

export function SideNav() {
  const items = ["Overview", "Reviews", "Agents", "Connectors", "Settings"];

  return (
    <nav className="sidenav" aria-label="Sections">
      <p className="brand">
        <span className="logo" aria-hidden="true" />
        Acme
      </p>
      <ul>
        {items.map((item, index) => (
          <li key={item} className={index === 0 ? "here" : undefined}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d={ICONS[item]} />
            </svg>
            {item}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The bar above the page: where you are, and who you are. */
export function TopBar() {
  return (
    <div className="topbar">
      <p className="crumbs">
        maple-kit <span aria-hidden="true">/</span> <strong>Overview</strong>
      </p>
      <div className="topbar-end">
        <span className="range">Last 28 days</span>
        <span className="avatar tint-0 me" aria-label="Ada">
          A
        </span>
      </div>
    </div>
  );
}
