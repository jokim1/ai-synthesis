#!/usr/bin/env bash

council_fake_routes() {
  cat <<'JSON'
{
  "version": 1,
  "routes": [
    {
      "ref": { "executor": "provider-invoke", "provider": "claude", "model": "adapter-default", "routeId": "v1:provider-invoke:claude:adapter-default" },
      "displayName": "Fake Claude",
      "family": "claude",
      "providerDisplayName": "Claude",
      "supportedEfforts": ["medium"],
      "effortSupport": { "source": "provider_invoke_help_cli_help_passthrough", "confidence": "wrapper_contract", "verifiedBy": ["fake"] },
      "structuredOutput": { "retryOwner": "engine", "maxProviderCalls": 2, "verifiedBy": ["fake"] },
      "auth": { "configured": true, "runnable": true, "policy": "subscription_only", "source": "subscription", "billing": "subscription" },
      "cost": { "known": true, "inputPerMTok": 0.01, "outputPerMTok": 0.01 },
      "limits": { "maxTokens": 1000, "contextWindow": 200000 }
    }
  ],
  "diagnostics": []
}
JSON
}

write_fake_council_provider() {
  local dir="$1"
  cat > "$dir/provider-invoke" <<'FAKE'
#!/usr/bin/env bash
member="unknown"
role="unknown"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prompt)
      prompt="$2"; shift; shift ;;
    *) shift ;;
  esac
done
member="$(printf '%s' "$prompt" | sed -n 's/^You are council member \([^ ]*\).*/\1/p' | head -1)"
role="$(printf '%s' "$prompt" | sed -n 's/^You are council member [^ ]* with role \([^ .]*\).*/\1/p' | head -1)"
case "$role" in
  implementation-critic|risk-critic|adversary) pos="revise_plan"; rec="Revise the plan before implementation";;
  *) pos="accept_plan"; rec="Accept the plan with the stated caveats";;
esac
jq -n --arg member "$member" --arg role "$role" --arg pos "$pos" --arg rec "$rec" '{
  ok:true,
  status:"ok",
  provider:"fake",
  structured:{
    ok:true,
    member_id:$member,
    role:$role,
    position_key:$pos,
    recommendation:$rec,
    evidence:[{claim:"line supports the recommendation",source_type:"plan_line",locator:"plan.md:L1"}],
    assumptions:[{assumption_key:"scope",statement:"The reviewed scope is complete",load_bearing:true,if_false_then:"Recommendation changes",how_to_verify:"Compare plan scope"}],
    risks:["A hidden dependency may be missing"],
    what_would_change_my_view:["A contradictory deployment constraint"]
  },
  text:""
}'
FAKE
  chmod +x "$dir/provider-invoke"
}

council_suite() {
  local work fdir routes roster out run report before after
  work="$(mktemp -d "${TMPDIR:-/tmp}/aisynth-council-XXXXXX")"
  fdir="$(fake_dir_new)"
  write_fake_council_provider "$fdir"
  routes="$(council_fake_routes)"
  printf 'Ship the portable council MVP.\nUse only bin/council.\n' > "$work/plan.md"

  section "portable self-test"
  out="$(AISYNTH_COUNCIL_FAKE_ROUTES="$routes" "$ROOT/bin/council" --self-test --json)"
  assert_true "self-test ok" "$(printf '%s' "$out" | jq -r '.ok')"

  section "route probe uses fake no-cost discovery"
  out="$(AISYNTH_COUNCIL_FAKE_ROUTES="$routes" "$ROOT/bin/council-route-probe")"
  assert_eq "one fake route" "1" "$(printf '%s' "$out" | jq -r '.routes | length')"

  section "emit-roster allows same-route two-role council"
  roster="$work/roster.json"
  out="$(cd "$work" && AISYNTH_COUNCIL_FAKE_ROUTES="$routes" "$ROOT/bin/council" --plan-file plan.md --emit-roster "$roster" --json)"
  assert_true "emit ok" "$(printf '%s' "$out" | jq -r '.ok')"
  assert_eq "two entries" "2" "$(jq -r '.entries | length' "$roster")"
  assert_eq "distinct roles" "2" "$(jq -r '[.entries[].role] | unique | length' "$roster")"

  section "roster-file run is read-only and writes council session"
  before="$(shasum -a 256 "$roster" | awk '{print $1}')"
  run="$(cd "$work" && AISYNTH_COUNCIL_FAKE_ROUTES="$routes" AISYNTH_COUNCIL_PROVIDER_INVOKE="$fdir/provider-invoke" AISYNTH_CONFIG_HOME="$work/config" "$ROOT/bin/council" --plan-file plan.md --roster-file "$roster" --json)"
  after="$(shasum -a 256 "$roster" | awk '{print $1}')"
  assert_eq "explicit roster unchanged" "$before" "$after"
  report="$(printf '%s' "$run" | jq -r '.reportPath')"
  assert_true "report exists" "$([ -f "$report" ] && echo true || echo false)"
  assert_contains "report forbids implementation" "$(cat "$report")" "Council completion does not authorize project implementation."
  assert_contains "same-route disclosure" "$(cat "$report")" "route_correlation: single_route"
  assert_true "remembered roster written" "$([ -f "$work/config/council/roster.v1.json" ] && echo true || echo false)"

  rm -rf "$work" "$fdir"
}
