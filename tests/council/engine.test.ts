import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCouncil } from "../../extensions/council/lib/engine.js";
import { issueSnapshot } from "../../extensions/council/lib/input.js";
import { providerInvokeRoute } from "../../extensions/council/lib/routes.js";

describe("Phase 5 council engine", () => {
  it("runs critique, steelman, adversary, and engine-owned JSON retries", async () => {
    const route = providerInvokeRoute("claude", true);
    const root = mkdtempSync(join(tmpdir(), "council-engine-"));
    const counter = join(root, "calls.log");
    const roster = {
      version: 1 as const,
      updatedAt: new Date().toISOString(),
      scope: "explicit" as const,
      entries: [
        { id: "entry_architect", route: route.ref, role: "architect" as const, effort: "high" as const, enabled: true },
        { id: "entry_critic", route: route.ref, role: "risk-critic" as const, effort: "medium" as const, enabled: true }
      ],
      reportStrategy: { kind: "deterministic" as const }
    };
    const result = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("Choose a safe implementation approach"),
      roster,
      routes: [route],
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env: {
        ...process.env,
        AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke"),
        AISYNTH_FAKE_MALFORMED_ONCE: "1",
        AISYNTH_FAKE_REQUIRE_SYNTHESIS_BRIEF: "1",
        AISYNTH_FAKE_COUNTER: counter
      }
    });
    expect(result.ok).toBe(true);
    expect(result.report?.phase_findings.critique.length).toBeGreaterThan(0);
    expect(result.report?.phase_findings.steelman.length).toBeGreaterThan(0);
    expect(result.report?.phase_findings.adversary.length).toBeGreaterThan(0);
    expect(result.diagnostics.filter((item) => item.startsWith("engine_json_retry:")).length).toBeGreaterThanOrEqual(4);
    expect(result.report?.decision_readiness).toBe("conditional");
  });

  it("does not add an engine retry for adapter-owned routes", async () => {
    const route = { ...providerInvokeRoute("claude", true), structuredOutput: { retryOwner: "adapter" as const, maxProviderCalls: 2 as const, verifiedBy: ["fake"] } };
    const root = mkdtempSync(join(tmpdir(), "council-adapter-retry-"));
    const counter = join(root, "calls.log");
    const roster = {
      version: 1 as const,
      updatedAt: new Date().toISOString(),
      scope: "explicit" as const,
      entries: [
        { id: "entry_a", route: route.ref, role: "architect" as const, effort: "medium" as const, enabled: true },
        { id: "entry_b", route: route.ref, role: "risk-critic" as const, effort: "medium" as const, enabled: true }
      ],
      reportStrategy: { kind: "deterministic" as const }
    };
    const result = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("Choose a safe implementation approach"),
      roster,
      routes: [route],
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env: {
        ...process.env,
        AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke"),
        AISYNTH_FAKE_MALFORMED_ONCE: "1",
        AISYNTH_FAKE_COUNTER: counter
      }
    });
    expect(result.ok).toBe(false);
    expect(result.terminalReport?.reason).toBe("all_initial_voices_failed");
    expect(result.diagnostics.some((item) => item.startsWith("engine_json_retry:"))).toBe(false);
  });

  it("writes a terminal report when the run is canceled", async () => {
    const route = providerInvokeRoute("claude", true);
    const root = mkdtempSync(join(tmpdir(), "council-cancel-"));
    const controller = new AbortController();
    controller.abort("canceled");
    const result = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("Choose a safe implementation approach"),
      roster: {
        version: 1,
        updatedAt: new Date().toISOString(),
        scope: "explicit",
        entries: [
          { id: "entry_a", route: route.ref, role: "architect", effort: "medium", enabled: true },
          { id: "entry_b", route: route.ref, role: "risk-critic", effort: "medium", enabled: true }
        ],
        reportStrategy: { kind: "deterministic" }
      },
      routes: [route],
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      signal: controller.signal
    });
    expect(result.ok).toBe(false);
    expect(result.terminalReport?.status).toBe("canceled");
    expect(result.terminalReport?.implementation_authorized).toBe(false);
  });
});
