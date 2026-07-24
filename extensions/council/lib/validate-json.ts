import { readFileSync } from "node:fs";
import type { CouncilJsonValidationResult } from "./types.js";

function stripFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseAt(text: string, start: number): unknown | undefined {
  const open = text[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : "";
  if (!close) return undefined;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

export function extractModelJson(rawText: string): { ok: true; value: unknown; source: "whole" | "fence" | "scan" } | { ok: false; kind: "no_json"; rawText: string; error: string } {
  for (const [source, candidate] of [["whole", rawText.trim()], ["fence", stripFence(rawText)]] as const) {
    try {
      return { ok: true, value: JSON.parse(candidate), source };
    } catch {
      // continue
    }
  }
  let foundObject: unknown | undefined;
  let foundArray: unknown | undefined;
  let starts = 0;
  for (let i = 0; i < rawText.length && starts < 512; i += 1) {
    if (rawText[i] !== "{" && rawText[i] !== "[") continue;
    starts += 1;
    const value = parseAt(rawText, i);
    if (value !== undefined) {
      if (Array.isArray(value)) foundArray = value;
      else if (value && typeof value === "object") foundObject = value;
    }
  }
  if (foundObject !== undefined) return { ok: true, value: foundObject, source: "scan" };
  if (foundArray !== undefined) return { ok: true, value: foundArray, source: "scan" };
  return { ok: false, kind: "no_json", rawText, error: "no JSON object found" };
}

function validateValue(schema: unknown, value: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as Record<string, unknown>;
  const errors: string[] = [];
  if ("const" in s && JSON.stringify(value) !== JSON.stringify(s.const)) errors.push(`${path} must equal const`);
  if (Array.isArray(s.enum) && !s.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) errors.push(`${path} must be one of enum`);
  if (s.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} must be object`];
    const object = value as Record<string, unknown>;
    for (const key of (s.required as string[] | undefined) ?? []) {
      if (!(key in object)) errors.push(`${path}.${key} is required`);
    }
    const props = (s.properties as Record<string, unknown> | undefined) ?? {};
    for (const [key, propSchema] of Object.entries(props)) {
      if (key in object) errors.push(...validateValue(propSchema, object[key], `${path}.${key}`));
    }
    if (s.additionalProperties === false) {
      for (const key of Object.keys(object)) if (!(key in props)) errors.push(`${path}.${key} is not allowed`);
    }
  } else if (s.type === "array") {
    if (!Array.isArray(value)) return [`${path} must be array`];
    if (s.items) value.forEach((item, index) => errors.push(...validateValue(s.items, item, `${path}[${index}]`)));
  } else if (typeof s.type === "string") {
    const type = s.type === "integer" ? "number" : s.type;
    if (typeof value !== type) errors.push(`${path} must be ${s.type}`);
  }
  return errors;
}

export function validateModelJsonValue(schemaPath: string, value: unknown): CouncilJsonValidationResult {
  try {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const errors = validateValue(schema, value);
    if (errors.length > 0) return { ok: false, kind: "schema_invalid", rawText: JSON.stringify(value), error: errors.join("; ") };
    return { ok: true, value, source: "whole" };
  } catch (error) {
    return { ok: false, kind: "validator_usage_error", rawText: JSON.stringify(value), error: (error as Error).message };
  }
}

export function validateModelJson(schemaPath: string, rawText: string): CouncilJsonValidationResult {
  const extracted = extractModelJson(rawText);
  if (!extracted.ok) return extracted;
  const validated = validateModelJsonValue(schemaPath, extracted.value);
  return validated.ok ? { ...validated, source: extracted.source } : validated;
}
