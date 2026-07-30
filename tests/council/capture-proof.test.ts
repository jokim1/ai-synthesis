import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  AUTHORIZED_PROVIDER_BIN,
  assertAuthorizedCaptureEnv,
  packageRelativeProviderBin
} from "../../scripts/council-usefulness-capture-proof.mjs";

describe("council usefulness capture proof", () => {
  it("records package-relative path for the real package provider binary", () => {
    const packageRoot = "/tmp/ai-synthesis-package";
    const bin = join(packageRoot, "bin", "provider-invoke");
    expect(packageRelativeProviderBin(packageRoot, bin)).toBe(AUTHORIZED_PROVIDER_BIN);
  });

  it("preserves absolute paths when capture used a substituted binary outside the package", () => {
    const packageRoot = "/tmp/ai-synthesis-package";
    const bin = "/tmp/fake-provider-invoke";
    expect(packageRelativeProviderBin(packageRoot, bin)).toBe(bin);
  });

  it("rejects capture env that substitutes the provider binary or fake routes", () => {
    expect(() => assertAuthorizedCaptureEnv({ AISYNTH_COUNCIL_PROVIDER_INVOKE: "/tmp/fake" })).toThrow(
      "AISYNTH_COUNCIL_PROVIDER_INVOKE"
    );
    expect(() => assertAuthorizedCaptureEnv({ AISYNTH_COUNCIL_FAKE_ROUTES: "1" })).toThrow(
      "AISYNTH_COUNCIL_FAKE_ROUTES"
    );
    expect(() => assertAuthorizedCaptureEnv({})).not.toThrow();
  });
});
