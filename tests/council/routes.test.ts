import { describe, expect, it } from "vitest";
import { routeId } from "../../extensions/council/lib/util.js";
import { familyFor, providerInvokeRoute } from "../../extensions/council/lib/routes.js";

describe("routes", () => {
  it("builds stable percent-encoded route ids independent of labels", () => {
    expect(routeId("provider-invoke", "claude", "adapter-default")).toBe("v1:provider-invoke:claude:adapter-default");
    expect(routeId("provider invoke", "claude/sonnet", "mødel")).toBe("v1:provider%20invoke:claude%2Fsonnet:m%C3%B8del");
  });

  it("keeps Codex unavailable while tool policy is unproven", () => {
    const codex = providerInvokeRoute("codex", false, "tool_policy_unproven");
    expect(codex.auth.runnable).toBe(false);
    expect(codex.auth.reason).toBe("tool_policy_unproven");
    expect(familyFor("codex", "adapter-default")).toBe("openai");
  });
});
