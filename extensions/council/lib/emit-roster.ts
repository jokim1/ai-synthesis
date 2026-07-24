import { resolve } from "node:path";
import type { CouncilAuthPolicy, CouncilConfigRootsV1 } from "./types.js";
import { canonicalRememberedPaths, writeRosterExplicit } from "./config.js";
import { discoverRoutes } from "./routes.js";
import { recommendRoster } from "./recommend.js";
import { validateRoster } from "./validate-roster.js";
import type { CouncilInputSnapshotV1 } from "./types.js";

export function emitRoster(opts: {
  cwd: string;
  packageRoot: string;
  targetPath: string;
  overwrite: boolean;
  authPolicy: CouncilAuthPolicy;
  input: CouncilInputSnapshotV1;
  env?: NodeJS.ProcessEnv;
}): { path: string; roster: ReturnType<typeof recommendRoster>; routeProbe: ReturnType<typeof discoverRoutes> } {
  const roots: CouncilConfigRootsV1 = { cwd: opts.cwd, trustedProject: false };
  const target = resolve(opts.cwd, opts.targetPath);
  if (canonicalRememberedPaths(roots, opts.env).includes(target)) {
    throw Object.assign(new Error("--emit-roster refuses canonical remembered roster paths; remembered state is written only after Run"), { exitCode: 2 });
  }
  const routeProbe = discoverRoutes({ packageRoot: opts.packageRoot, authPolicy: opts.authPolicy, env: opts.env });
  const roster = recommendRoster(opts.input, routeProbe.routes, "explicit");
  const validation = validateRoster({ config: roster, routes: routeProbe.routes, mode: "portable_cli", inputSnapshot: opts.input });
  if (!validation.ok) {
    throw Object.assign(new Error(`cannot emit runnable roster: ${validation.blockingProblems.map((p) => p.message).join("; ")}`), { exitCode: 4, diagnostics: validation.blockingProblems });
  }
  writeRosterExplicit(target, roster, opts.overwrite);
  return { path: target, roster, routeProbe };
}
