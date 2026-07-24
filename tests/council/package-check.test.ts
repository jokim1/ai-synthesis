import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("package changed-surface gate", () => {
  it("treats council launchers as Node surface", () => {
    const result = spawnSync(process.execPath, ["scripts/run-package-check.mjs", "typecheck"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, PIPELANE_CHANGED_FILES: "bin/council\nbin/council-route-probe\n" }
    });
    expect(result.stdout).not.toContain("CHECK_SKIPPED_NON_NODE_SURFACE");
    expect(result.status).toBe(0);
  });
});
