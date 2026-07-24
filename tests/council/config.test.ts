import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configLocationForPortable, persistRememberedRoster } from "../../extensions/council/lib/config.js";
import { providerInvokeRoute } from "../../extensions/council/lib/routes.js";

describe("remembered roster persistence", () => {
  it("detects a concurrent remembered-roster write after invocation starts", () => {
    const root = mkdtempSync(join(tmpdir(), "council-config-"));
    const configHome = join(root, "config");
    const remembered = join(configHome, "council", "roster.v1.json");
    const route = providerInvokeRoute("claude", true);
    const location = configLocationForPortable(root, "explicit.json", { AISYNTH_CONFIG_HOME: configHome });
    const roster = {
      version: 1 as const,
      updatedAt: new Date().toISOString(),
      scope: "explicit" as const,
      entries: [
        { id: "entry_aaaaaaaaaaaaaaaaaaaaaaaaaa", route: route.ref, role: "architect" as const, effort: "medium" as const, enabled: true },
        { id: "entry_bbbbbbbbbbbbbbbbbbbbbbbbbb", route: route.ref, role: "risk-critic" as const, effort: "medium" as const, enabled: true }
      ],
      reportStrategy: { kind: "deterministic" as const }
    };
    mkdirSync(join(configHome, "council"), { recursive: true });
    writeFileSync(remembered, "{}\n");
    const result = persistRememberedRoster(location, roster);
    expect(result).toEqual({ written: false, warning: "portable_remembered_concurrent_write" });
  });
});
