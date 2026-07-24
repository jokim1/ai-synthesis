import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, isAbsolute, resolve } from "node:path";
import type { CouncilInputSnapshotV1 } from "./types.js";
import { sha256 } from "./util.js";

const PLAN_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".plan"]);

export interface ParseInputOptions {
  cwd: string;
  issue?: string;
  planFile?: string;
  positional?: string[];
  allowedRoots?: string[];
}

export function normalizeIssue(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function lineMapFor(text: string): Array<{ line: number; startOffset: number; endOffset: number }> {
  const map = [];
  let start = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const end = start + lines[i].length;
    map.push({ line: i + 1, startOffset: start, endOffset: end });
    start = end + 1;
  }
  return map;
}

function expandPath(raw: string, cwd: string): string {
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return resolve(homedir(), raw.slice(2));
  return isAbsolute(raw) ? raw : resolve(cwd, raw);
}

function isPathShaped(token: string, cwd: string): boolean {
  if (token.startsWith("~") || token.startsWith(".") || token.includes("/") || token.includes("\\")) return true;
  if (PLAN_EXTENSIONS.has(extname(token).toLowerCase())) return true;
  try {
    lstatSync(resolve(cwd, token));
    return true;
  } catch {
    return false;
  }
}

function assertAllowed(real: string, allowedRoots: string[]): void {
  const roots = allowedRoots.map((root) => realpathSync(root));
  if (!roots.some((root) => real === root || real.startsWith(`${root}/`))) {
    throw Object.assign(new Error(`plan file is outside allowed roots: ${real}`), { exitCode: 2 });
  }
}

export function loadPlanSnapshot(path: string, cwd: string, allowedRoots = [cwd]): CouncilInputSnapshotV1 {
  const resolved = expandPath(path, cwd);
  const realpath = realpathSync(resolved);
  assertAllowed(realpath, allowedRoots);
  const stat = statSync(realpath);
  if (!stat.isFile()) throw Object.assign(new Error(`plan path is not a regular file: ${path}`), { exitCode: 2 });
  if (stat.size > 512 * 1024) throw Object.assign(new Error(`plan file exceeds 512 KiB: ${path}`), { exitCode: 2 });
  const bytes = readFileSync(realpath);
  if (bytes.includes(0)) throw Object.assign(new Error(`plan file looks binary: ${path}`), { exitCode: 2 });
  const text = bytes.toString("utf8").replace(/\r\n?/g, "\n");
  return {
    kind: "plan",
    displayName: "plan.md",
    text,
    lineMap: lineMapFor(text),
    sha256: sha256(bytes),
    sourcePath: realpath,
    originalFileMeta: { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, realpath }
  };
}

export function issueSnapshot(text: string): CouncilInputSnapshotV1 {
  const normalized = normalizeIssue(text);
  if (!normalized) throw Object.assign(new Error("issue text is required"), { exitCode: 2 });
  return {
    kind: "issue",
    displayName: "issue",
    text: normalized,
    lineMap: lineMapFor(normalized),
    sha256: sha256(normalized)
  };
}

export function parseCouncilInput(opts: ParseInputOptions): CouncilInputSnapshotV1 {
  if (opts.issue && opts.planFile) throw Object.assign(new Error("choose either --issue or --plan-file, not both"), { exitCode: 2 });
  if (opts.planFile) return loadPlanSnapshot(opts.planFile, opts.cwd, opts.allowedRoots ?? [opts.cwd]);
  if (opts.issue) return issueSnapshot(opts.issue);
  const positional = opts.positional ?? [];
  if (positional.length === 0) throw Object.assign(new Error("usage: bin/council --issue <text> or --plan-file <path>"), { exitCode: 2 });
  const explicitFiles = positional.filter((part) => part.startsWith("@"));
  if (explicitFiles.length > 1) throw Object.assign(new Error("MVP accepts one explicit @plan file at a time"), { exitCode: 2 });
  if (explicitFiles.length === 1) {
    const candidate = explicitFiles[0].slice(1);
    if (isPathShaped(candidate, opts.cwd)) return loadPlanSnapshot(candidate, opts.cwd, opts.allowedRoots ?? [opts.cwd]);
    return issueSnapshot(positional.join(" "));
  }
  if (positional.length === 1 && isPathShaped(positional[0], opts.cwd)) {
    const candidate = expandPath(positional[0], opts.cwd);
    try {
      const stat = statSync(candidate);
      if (stat.isFile()) return loadPlanSnapshot(positional[0], opts.cwd, opts.allowedRoots ?? [opts.cwd]);
      throw Object.assign(new Error(`plan path is not a regular file: ${positional[0]}`), { exitCode: 2 });
    } catch (error) {
      if (error instanceof Error && "exitCode" in error) throw error;
      throw Object.assign(new Error(`path-shaped input is not readable: ${positional[0]}`), { exitCode: 2 });
    }
  }
  return issueSnapshot(positional.join(" "));
}

export function checkPlanDrift(snapshot: CouncilInputSnapshotV1): boolean {
  if (snapshot.kind !== "plan" || !snapshot.sourcePath || !snapshot.originalFileMeta) return false;
  try {
    const stat = statSync(snapshot.sourcePath);
    return stat.size !== snapshot.originalFileMeta.size || stat.mtimeMs !== snapshot.originalFileMeta.mtimeMs;
  } catch {
    return true;
  }
}
