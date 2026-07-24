import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("council usefulness evidence", () => {
  it("matches the fixed set and scorecard", () => {
    const result = spawnSync(process.execPath, ["scripts/check-council-usefulness.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("3 samples");
  });
});
