#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] ?? "";
}

const prompt = flag("--prompt");
const schema = basename(flag("--schema-file"));
const member = prompt.match(/(?:council member|explicit council member) (entry_[a-z0-9_]+)/)?.[1] ?? "entry_unknown";
const role = prompt.match(/with role ([a-z-]+)/)?.[1] ?? "architect";
const counterPath = process.env.AISYNTH_FAKE_COUNTER;
const key = `${schema}:${member}`;
let seen = [];
if (counterPath && existsSync(counterPath)) seen = readFileSync(counterPath, "utf8").trim().split("\n").filter(Boolean);
if (counterPath) appendFileSync(counterPath, `${key}\n`);

if (process.env.AISYNTH_FAKE_INVALID_ONCE === "1" && !seen.includes(key)) {
  console.log(JSON.stringify({ ok: true, status: "ok", structured: { invalid: true }, text: "", meta: { attempts: 1 } }));
  process.exit(0);
}

let structured;
if (schema === "council-voice.json") {
  structured = {
    ok: true,
    member_id: member,
    role,
    position_key: "other:approve",
    recommendation: "Proceed with the reviewed approach",
    evidence: [{ claim: "The input identifies the decision", source_type: "issue_text", locator: "issue:L1" }],
    assumptions: [{ assumption_key: "inputs-hold", statement: "Inputs remain accurate", load_bearing: false, if_false_then: "Reassess", how_to_verify: "Confirm inputs" }],
    risks: ["Execution risk remains"],
    what_would_change_my_view: ["Contradictory evidence"]
  };
} else if (schema === "council-critique.json") {
  structured = { memberId: member, targetedChallenges: [{ summary: "Validate the execution assumption", evidenceIds: [`ev_initial_${member}_1`] }], assumptionReviews: [] };
} else if (schema === "council-steelman.json") {
  structured = { memberId: member, steelmans: [{ positionId: "other:approve", summary: "Best case is grounded", evidenceIds: [`ev_initial_${member}_1`] }] };
} else if (schema === "council-adversary.json") {
  structured = { memberId: member, objections: [{ positionId: "other:approve", summary: "Residual risk remains", evidenceIds: [`ev_initial_${member}_1`] }] };
} else {
  structured = {
    recommendation: "Proceed with safeguards",
    decision_readiness: "conditional",
    evidence_summary: ["The input identifies the decision (issue:L1)"],
    strongest_dissent: "Residual risk remains",
    assumptions: ["Inputs remain accurate"],
    risks: ["Execution risk remains"],
    what_would_change_recommendation: ["Contradictory evidence"],
    phase_findings: {},
    next_action: "Confirm inputs"
  };
}
console.log(JSON.stringify({ ok: true, status: "ok", structured, text: "", meta: { attempts: 1 } }));
