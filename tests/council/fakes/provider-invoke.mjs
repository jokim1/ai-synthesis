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

if (process.env.AISYNTH_FAKE_FAIL_KEY === key) {
  process.stdout.write("not-json");
  process.exit(0);
}

if (process.env.AISYNTH_FAKE_REQUIRE_ROLE_TEMPLATE === "1") {
  const required = {
    "council-voice.json": "one explicit member of an ai-synthesis council",
    "council-critique.json": "Challenge the strongest implementation",
    "council-steelman.json": "Improve the best case",
    "council-adversary.json": "Find bounded objections",
    "council-chair-report.json": "Write the final council synthesis"
  }[schema];
  if (required && !prompt.includes(required)) {
    process.stdout.write("not-json");
    process.exit(0);
  }
}

if (process.env.AISYNTH_FAKE_MALFORMED_ONCE === "1" && !seen.includes(key)) {
  process.stdout.write("not-json");
  process.exit(0);
}

if (process.env.AISYNTH_FAKE_INVALID_ONCE === "1" && !seen.includes(key)) {
  console.log(JSON.stringify({ ok: true, status: "ok", structured: { invalid: true }, text: "", meta: { attempts: 1 } }));
  process.exit(0);
}

let structured;
if (schema === "council-voice.json") {
  const positions = JSON.parse(process.env.AISYNTH_FAKE_POSITION_BY_MEMBER ?? "{}");
  const isPlan = prompt.includes("Review the immutable plan independently.");
  const sourceType = isPlan ? "plan_line" : "issue_text";
  const locatorPrefix = isPlan ? "plan.md" : "issue";
  structured = {
    ok: true,
    member_id: member,
    role,
    position_key: positions[member] ?? "other:approve",
    recommendation: "Proceed with the reviewed approach",
    evidence: [1, 2, 3].map((line) => ({ claim: `The input line ${line} informs the decision`, source_type: sourceType, locator: `${locatorPrefix}:L${line}` })),
    assumptions: role === "risk-critic"
      ? [{
          assumption_key: "rollback-readiness",
          statement: "Rollback thresholds are proven against staged traffic",
          load_bearing: true,
          if_false_then: "Pause the rollout",
          how_to_verify: "Measure rollback readiness against staged traffic"
        }]
      : [{ assumption_key: "inputs-hold", statement: "Inputs remain accurate", load_bearing: false, if_false_then: "Reassess", how_to_verify: "Confirm inputs" }],
    risks: ["Execution risk remains"],
    what_would_change_my_view: ["Contradictory evidence"],
    next_action: "Start the smallest reversible rollout step"
  };
} else if (schema === "council-critique.json") {
  const assumptionIds = [...prompt.matchAll(/"id":"(entry_[a-z0-9_]+:[a-z0-9-]+)"/g)].map((match) => match[1]);
  structured = {
    memberId: member,
    targetedChallenges: [{ canonicalPositionId: "other:approve", challenge: "Validate the execution assumption", evidenceIds: [`ev_initial_${member}_1`] }],
    assumptionReviews: [...new Set(assumptionIds)].map((assumptionId) => {
      const verified = process.env.AISYNTH_FAKE_ALL_ASSUMPTIONS_VERIFIED === "1" || !assumptionId.endsWith(":rollback-readiness");
      return {
        assumptionId,
        status: verified ? "verified_by_cited_evidence" : "unverified",
        rationale: verified ? "The cited input supports it" : "The frozen input does not prove staged rollback behavior",
        evidenceIds: verified ? [`ev_initial_${assumptionId.split(":")[0]}_1`] : []
      };
    })
  };
  if (process.env.AISYNTH_FAKE_PARTIAL_CRITIQUE === "1") structured.assumptionReviews = structured.assumptionReviews.slice(0, 1);
} else if (schema === "council-steelman.json") {
  structured = { memberId: member, steelmans: [{ canonicalPositionId: "other:approve", improvedCase: "Best case is grounded", evidenceIds: [`ev_initial_${member}_1`], concededRisks: ["Execution risk remains"] }] };
} else if (schema === "council-adversary.json") {
  if (process.env.AISYNTH_FAKE_REQUIRE_SYNTHESIS_BRIEF === "1" && (!prompt.includes('"critique"') || !prompt.includes('"steelman"') || !prompt.includes('"groupedPositions"'))) {
    console.log(JSON.stringify({ ok: true, status: "ok", structured: { invalid: true }, text: "", meta: { attempts: 1 } }));
    process.exit(0);
  }
  structured = { memberId: member, objections: [{ canonicalPositionId: "other:approve", axis: "recommendation_logic", objection: "Residual risk remains", wouldChangeRecommendation: "Independent validation", evidenceIds: [`ev_initial_${member}_1`] }] };
} else {
  structured = {
    recommendation: "Proceed with safeguards",
    decision_readiness: process.env.AISYNTH_FAKE_CHAIR_READINESS ?? "conditional",
    evidence_summary: ["The input line 1 informs the decision (issue:L1)"],
    strongest_dissent: "Residual risk remains",
    assumptions: ["Inputs remain accurate"],
    risks: ["Execution risk remains"],
    what_would_change_recommendation: ["Contradictory evidence"],
    phase_findings: {},
    next_action: "Confirm inputs"
  };
  if (process.env.AISYNTH_FAKE_CHAIR_UNGROUNDED === "1") {
    structured.evidence_summary = ["An invented production incident proves the decision (issue:L1)"];
  }
}
console.log(JSON.stringify({ ok: true, status: "ok", structured, text: "", model: process.env.AISYNTH_FAKE_RESOLVED_MODEL ?? "claude-fixture-resolved", meta: { attempts: 1 } }));
