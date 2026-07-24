import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("portable imports", () => {
  it("rejects Pi package imports in portable council modules", () => {
    const result = spawnSync(process.execPath, ["scripts/check-council-portable-imports.mjs"], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status).toBe(0);
  });
});
