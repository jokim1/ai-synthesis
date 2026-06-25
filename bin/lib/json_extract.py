#!/usr/bin/env python3
"""Tolerant JSON extractor for non-Claude model output.

Claude enforces `--json-schema`, so its structured output is already clean and
validated. Every other model is *prompt-instructed* to emit JSON and may wrap it
in prose or markdown fences (the "structured-output asymmetry" in the spec). This
helper is the tolerant-parse half of "tolerant parse + retry-once": it pulls the
JSON value out of messy text AND, when given a schema, validates it — so a reply
with the right keys but wrong values (`{"ok":false}` against `ok: const true`)
does not get folded in as a trusted answer.

Reads raw text on stdin. Writes canonical compact JSON to stdout on success.

Exit codes (consumed by the adapters' retry logic):
  0  parsed, and (no constraints, or it satisfies --schema / --require-keys)
  4  parsed JSON but it does NOT satisfy the schema / required keys  -> retry
  3  nothing parseable found                                         -> retry
  2  usage error

Strategy:
  1. json.loads on the whole (trimmed) input, then the fence-stripped whole — the
     clean "pure JSON" case.
  2. Scan plausible '{' / '[' starts and `raw_decode` at each (stops at the end of
     the first complete value, so it finds JSON even after an unclosed prose brace,
     and fails fast on `{{{{…`). Start positions are capped to bound adversarial
     input. Among satisfying candidates, prefer the LAST object (a model that
     restates the schema/example puts its real answer last); objects beat arrays.
"""
import argparse
import json
import re
import sys

# Bound the raw_decode scan so a hostile 100KB-of-braces reply can't go quadratic.
_MAX_STARTS = 512


def strip_fences(text):
    """Remove a single leading/trailing markdown code fence if present."""
    t = text.strip()
    m = re.match(r"^```[a-zA-Z0-9_-]*\s*\n(.*)\n```$", t, re.DOTALL)
    if m:
        return m.group(1).strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    return t.strip()


def try_load(s):
    try:
        return True, json.loads(s)
    except (ValueError, TypeError):
        return False, None


def iter_json_values(text):
    """Yield JSON values decoded at each plausible '{'/'[' start, in order.

    Uses raw_decode, which stops at the end of the first complete value (so it
    tolerates trailing prose and finds a valid object nested after unclosed
    non-JSON braces) and raises immediately on a bad start (so `{{{{…` is cheap).
    """
    dec = json.JSONDecoder()
    starts = [i for i, c in enumerate(text) if c == "{" or c == "["]
    if len(starts) > _MAX_STARTS:
        sys.stderr.write("json_extract: capping scan at %d candidate starts\n" % _MAX_STARTS)
        starts = starts[:_MAX_STARTS]
    for i in starts:
        try:
            val, _end = dec.raw_decode(text, i)
        except ValueError:
            continue
        yield val


# --- minimal JSON Schema validation (stdlib only) ---------------------------
# Covers the constraints role schemas actually use: type, const, enum, required,
# properties, additionalProperties:false, items. Not a full JSON Schema engine —
# just enough that "right keys, wrong values" is caught, not trusted.

def _type_ok(value, t):
    types = t if isinstance(t, list) else [t]
    for tt in types:
        if tt == "object" and isinstance(value, dict):
            return True
        if tt == "array" and isinstance(value, list):
            return True
        if tt == "string" and isinstance(value, str):
            return True
        if tt == "integer" and isinstance(value, int) and not isinstance(value, bool):
            return True
        if tt == "number" and isinstance(value, (int, float)) and not isinstance(value, bool):
            return True
        if tt == "boolean" and isinstance(value, bool):
            return True
        if tt == "null" and value is None:
            return True
    return False


def validate(value, schema):
    if not isinstance(schema, dict):
        return True
    t = schema.get("type")
    if t is not None and not _type_ok(value, t):
        return False
    if "const" in schema and value != schema["const"]:
        return False
    if "enum" in schema and value not in schema["enum"]:
        return False
    if isinstance(value, dict):
        for k in schema.get("required", []) or []:
            if k not in value:
                return False
        props = schema.get("properties", {}) or {}
        if schema.get("additionalProperties") is False:
            for k in value:
                if k not in props:
                    return False
        for k, sub in props.items():
            if k in value and not validate(value[k], sub):
                return False
    if isinstance(value, list):
        items = schema.get("items")
        if isinstance(items, dict):
            for el in value:
                if not validate(el, items):
                    return False
    return True


def make_satisfies(schema, require_keys):
    if schema is not None:
        return lambda v: validate(v, schema)
    if require_keys:
        return lambda v: isinstance(v, dict) and all(k in v for k in require_keys)
    return lambda v: True


def extract(text, satisfies):
    """Return (status, value): 'ok' | 'unsatisfied' | 'none'."""
    # 1. Clean whole-input cases (pure JSON, optionally fenced).
    for candidate in (text.strip(), strip_fences(text)):
        if not candidate:
            continue
        ok, val = try_load(candidate)
        if ok and satisfies(val):
            return "ok", val

    # 2. raw_decode scan. Prefer the LAST satisfying object; objects beat arrays.
    objs = []
    arrs = []
    unsatisfied = None
    for val in iter_json_values(strip_fences(text)):
        if satisfies(val):
            (objs if isinstance(val, dict) else arrs).append(val)
        elif unsatisfied is None:
            unsatisfied = val

    if objs:
        return "ok", objs[-1]
    if arrs:
        return "ok", arrs[-1]
    if unsatisfied is not None:
        return "unsatisfied", unsatisfied
    return "none", None


def main():
    ap = argparse.ArgumentParser(description="Tolerant JSON extractor (stdin -> stdout).")
    ap.add_argument("--require-keys", default="",
                    help="Comma-separated top-level keys that must be present (object result).")
    ap.add_argument("--schema", default="",
                    help="JSON Schema string; the extracted value must validate against it "
                         "(supersedes --require-keys).")
    args = ap.parse_args()

    schema = None
    if args.schema.strip():
        ok, schema = try_load(args.schema)
        if not ok:
            sys.stderr.write("json_extract: --schema is not valid JSON\n")
            return 2
    require_keys = [k.strip() for k in args.require_keys.split(",") if k.strip()]

    raw = sys.stdin.read()
    status, value = extract(raw, make_satisfies(schema, require_keys))

    if status == "ok":
        sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
        return 0
    if status == "unsatisfied":
        sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
        sys.stderr.write("parsed JSON does not satisfy the required schema/keys\n")
        return 4
    sys.stderr.write("no parseable JSON value found in input\n")
    return 3


if __name__ == "__main__":
    sys.exit(main())
