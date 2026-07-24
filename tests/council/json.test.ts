import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { extractModelJson, validateModelJson } from "../../extensions/council/lib/validate-json.js";

describe("validate-json", () => {
  it("extracts whole, fenced, and prose-wrapped JSON", () => {
    expect(extractModelJson('{"ok":true}')).toMatchObject({ ok: true, source: "whole" });
    expect(extractModelJson('```json\n{"ok":true}\n```')).toMatchObject({ ok: true, source: "fence" });
    expect(extractModelJson('prose {"ok":true} trailing')).toMatchObject({ ok: true, source: "scan" });
  });

  it("validates schema subset", () => {
    const schema = join(process.cwd(), "schemas/council-voice.json");
    const invalid = validateModelJson(schema, '{"ok":false}');
    expect(invalid.ok).toBe(false);
  });

  it("rejects empty nested phase objects", () => {
    const schema = join(process.cwd(), "schemas/council-critique.json");
    const invalid = validateModelJson(schema, JSON.stringify({ memberId: "entry_a", targetedChallenges: [{}], assumptionReviews: [] }));
    expect(invalid.ok).toBe(false);
  });
});
