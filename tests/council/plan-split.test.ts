import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("council plan split", () => {
  it("binds generated subplans to governing sections and status", () => {
    const result = spawnSync(process.execPath, ["scripts/check-council-plan-split.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    expect(result.status, result.stderr).toBe(0);
  });
});
