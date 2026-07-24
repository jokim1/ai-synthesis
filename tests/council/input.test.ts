import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
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
});
