/**
 * The demo's own components, each a real one with a real name.
 *
 * The tagger records the component a clicked element came from, and the
 * anchor cascade re-finds it by that name after a deploy. A page of bare
 * `div`s exercises neither: every part of this page is a named component, and
 * two of them carry `data-maple-label` so a reviewer reads "the yield card"
 * rather than the component's own spelling.
 */

import { useState } from "react";

import { useApi } from "./api.js";
import { GATE_WEEK, METRICS, WEEKS } from "./data.js";

import type { Audit, Loaded, Reviews, Session } from "./api.js";
import type { Metric, Row } from "./data.js";
import type { ReactNode, SyntheticEvent } from "react";

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
  const reviews = useApi<Reviews>("/api/reviews");

  return (
    <article className="card table-card">
      <header className="card-head">
        <h3>Open reviews</h3>
        {reviews.state === "ready" && <span className="count">{reviews.data.total}</span>}
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
          {reviews.state === "ready" &&
            reviews.data.items.map((row) => <ReviewRow key={row.id} row={row} />)}
          <ReviewNotice reviews={reviews} />
        </tbody>
      </table>
    </article>
  );
}

/** What the table says when it has no rows to show, and why. */
function ReviewNotice({ reviews }: { readonly reviews: Loaded<Reviews> }) {
  const notice = reviewNotice(reviews);
  if (notice === undefined) return null;
  return (
    <tr>
      <td colSpan={4} className={`table-notice ${notice.tone}`}>
        {notice.text}
      </td>
    </tr>
  );
}

function reviewNotice(reviews: Loaded<Reviews>): { text: string; tone: string } | undefined {
  if (reviews.state === "loading") return { text: "Loading reviews…", tone: "quiet" };
  if (reviews.state === "failed" && reviews.status === 403) {
    return { text: "You do not have access to these reviews.", tone: "bad" };
  }
  if (reviews.state === "failed") return { text: "Reviews could not be loaded.", tone: "bad" };
  if (reviews.data.items.length === 0) {
    return { text: "No open reviews. Every preview is clear to merge.", tone: "quiet" };
  }
  return undefined;
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

/** Owners only: the server answers anyone else 403, and the region says so. */
export function AuditLog() {
  const audit = useApi<Audit>("/api/audit");
  return (
    <article className="card table-card" data-maple-label="the audit log">
      <header className="card-head">
        <h3>Audit log</h3>
      </header>
      {audit.state === "ready" && (
        <ul className="audit">
          {audit.data.items.map((event) => (
            <li key={event.id}>
              <strong>{event.who}</strong> {event.what}
            </li>
          ))}
        </ul>
      )}
      {audit.state === "failed" && (
        <p className={`table-notice ${audit.status === 403 ? "quiet" : "bad"}`}>
          {audit.status === 403
            ? "Only owners can see the audit log."
            : "The audit log could not be loaded."}
        </p>
      )}
    </article>
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
  const session = useApi<Session>("/api/session");
  const [saved, setSaved] = useState(false);
  const writable = session.state === "ready" && session.data.permissions.includes("settings.write");
  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    void fetch("/api/settings", { method: "POST", body: "{}" }).then((response) =>
      setSaved(response.ok),
    );
  };

  return (
    <article className="card form-card">
      <h3>Notifications</h3>
      <form onSubmit={save}>
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
        {writable ? (
          <button type="submit">{saved ? "Saved" : "Save"}</button>
        ) : (
          <p className="metric-note">Only someone who may change settings can save these.</p>
        )}
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
  const session = useApi<Session>("/api/session");
  const me = session.state === "ready" ? session.data : undefined;

  return (
    <div className="topbar">
      <p className="crumbs">
        maple-kit <span aria-hidden="true">/</span> <strong>Overview</strong>
      </p>
      <div className="topbar-end">
        <span className="range">Last 28 days</span>
        {me?.role === "owner" && (
          <button type="button" className="invite">
            Invite reviewer
          </button>
        )}
        {me && (
          <span className={`avatar tint-${String(me.tint)} me`} aria-label={me.name}>
            {me.name.charAt(0)}
          </span>
        )}
      </div>
    </div>
  );
}
