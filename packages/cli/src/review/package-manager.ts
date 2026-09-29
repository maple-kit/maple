/**
 * Which package manager runs the app's `dev` script.
 *
 * The lockfile is what names it: it is the one file a team keeps in step with
 * the tool they use. It is searched for upward, since a workspace's lockfile
 * sits at the root and the app is a folder inside it. The `packageManager`
 * field is only the tiebreak when no lockfile exists yet.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

/** A package manager `maple review` can run a script with. */
export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

/** Lockfile names, in the order they are believed when a folder somehow has two. */
const LOCKFILES: readonly (readonly [file: string, manager: PackageManager])[] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];

function fromField(cwd: string): PackageManager | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
      packageManager?: unknown;
    };
    const name = typeof manifest.packageManager === "string" ? manifest.packageManager : "";
    return LOCKFILES.map(([, manager]) => manager).find((manager) =>
      name.startsWith(`${manager}@`),
    );
  } catch {
    return undefined;
  }
}

/** The manager whose lockfile is nearest to `cwd`, else the one `package.json` names, else npm. */
export function detectPackageManager(cwd: string): PackageManager {
  const { root } = parse(cwd);
  for (let dir = cwd; ; dir = dirname(dir)) {
    const found = LOCKFILES.find(([file]) => existsSync(join(dir, file)));
    if (found !== undefined) return found[1];
    if (dir === root) break;
  }
  return fromField(cwd) ?? "npm";
}

/** The command and arguments that run a package script. `yarn dev` and `bun run dev` alike. */
export function scriptCommand(
  manager: PackageManager,
  script: string,
): { command: string; args: string[] } {
  return { command: manager, args: ["run", script] };
}
