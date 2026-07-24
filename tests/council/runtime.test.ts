import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { nodeVersionSupported, packageRootFrom, selfTest } from "../../extensions/council/lib/runtime.js";

describe("portable runtime contract", () => {
  it("resolves package roots from encoded import.meta.url paths", () => {
    const parent = mkdtempSync(join(tmpdir(), "ai synthesis runtime "));
    const root = join(parent, "ai synthesis");
    mkdirSync(join(root, "extensions", "council"), { recursive: true });
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}\n");
    writeFileSync(join(root, "bin", "provider-invoke"), "#!/bin/sh\n");
    const url = pathToFileURL(join(root, "extensions", "council", "cli.ts")).href;
    expect(url).toContain("%20");
    expect(packageRootFrom(url)).toBe(root);
  });

  it("fails the self-test below Node 22.19.0", () => {
    expect(nodeVersionSupported("v22.18.9")).toBe(false);
    expect(nodeVersionSupported("v22.19.0")).toBe(true);
    expect(nodeVersionSupported("v23.0.0")).toBe(true);
    const report = selfTest(process.cwd(), { nodeVersion: "v20.11.1" });
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("NODE_VERSION_UNSUPPORTED");
  });
});
