import { existsSync } from "node:fs";
import { configLocationForPortable, loadRosterConfig, persistRememberedRoster } from "./lib/config.js";
import { emitRoster } from "./lib/emit-roster.js";
import { parseCouncilInput } from "./lib/input.js";
import { ackToken, buildRunPlan, requiresAcknowledgment, writeIntent } from "./lib/run-intent.js";
import { selfTest } from "./lib/runtime.js";
import { packageRootFrom } from "./lib/runtime.js";
import { discoverRoutes } from "./lib/routes.js";
import { validateRoster } from "./lib/validate-roster.js";
import { runCouncil } from "./lib/engine.js";
import type { CouncilAuthPolicy, CouncilReportStrategy } from "./lib/types.js";

interface Args {
  command: "run" | "route-probe";
  issue?: string;
  planFile?: string;
  rosterFile?: string;
  emitRoster?: string;
  reportStrategy?: string;
  authPolicy: CouncilAuthPolicy;
  overwrite: boolean;
  json: boolean;
  selfTest: boolean;
  ackLongRun?: string;
  intent?: string;
  positional: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] === "route-probe" ? "route-probe" : "run", authPolicy: "subscription_only", overwrite: false, json: false, selfTest: false, positional: [] };
  const rest = args.command === "route-probe" ? argv.slice(1) : argv;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--issue") args.issue = rest[++i];
    else if (arg === "--plan-file") args.planFile = rest[++i];
    else if (arg === "--roster-file") args.rosterFile = rest[++i];
    else if (arg === "--emit-roster") args.emitRoster = rest[++i];
    else if (arg === "--report-strategy") args.reportStrategy = rest[++i];
    else if (arg === "--auth-policy") {
      const value = rest[++i];
      args.authPolicy = value === "default" ? "default" : "subscription_only";
    } else if (arg === "--overwrite") args.overwrite = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--ack-long-run") args.ackLongRun = rest[++i];
    else if (arg === "--intent") args.intent = rest[++i];
    else if (arg === "-h" || arg === "--help") throw Object.assign(new Error(usage()), { exitCode: 0 });
    else if (arg.startsWith("--")) throw Object.assign(new Error(`unknown option: ${arg}`), { exitCode: 2 });
    else args.positional.push(arg);
  }
  return args;
}

function usage(): string {
  return `usage:
bin/council --issue <text> --emit-roster <path> [--overwrite] [--json]
bin/council --plan-file <path> --emit-roster <path> [--overwrite] [--json]
bin/council --issue <text> --roster-file <path> [--report-strategy deterministic|structured_disagreement|chair:<id>] [--json]
bin/council --plan-file <path> --roster-file <path> [--report-strategy deterministic|structured_disagreement|chair:<id>] [--json]
bin/council --self-test [--json]
bin/council-route-probe --json`;
}

function parseStrategy(value?: string): CouncilReportStrategy | undefined {
  if (!value) return undefined;
  if (value === "deterministic") return { kind: "deterministic" };
  if (value === "structured_disagreement") return { kind: "structured_disagreement" };
  if (value.startsWith("chair:")) return { kind: "chair", chairEntryId: value.slice("chair:".length) };
  throw Object.assign(new Error(`invalid report strategy: ${value}`), { exitCode: 2 });
}

function print(json: boolean, value: unknown, human: string): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(human);
}

export async function main(argv = process.argv.slice(2), packageRoot = packageRootFrom(import.meta.url)): Promise<number> {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  if (args.selfTest) {
    const report = selfTest(packageRoot);
    print(args.json, report, report.ok ? "council runtime ok" : `council runtime failed: ${report.errors.join("; ")}`);
    return report.ok ? 0 : 5;
  }
  if (args.command === "route-probe") {
    const routes = discoverRoutes({ packageRoot, authPolicy: args.authPolicy, env: process.env });
    print(args.json, routes, routes.diagnostics.map((d) => `${d.provider}: ${d.message}`).join("\n"));
    return 0;
  }
  const input = parseCouncilInput({ cwd, issue: args.issue, planFile: args.planFile, positional: args.positional });
  if (args.emitRoster) {
    const result = emitRoster({ cwd, packageRoot, targetPath: args.emitRoster, overwrite: args.overwrite, authPolicy: args.authPolicy, input, env: process.env });
    print(args.json, { ok: true, path: result.path, roster: result.roster, routeProbe: result.routeProbe }, `wrote ${result.path}`);
    return 0;
  }
  const location = configLocationForPortable(cwd, args.rosterFile, process.env);
  const loaded = loadRosterConfig(location);
  if (!loaded.config) {
    const command = `bin/council ${input.kind === "plan" ? `--plan-file ${input.sourcePath}` : `--issue ${JSON.stringify(input.text)}`} --emit-roster ./council-roster.json`;
    print(args.json, { ok: false, status: "validation_failed", exitCode: loaded.diagnostics.includes("no_portable_roster") ? 4 : 3, diagnostics: loaded.diagnostics, next: command }, `no portable roster. Create one with:\n${command}`);
    return loaded.diagnostics.includes("no_portable_roster") ? 4 : 3;
  }
  const routeProbe = discoverRoutes({ packageRoot, authPolicy: args.authPolicy, env: process.env });
  const strategyOverride = parseStrategy(args.reportStrategy);
  const validation = validateRoster({ config: loaded.config, routes: routeProbe.routes, mode: "portable_cli", reportStrategyOverride: strategyOverride, inputSnapshot: input });
  if (!validation.ok) {
    print(args.json, { ok: false, status: "validation_failed", exitCode: 4, diagnostics: validation.blockingProblems, compositionFeedback: validation.compositionFeedback }, validation.blockingProblems.map((p) => p.message).join("\n"));
    return 4;
  }
  const runPlan = buildRunPlan(input, loaded.config, routeProbe.routes);
  if (requiresAcknowledgment(runPlan)) {
    const token = ackToken(input, loaded.config, routeProbe.routes, runPlan);
    if (args.ackLongRun !== token) {
      const intent = writeIntent(cwd, input, loaded.config, routeProbe.routes, runPlan, token);
      print(args.json, { ok: false, status: "ack_required", exitCode: 2, ackLongRun: token, intent, runPlan }, `long-run/cost acknowledgment required. Re-run with --intent ${intent} --ack-long-run ${token}`);
      return 2;
    }
  }
  const persisted = persistRememberedRoster(loaded.location, loaded.config);
  const result = await runCouncil({
    cwd,
    packageRoot,
    input,
    roster: loaded.config,
    routes: routeProbe.routes,
    reportStrategyOverride: strategyOverride,
    reportStrategySource: strategyOverride ? "cli" : "roster_file",
    rememberedRosterWritten: persisted.written,
    env: process.env
  });
  const body = { ok: result.ok, reportPath: result.reportPath, report: result.report, diagnostics: [...result.diagnostics, persisted.warning].filter(Boolean) };
  print(args.json, body, `wrote council report: ${result.reportPath}`);
  return result.ok ? 0 : 5;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code)).catch((error) => {
    const exitCode = Number.isInteger((error as { exitCode?: number }).exitCode) ? (error as { exitCode: number }).exitCode : 1;
    if (exitCode === 0) console.log((error as Error).message);
    else if (process.argv.includes("--json")) console.log(JSON.stringify({ ok: false, status: "error", exitCode, error: (error as Error).message }, null, 2));
    else console.error((error as Error).message);
    process.exit(exitCode);
  });
}
