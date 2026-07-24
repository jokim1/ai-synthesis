import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../extensions/council/cli.js";
import { providerInvokeRoute } from "../../extensions/council/lib/routes.js";

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

afterEach(() => {
  process.chdir(originalCwd);
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("portable intent lifecycle", () => {
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
        { id: "entry_a", route: route.ref, role: "architect", effort: "medium", enabled: true },
        { id: "entry_b", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
      ],
      reportStrategy: { kind: "deterministic" }
    }));
    process.chdir(root);
    process.env.AISYNTH_CONFIG_HOME = configHome;
    process.env.AISYNTH_COUNCIL_FAKE_ROUTES = JSON.stringify({ version: 1, routes: [route], diagnostics: [] });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await main(["--issue", "A or B", "--roster-file", rosterPath, "--json"], originalCwd)).toBe(2);
    const intentDir = join(root, ".ai-synthesis", "council-intents");
    const intentFile = join(intentDir, readdirSync(intentDir).find((name) => name.endsWith(".json")) as string);
    const intent = JSON.parse(readFileSync(intentFile, "utf8"));
    const changedRoute = { ...route, limits: { ...route.limits, maxTokens: 4096 } };
    process.env.AISYNTH_COUNCIL_FAKE_ROUTES = JSON.stringify({ version: 1, routes: [changedRoute], diagnostics: [] });
    expect(await main(["--roster-file", rosterPath, "--intent", intent.id, "--ack-long-run", intent.ackLongRunToken, "--json"], originalCwd)).toBe(2);
    expect(existsSync(intentFile)).toBe(false);
    expect(existsSync(join(configHome, "council", "roster.v1.json"))).toBe(false);
  });
});
