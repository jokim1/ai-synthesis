import { createHash, randomBytes } from "node:crypto";

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`).join(",")}}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function entryId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = randomBytes(16);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < 26; i += 1) out += alphabet[Number.parseInt(bits.slice(i * 5, i * 5 + 5).padEnd(5, "0"), 2)];
  return `entry_${out}`;
}

export function routeComponent(value: string): string {
  const bytes = Buffer.from(value.normalize("NFC"), "utf8");
  let out = "";
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte);
    out += /[A-Za-z0-9._~-]/.test(ch) ? ch : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

export function routeId(executor: string, provider: string, model: string): string {
  return `v1:${routeComponent(executor)}:${routeComponent(provider)}:${routeComponent(model)}`;
}

export function parseJsonObject(text: string): unknown {
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected JSON object");
  return parsed;
}
