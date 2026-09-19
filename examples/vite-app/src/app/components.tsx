/**
 * The demo's own components, each a real one with a real name.
 *
 * The tagger records the component a clicked element came from, and the
 * anchor cascade re-finds it by that name after a deploy. A page of bare
 * `div`s exercises neither: every part of this page is a named component, and
 * two of them carry `data-maple-label` so a reviewer reads "the yield card"
 * rather than the component's own spelling.
 */

import { METRICS, ROWS, WEEKS } from "./data.js";

import type { Metric, Row } from "./data.js";
import type { ReactNode } from "react";

export function MetricCard({ metric }: { readonly metric: Metric }) {
  const rising = metric.delta >= 0;

  return (
    <article className="card metric">
      <h3>{metric.name}</h3>
      <p className="metric-value">{metric.value}</p>
      <p className={rising ? "delta up" : "delta down"}>
        {rising ? "▲" : "▼"} {Math.abs(metric.delta).toFixed(1)}%
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

export function ThroughputChart() {
  const peak = Math.max(...WEEKS);

  return (
    <article className="card chart" data-maple-label="the throughput chart">
      <h3>Reviews merged, by week</h3>
      <div className="bars" role="img" aria-label="Twelve weeks of merged reviews, rising">
        {WEEKS.map((count, week) => (
          <span
            key={week}
            className="bar"
            style={{ height: `${String(Math.round((count / peak) * 100))}%` }}
          />
        ))}
      </div>
      <p className="metric-note">Twelve weeks. The gate landed in week seven.</p>
    </article>
  );
}

export function ReviewTable() {
  return (
    <article className="card table-card">
      <h3>Open reviews</h3>
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
      <td className="mono">{row.branch}</td>
      <td>
        <span className={`pip ${row.state}`} /> {row.open}
      </td>
      <td>{row.reviewer}</td>
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

export function SideNav() {
  const items = ["Overview", "Reviews", "Agents", "Connectors", "Settings"];

  return (
    <nav className="sidenav" aria-label="Sections">
      <p className="brand">Maple demo</p>
      <ul>
        {items.map((item, index) => (
          <li key={item} className={index === 0 ? "here" : undefined}>
            {item}
          </li>
        ))}
      </ul>
    </nav>
  );
}
