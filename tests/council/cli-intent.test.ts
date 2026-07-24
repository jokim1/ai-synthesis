import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, shellQuote } from "../../extensions/council/cli.js";
import { spawnSync } from "node:child_process";
import { providerInvokeRoute } from "../../extensions/council/lib/routes.js";

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

afterEach(() => {
  process.chdir(originalCwd);
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("portable intent lifecycle", () => {
  it("quotes generated shell arguments without expansion", () => {
    const value = "a'$(printf injected)`id`$HOME";
    const result = spawnSync("/bin/sh", ["-c", `printf '%s' ${shellQuote(value)}`], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(value);
  });

  it("rejects and deletes an intent when the fresh route contract changes", async () => {
    const root = mkdtempSync(join(tmpdir(), "council-intent-cli-"));
    const configHome = join(root, "config");
    const route = providerInvokeRoute("claude", true);
    const rosterPath = join(root, "roster.json");
    writeFileSync(rosterPath, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      scope: "explicit",
      entries: [
        { id: "entry_aaaaaaaaaaaaaaaaaaaaaaaaaa", route: route.ref, role: "architect", effort: "medium", enabled: true },
        { id: "entry_bbbbbbbbbbbbbbbbbbbbbbbbbb", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
      ],
      reportStrategy: { kind: "deterministic" }
    }));
    process.chdir(root);
    process.env.AISYNTH_CONFIG_HOME = configHome;
    process.env.AISYNTH_COUNCIL_FAKE_ROUTES = JSON.stringify({ version: 1, routes: [route], diagnostics: [] });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await main(["--issue", "A or B", "--roster-file", rosterPath, "--json"], originalCwd)).toBe(2);
    expect(log.mock.calls.flat().join("\n")).toContain(rosterPath);
    const intentDir = join(root, ".ai-synthesis", "council-intents");
    const intentFile = join(intentDir, readdirSync(intentDir).find((name) => name.endsWith(".json")) as string);
    const intent = JSON.parse(readFileSync(intentFile, "utf8"));
    const changedRoute = { ...route, limits: { ...route.limits, maxTokens: 4096 } };
    process.env.AISYNTH_COUNCIL_FAKE_ROUTES = JSON.stringify({ version: 1, routes: [changedRoute], diagnostics: [] });
    expect(await main(["--intent", intent.id, "--ack-long-run", intent.ackLongRunToken, "--json"], originalCwd)).toBe(2);
    expect(existsSync(intentFile)).toBe(false);
    expect(existsSync(join(configHome, "council", "roster.v1.json"))).toBe(false);
  });

  it("requires explicit acceptance when a plan changes after snapshot", async () => {
    const root = mkdtempSync(join(tmpdir(), "council-plan-drift-"));
    const packageRoot = join(root, "package");
    mkdirSync(join(packageRoot, "bin", "adapters"), { recursive: true });
    writeFileSync(join(packageRoot, "bin", "adapters", "claude.sh"), '--tools "" --permission-mode dontAsk --no-session-persistence --strict-mcp-config --setting-sources local --disable-slash-commands\n');
    const probe = join(packageRoot, "bin", "provider-probe");
    writeFileSync(probe, '#!/bin/sh\nprintf changed > "$AISYNTH_TEST_PLAN"\nprintf \'{"ok":true,"status":"ok","text":"ready"}\\n\'\n');
    chmodSync(probe, 0o755);
    const route = providerInvokeRoute("claude", true);
    const planPath = join(root, "plan.md");
    const rosterPath = join(root, "roster.json");
    writeFileSync(planPath, "original plan\n");
    writeFileSync(rosterPath, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      scope: "explicit",
      entries: [
        { id: "entry_aaaaaaaaaaaaaaaaaaaaaaaaaa", route: route.ref, role: "architect", effort: "medium", enabled: true },
        { id: "entry_bbbbbbbbbbbbbbbbbbbbbbbbbb", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
      ],
      reportStrategy: { kind: "deterministic" }
    }));
    process.chdir(root);
    process.env.AISYNTH_CONFIG_HOME = join(root, "config");
    process.env.AISYNTH_TEST_PLAN = planPath;
    delete process.env.AISYNTH_COUNCIL_FAKE_ROUTES;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await main(["--plan-file", planPath, "--roster-file", rosterPath, "--json"], packageRoot)).toBe(2);
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("stale_input_confirmation_required");
    expect(output).toContain("acceptStaleInputSha");
    expect(output).toContain(rosterPath);
    expect(output).toContain(planPath);
    expect(output).toContain("resnapshot");
    expect(existsSync(join(root, "config", "council", "roster.v1.json"))).toBe(false);
  });
});
