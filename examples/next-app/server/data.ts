/**
 * The fixed data the procedures answer with. There is no database: the point
 * of the example is the wire between the page and its server, not storage.
 */

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly createdAt: Date;
}

export interface User {
  readonly id: string;
  readonly name: string;
  readonly since: Date;
}

export const PROJECTS: readonly Project[] = [
  { id: "p_1", name: "Atlas", owner: "Ada", createdAt: new Date("2026-03-02T09:00:00Z") },
  { id: "p_2", name: "Borealis", owner: "Grace", createdAt: new Date("2026-04-18T14:30:00Z") },
  { id: "p_3", name: "Cirrus", owner: "Linus", createdAt: new Date("2026-06-07T08:15:00Z") },
  { id: "p_4", name: "Dune", owner: "Barbara", createdAt: new Date("2026-08-21T17:45:00Z") },
];

export const ME: User = { id: "u_1", name: "Ada", since: new Date("2025-11-05T10:00:00Z") };
