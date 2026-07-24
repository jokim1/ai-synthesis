function normalizeClaim(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(?:ev_[a-z0-9_:-]+|entry_[a-z0-9_:-]+|plan\.md:l\d+(?:-l\d+)?|issue:l\d+(?:-l\d+)?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function substantiveClaim(value) {
  const normalized = normalizeClaim(value);
  return normalized.split(" ").length >= 4 && ![
    "gather more grounded evidence before implementation",
    "proceed with the reviewed approach",
    "start the smallest reversible rollout step",
    "confirm inputs"
  ].includes(normalized);
}

function absentFromBaseline(value, baseline) {
  const candidate = normalizeClaim(value);
  const baselineClaims = [
    baseline.recommendation,
    baseline.next_action,
    ...baseline.evidence.map((item) => item.claim),
    ...baseline.assumptions.flatMap((item) => [item.statement, item.how_to_verify]),
    ...baseline.risks,
    ...baseline.what_would_change_my_view
  ].map(normalizeClaim);
  return candidate.length > 0 && baselineClaims.every((claim) => !claim.includes(candidate) && !candidate.includes(claim));
}

export function materialDeltas(report, baseline) {
  if (!report || !baseline) return [];
  const deltas = [];
  const outcome = normalizeClaim(`${report.recommendation} ${report.next_action}`);
  let dissent;
  try {
    dissent = JSON.parse(report.strongest_dissent);
  } catch {
    dissent = { objection: report.strongest_dissent };
  }
  const dissentClaim = dissent?.objection;
  if (
    substantiveClaim(dissentClaim)
    && absentFromBaseline(dissentClaim, baseline)
    && outcome.includes(normalizeClaim(dissentClaim))
  ) deltas.push("dissent");
  if (report.evidence_summary.some((item) => {
    const claim = item.replace(/\s+\([^)]+\)$/, "");
    return substantiveClaim(claim) && absentFromBaseline(claim, baseline) && outcome.includes(normalizeClaim(claim));
  })) deltas.push("evidence");
  if (report.assumptions.some((item) => {
    const claim = item.replace(/^[^:]+:\s*/, "");
    return substantiveClaim(claim) && absentFromBaseline(claim, baseline) && outcome.includes(normalizeClaim(claim));
  })) deltas.push("assumption");
  if (substantiveClaim(report.next_action) && absentFromBaseline(report.next_action, baseline)) deltas.push("next_action");
  return deltas;
}

export function evaluateRuns(primaryReport, revisionReports, baseline) {
  const primaryDeltas = materialDeltas(primaryReport, baseline);
  const revisions = revisionReports.map((report) => {
    const deltas = materialDeltas(report, baseline);
    return {
      report,
      deltas,
      outcome: deltas.length === 0 ? "correlated_no_added_value" : "material_delta_demonstrated"
    };
  });
  const selectedRevisionIndex = primaryDeltas.length > 0
    ? -1
    : revisions.findIndex((revision) => revision.deltas.length > 0);
  return {
    primaryDeltas,
    revisions,
    selectedRevisionIndex,
    selectedRun: selectedRevisionIndex >= 0 ? `revision-${selectedRevisionIndex + 1}` : "primary",
    selectedReport: selectedRevisionIndex >= 0 ? revisions[selectedRevisionIndex].report : primaryReport,
    selectedDeltas: selectedRevisionIndex >= 0 ? revisions[selectedRevisionIndex].deltas : primaryDeltas
  };
}

export function needsRevision(evaluation, completedAttempts, maxAttempts) {
  return evaluation.selectedDeltas.length === 0 && completedAttempts < maxAttempts;
}
