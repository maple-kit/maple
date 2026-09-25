"use client";

import { useEffect, useState } from "react";

import { trpc } from "./trpc";
import { useCall } from "./use-call";

import type { Loaded } from "./use-call";

// Formatting a string throws, so a date that lost its type on the way cannot
// pass for one here.
const DAY = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

const listProjects = (signal: AbortSignal) => trpc.project.list.query(undefined, { signal });
const countProjects = (signal: AbortSignal) => trpc.project.count.query(undefined, { signal });
const slowCall = (signal: AbortSignal) => trpc.project.slow.query(undefined, { signal });
const whoAmI = (signal: AbortSignal) => trpc.user.me.query(undefined, { signal });

type Projects = Awaited<ReturnType<typeof listProjects>>;

/** Every query the page makes, started together; all but `user.me` share a batch. */
export function Projects() {
  const projects = useCall(listProjects);
  const count = useCall(countProjects);
  const slow = useCall(slowCall);
  const me = useCall(whoAmI);

  return (
    <>
      <header className="bar">
        <Session me={me} />
        <LiveTicks />
      </header>
      <section className="card">
        <header className="card-head">
          <h2>Projects</h2>
          {projects.state === "ready" && <span className="count">{projects.data.total}</span>}
        </header>
        <ProjectTable projects={projects} />
      </section>
      <footer className="bar quiet">
        <span>
          <span data-testid="count" data-ms={count.state === "ready" ? Math.round(count.ms) : ""}>
            {count.state === "ready" ? `${String(count.data)} on the server. ` : ""}
          </span>
          <span data-testid="slow">
            {slow.state === "ready"
              ? `The slow call answered after ${String(Math.round(slow.ms))} ms.`
              : "Waiting for the slow call…"}
          </span>
        </span>
        {me.state === "ready" && me.data.role !== "viewer" && <CreateProject />}
      </footer>
    </>
  );
}

function Session({ me }: { readonly me: Loaded<Awaited<ReturnType<typeof whoAmI>>> }) {
  if (me.state === "loading") return <span data-testid="me">Signing in…</span>;
  if (me.state === "failed") return <span data-testid="me">Not signed in.</span>;
  return (
    <span data-testid="me">
      Signed in as <strong>{me.data.name}</strong> ({me.data.role}), with us since{" "}
      {DAY.format(me.data.since)}.
    </span>
  );
}

function ProjectTable({ projects }: { readonly projects: Loaded<Projects> }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Owner</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {projects.state === "ready" &&
          projects.data.items.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.owner}</td>
              <td className="mono">{DAY.format(row.createdAt)}</td>
            </tr>
          ))}
        <Notice projects={projects} />
      </tbody>
    </table>
  );
}

/** What the table says when it has no rows to show, and why. */
function Notice({ projects }: { readonly projects: Loaded<Projects> }) {
  const notice = noticeFor(projects);
  if (notice === undefined) return null;
  return (
    <tr>
      <td colSpan={3} className={`notice ${notice.tone}`} data-testid="notice">
        {notice.text}
      </td>
    </tr>
  );
}

function noticeFor(projects: Loaded<Projects>): { text: string; tone: string } | undefined {
  if (projects.state === "loading") return { text: "Loading projects…", tone: "quiet" };
  if (projects.state === "failed" && projects.status === 403) {
    return { text: "You do not have access to these projects.", tone: "bad" };
  }
  if (projects.state === "failed") return { text: "Projects could not be loaded.", tone: "bad" };
  if (projects.data.items.length === 0) return { text: "No projects yet.", tone: "quiet" };
  return undefined;
}

/** A tick a second from the subscription, so a stalled stream is visible. */
function LiveTicks() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const subscription = trpc.activity.onEvent.subscribe(undefined, {
      onData: (event) => setTick(event.tick),
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <span className="live" data-testid="live">
      <span className="dot" aria-hidden="true" /> {tick} live
    </span>
  );
}

/** A mutation, which goes through unless a recipe names it. */
function CreateProject() {
  const [result, setResult] = useState("");

  const create = () => {
    trpc.project.create.mutate().then(
      (created) => setResult(`Created ${created.id}.`),
      () => setResult("Could not create a project."),
    );
  };

  return (
    <span>
      <button type="button" onClick={create}>
        New project
      </button>{" "}
      <span data-testid="created">{result}</span>
    </span>
  );
}
