import { describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPlanSnapshot } from "../../extensions/council/lib/input.js";

describe("plan input boundaries", () => {
  it("rejects a symlink inside an allowed root that resolves outside it", () => {
    const parent = mkdtempSync(join(tmpdir(), "council-input-"));
    const allowed = join(parent, "allowed");
    mkdirSync(allowed);
    const outside = join(parent, "outside.md");
    writeFileSync(outside, "outside\n");
    const link = join(allowed, "plan.md");
    symlinkSync(outside, link);
    expect(() => loadPlanSnapshot(link, allowed, [allowed])).toThrow("outside allowed roots");
  });

  it("rejects a path-shaped directory instead of treating it as issue text", async () => {
    const { parseCouncilInput } = await import("../../extensions/council/lib/input.js");
    const root = mkdtempSync(join(tmpdir(), "council-directory-"));
    const directory = join(root, "plan");
    mkdirSync(directory);
    expect(() => parseCouncilInput({ cwd: root, positional: ["./plan"] })).toThrow("not a regular file");
  });

  it("wraps explicit missing plan files as validation errors", async () => {
    const { parseCouncilInput } = await import("../../extensions/council/lib/input.js");
    const root = mkdtempSync(join(tmpdir(), "council-missing-plan-"));
    expect(() => loadPlanSnapshot("missing.md", root, [root])).toThrow("plan file is not readable: missing.md");
    expect(() => parseCouncilInput({ cwd: root, planFile: "missing.md" })).toThrow("plan file is not readable: missing.md");
    expect(() => parseCouncilInput({ cwd: root, positional: ["@missing.md"] })).toThrow("plan file is not readable: missing.md");
  });

  it("wraps existing-but-unreadable plan files as exitCode-2 validation errors", () => {
    const root = mkdtempSync(join(tmpdir(), "council-unreadable-plan-"));
    const plan = join(root, "plan.md");
    writeFileSync(plan, "secret plan\n");
    chmodSync(plan, 0o000);
    try {
      expect(() => loadPlanSnapshot(plan, root, [root])).toThrow("plan file is not readable:");
      try {
        loadPlanSnapshot(plan, root, [root]);
        expect.fail("expected loadPlanSnapshot to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { exitCode?: number }).exitCode).toBe(2);
        expect((error as Error).message).toContain("plan file is not readable:");
      }
    } finally {
      chmodSync(plan, 0o600);
    }
  });
});
