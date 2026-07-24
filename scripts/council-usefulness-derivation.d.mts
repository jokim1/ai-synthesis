export function materialDeltas(report: any, baseline: any): string[];
export function evaluateRuns(primaryReport: any, revisionReports: any[], baseline: any): {
  primaryDeltas: string[];
  revisions: Array<{
    report: any;
    deltas: string[];
    outcome: "correlated_no_added_value" | "material_delta_demonstrated";
  }>;
  selectedRevisionIndex: number;
  selectedRun: string;
  selectedReport: any;
  selectedDeltas: string[];
};
