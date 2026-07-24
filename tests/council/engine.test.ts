import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
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
        AISYNTH_FAKE_REQUIRE_ROLE_TEMPLATE: "1",
        AISYNTH_FAKE_COUNTER: counter
      }
    });
    expect(result.ok).toBe(true);
    expect(result.report?.phase_findings.critique.length).toBeGreaterThan(0);
    expect(result.report?.phase_findings.steelman.length).toBeGreaterThan(0);
    expect(result.report?.phase_findings.adversary.length).toBeGreaterThan(0);
    expect(result.report?.position_groups[0]).toMatchObject({
      canonicalPositionId: "other:approve",
      supporterMemberIds: ["entry_architect", "entry_critic"]
    });
    expect(result.report?.position_groups[0].steelmans.length).toBeGreaterThan(0);
    expect(result.report?.position_groups[0].objections.length).toBeGreaterThan(0);
    expect(result.diagnostics.filter((item) => item.startsWith("engine_json_retry:")).length).toBeGreaterThanOrEqual(4);
    expect(result.report?.decision_readiness).toBe("conditional");
    expect(result.diagnostics).toContain(`resolved_model: ${route.ref.routeId}=claude-fixture-resolved (provider_envelope)`);
    const markdown = readFileSync(result.reportPath as string, "utf8");
    expect(markdown).toContain(`${route.ref.routeId}:claude-fixture-resolved`);
    expect(markdown).toContain("initial_prompt_hashes:");
    expect(markdown).toContain("position_catalog_sha256:");
    expect(markdown).toContain("critique_prompt_hashes:");
    expect(markdown).toContain("assumption_review_catalog_sha256:");
    expect(markdown).toContain("Deterministic synthesis was produced by auditable aggregation code, not another model voice.");
    expect(result.diagnostics.filter((item) => item.startsWith("initial_prompt_hash:")).length).toBe(2);
    expect(result.diagnostics.filter((item) => item.startsWith("critique_prompt_hash:")).length).toBe(1);
    expect(result.diagnostics.find((item) => item.startsWith("phase_lane_plan: initial_analysis"))).toContain(
      `${route.executionLaneKey}(width=1,members=2)`
    );
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

  it("degrades readiness when one selected later-phase member fails", async () => {
    const base = providerInvokeRoute("claude", true);
    const routes = ["a", "b", "c"].map((suffix) => ({
      ...base,
      ref: { ...base.ref, routeId: `${base.ref.routeId}:${suffix}`, model: `${base.ref.model}-${suffix}` }
    }));
    const root = mkdtempSync(join(tmpdir(), "council-partial-phase-"));
    const result = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("approve or reject"),
      roster: {
        version: 1,
        updatedAt: new Date().toISOString(),
        scope: "explicit",
        entries: [
          { id: "entry_a", route: routes[0].ref, role: "architect", effort: "medium", enabled: true },
          { id: "entry_b", route: routes[1].ref, role: "steelman", effort: "medium", enabled: true },
          { id: "entry_c", route: routes[2].ref, role: "steelman", effort: "medium", enabled: true }
        ],
        reportStrategy: { kind: "deterministic" }
      },
      routes,
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env: {
        ...process.env,
        AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke"),
        AISYNTH_FAKE_FAIL_KEY: "council-steelman.json:entry_c"
      }
    });
    expect(result.ok).toBe(true);
    expect(result.report?.decision_readiness).toBe("conditional");
    expect(result.diagnostics).toContain("steelman degraded for entry_c");
  });

  it("does not let chair synthesis upgrade mechanical readiness", async () => {
    const base = providerInvokeRoute("claude", true);
    const second = { ...base, ref: { ...base.ref, routeId: `${base.ref.routeId}:second`, model: `${base.ref.model}-second` } };
    const root = mkdtempSync(join(tmpdir(), "council-chair-cap-"));
    const result = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("approve or reject"),
      roster: {
        version: 1,
        updatedAt: new Date().toISOString(),
        scope: "explicit",
        entries: [
          { id: "entry_a", route: base.ref, role: "chair", effort: "medium", enabled: true },
          { id: "entry_b", route: second.ref, role: "risk-critic", effort: "medium", enabled: true }
        ],
        reportStrategy: { kind: "chair", chairEntryId: "entry_a" }
      },
      routes: [base, second],
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env: {
        ...process.env,
        AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke"),
        AISYNTH_FAKE_POSITION_BY_MEMBER: JSON.stringify({ entry_a: "issue_option_1", entry_b: "issue_option_2" }),
        AISYNTH_FAKE_CHAIR_READINESS: "ready"
      }
    });
    expect(result.ok).toBe(true);
    expect(result.report?.decision_readiness).toBe("not_ready");
  });

  it("rejects critique output that omits supplied assumptions", async () => {
    const route = providerInvokeRoute("claude", true);
    const root = mkdtempSync(join(tmpdir(), "council-critique-coverage-"));
    const result = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("Goal one\nConstraint two\nDecision three"),
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
      env: {
        ...process.env,
        AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke"),
        AISYNTH_FAKE_PARTIAL_CRITIQUE: "1"
      }
    });
    expect(result.ok).toBe(true);
    expect(result.report?.decision_readiness).toBe("conditional");
    expect(result.diagnostics.some((item) => item.includes("missing assumption reviews"))).toBe(true);
  });

  it("caps distinct routes that share one execution lane", async () => {
    const base = providerInvokeRoute("claude", true);
    const second = { ...base, ref: { ...base.ref, routeId: `${base.ref.routeId}:second`, model: "second" } };
    const root = mkdtempSync(join(tmpdir(), "council-lane-cap-"));
    const result = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("Goal one\nConstraint two\nDecision three"),
      roster: {
        version: 1,
        updatedAt: new Date().toISOString(),
        scope: "explicit",
        entries: [
          { id: "entry_a", route: base.ref, role: "architect", effort: "medium", enabled: true },
          { id: "entry_b", route: second.ref, role: "risk-critic", effort: "medium", enabled: true }
        ],
        reportStrategy: { kind: "deterministic" }
      },
      routes: [base, second],
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env: { ...process.env, AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke") }
    });
    expect(result.report?.decision_readiness).toBe("conditional");
    expect(result.diagnostics.some((item) => item.includes("single_lane"))).toBe(true);
  });

  it("uses the winning voice next action when readiness is ready", async () => {
    const base = providerInvokeRoute("claude", true);
    const second = {
      ...base,
      ref: { ...base.ref, routeId: `${base.ref.routeId}:second`, model: "second" },
      executionLaneKey: `${base.executionLaneKey}:second`
    };
    const root = mkdtempSync(join(tmpdir(), "council-ready-action-"));
    const result = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("Goal one\nConstraint two\nDecision three"),
      roster: {
        version: 1,
        updatedAt: new Date().toISOString(),
        scope: "explicit",
        entries: [
          { id: "entry_a", route: base.ref, role: "architect", effort: "medium", enabled: true },
          { id: "entry_b", route: second.ref, role: "risk-critic", effort: "medium", enabled: true }
        ],
        reportStrategy: { kind: "deterministic" }
      },
      routes: [base, second],
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env: {
        ...process.env,
        AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke"),
        AISYNTH_FAKE_ALL_ASSUMPTIONS_VERIFIED: "1"
      }
    });
    expect(result.report?.decision_readiness).toBe("ready");
    expect(result.report?.next_action).toBe("Start the smallest reversible rollout step");
  });

  it("caps readiness after initial-member or chair failure", async () => {
    const base = providerInvokeRoute("claude", true);
    const routes = ["a", "b", "c"].map((suffix) => ({
      ...base,
      ref: { ...base.ref, routeId: `${base.ref.routeId}:${suffix}`, model: suffix },
      executionLaneKey: `${base.executionLaneKey}:${suffix}`
    }));
    const root = mkdtempSync(join(tmpdir(), "council-critical-failure-"));
    const initialFailure = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("Goal one\nConstraint two\nDecision three"),
      roster: {
        version: 1,
        updatedAt: new Date().toISOString(),
        scope: "explicit",
        entries: [
          { id: "entry_a", route: routes[0].ref, role: "architect", effort: "medium", enabled: true },
          { id: "entry_b", route: routes[1].ref, role: "risk-critic", effort: "medium", enabled: true },
          { id: "entry_c", route: routes[2].ref, role: "product-operator", effort: "medium", enabled: true }
        ],
        reportStrategy: { kind: "deterministic" }
      },
      routes,
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env: {
        ...process.env,
        AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke"),
        AISYNTH_FAKE_FAIL_KEY: "council-voice.json:entry_c"
      }
    });
    expect(initialFailure.report?.decision_readiness).toBe("conditional");

    const chairFailure = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("Goal one\nConstraint two\nDecision three"),
      roster: {
        version: 1,
        updatedAt: new Date().toISOString(),
        scope: "explicit",
        entries: [
          { id: "entry_a", route: routes[0].ref, role: "chair", effort: "medium", enabled: true },
          { id: "entry_b", route: routes[1].ref, role: "risk-critic", effort: "medium", enabled: true }
        ],
        reportStrategy: { kind: "chair", chairEntryId: "entry_a" }
      },
      routes: routes.slice(0, 2),
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env: {
        ...process.env,
        AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke"),
        AISYNTH_FAKE_FAIL_KEY: "council-chair-report.json:entry_a"
      }
    });
    expect(chairFailure.report?.decision_readiness).toBe("conditional");
    expect(chairFailure.diagnostics.some((item) => item.includes("chair synthesis degraded"))).toBe(true);
  });

  it("labels a one-voice report as single-survivor mechanical synthesis", async () => {
    const base = providerInvokeRoute("claude", true);
    const second = {
      ...base,
      ref: { ...base.ref, routeId: `${base.ref.routeId}:second`, model: "second" },
      executionLaneKey: `${base.executionLaneKey}:second`
    };
    const root = mkdtempSync(join(tmpdir(), "council-single-survivor-"));
    const result = await runCouncil({
      cwd: root,
      packageRoot: process.cwd(),
      input: issueSnapshot("Goal one\nConstraint two\nDecision three"),
      roster: {
        version: 1,
        updatedAt: new Date().toISOString(),
        scope: "explicit",
        entries: [
          { id: "entry_a", route: base.ref, role: "architect", effort: "medium", enabled: true },
          { id: "entry_b", route: second.ref, role: "risk-critic", effort: "medium", enabled: true }
        ],
        reportStrategy: { kind: "deterministic" }
      },
      routes: [base, second],
      reportStrategySource: "roster_file",
      rememberedRosterWritten: false,
      env: {
        ...process.env,
        AISYNTH_COUNCIL_PROVIDER_INVOKE: join(process.cwd(), "tests/council/fakes/provider-invoke"),
        AISYNTH_FAKE_FAIL_KEY: "council-voice.json:entry_b"
      }
    });
    const markdown = readFileSync(result.reportPath as string, "utf8");
    expect(markdown).toContain('report_strategy: "single_survivor"');
    expect(markdown).toContain('report_strategy_effective: "single_survivor_mechanical"');
    expect(markdown).toContain('configured_report_strategy: "deterministic"');
  });
});
