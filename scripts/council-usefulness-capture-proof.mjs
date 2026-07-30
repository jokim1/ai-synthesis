import { isAbsolute, relative } from "node:path";

/** Package-root-relative path when `bin` is under the package; otherwise the absolute spawn path. */
export function packageRelativeProviderBin(packageRoot, bin) {
  if (typeof bin !== "string" || !bin) {
    throw new Error("capture proof requires the actual provider binary path");
  }
  const rel = relative(packageRoot, bin);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return bin;
  return rel.split("\\").join("/");
}

/** Live usefulness captures must not use test-only provider shims or fake routes. */
export function assertAuthorizedCaptureEnv(env = process.env) {
  if (env.AISYNTH_COUNCIL_PROVIDER_INVOKE) {
    throw new Error(
      "AISYNTH_COUNCIL_PROVIDER_INVOKE is set; refuse to capture usefulness evidence with a substituted provider binary"
    );
  }
  if (env.AISYNTH_COUNCIL_FAKE_ROUTES) {
    throw new Error(
      "AISYNTH_COUNCIL_FAKE_ROUTES is set; refuse to capture usefulness evidence with fake routes"
    );
  }
}

/** Expected package-relative binary for authorized portable Claude captures. */
export const AUTHORIZED_PROVIDER_BIN = "bin/provider-invoke";
