import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { CouncilConfigLocation, CouncilConfigRootsV1, CouncilRosterConfigV1 } from "./types.js";
import { assertRosterShape } from "./validate-roster.js";
import { nowIso, parseJsonObject, sha256, stableJson } from "./util.js";

export function portableConfigHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.AISYNTH_CONFIG_HOME ? resolve(env.AISYNTH_CONFIG_HOME) : join(homedir(), ".ai-synthesis");
}

export function portableRememberedRosterPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(portableConfigHome(env), "council", "roster.v1.json");
}

export function configLocationForPortable(cwd: string, rosterFile?: string, env: NodeJS.ProcessEnv = process.env): CouncilConfigLocation {
  if (rosterFile) {
    const rememberedWriteTarget = portableRememberedRosterPath(env);
    return {
      scope: "explicit",
      path: resolve(cwd, rosterFile),
      source: "portable_explicit",
      rememberedWriteTarget,
      rememberedGuardedState: existsSync(rememberedWriteTarget)
        ? { kind: "present", sha256: fileHash(rememberedWriteTarget) }
        : { kind: "absent" }
    };
  }
  return { scope: "user", path: portableRememberedRosterPath(env), source: "portable_user" };
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function guardedLocation(location: CouncilConfigLocation): CouncilConfigLocation {
  if (existsSync(location.path)) return { ...location, guardedState: { kind: "present", sha256: fileHash(location.path) } };
  return { ...location, guardedState: { kind: "absent" } };
}

export function loadRosterConfig(location: CouncilConfigLocation): { config?: CouncilRosterConfigV1; diagnostics: string[]; location: CouncilConfigLocation } {
  const guarded = guardedLocation(location);
  if (!existsSync(location.path)) return { diagnostics: ["no_portable_roster"], location: guarded };
  try {
    const parsed = parseJsonObject(readFileSync(location.path, "utf8"));
    assertRosterShape(parsed);
    const raw = parsed as CouncilRosterConfigV1;
    return {
      config: { ...raw, scope: location.scope, updatedAt: raw.updatedAt ?? nowIso() },
      diagnostics: raw.scope && raw.scope !== location.scope ? [`stale on-disk scope ${raw.scope}; using ${location.scope}`] : [],
      location: guarded
    };
  } catch (error) {
    return { diagnostics: [`roster_invalid: ${(error as Error).message}`], location: guarded };
  }
}

export function canonicalRoster(config: CouncilRosterConfigV1, scope = config.scope): CouncilRosterConfigV1 {
  return {
    version: 1,
    updatedAt: nowIso(),
    scope,
    ...(config.maxEnabledMembers === undefined ? {} : { maxEnabledMembers: config.maxEnabledMembers }),
    entries: config.entries,
    reportStrategy: config.reportStrategy
  };
}

export function writeJsonAtomic(path: string, value: unknown, mode = 0o600): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, `${stableJson(value)}\n`, { mode });
  renameSync(tmp, path);
}

export function writeRosterExplicit(path: string, config: CouncilRosterConfigV1, overwrite: boolean): void {
  if (existsSync(path) && !overwrite) throw Object.assign(new Error(`refusing to overwrite existing roster: ${path}`), { exitCode: 2 });
  writeJsonAtomic(path, config);
}

export function persistRememberedRoster(location: CouncilConfigLocation, config: CouncilRosterConfigV1): { written: boolean; warning?: string } {
  const target = location.rememberedWriteTarget ?? location.path;
  const guard = location.source === "portable_explicit"
    ? location.rememberedGuardedState
    : location.guardedState;
  try {
    if (guard?.kind === "present") {
      if (!existsSync(target) || fileHash(target) !== guard.sha256) {
        return { written: false, warning: "portable_remembered_concurrent_write" };
      }
    } else if (guard?.kind === "absent" && existsSync(target)) {
      return { written: false, warning: "portable_remembered_concurrent_write" };
    }
    writeJsonAtomic(target, canonicalRoster(config, "user"));
    return { written: true };
  } catch (error) {
    return { written: false, warning: `remembered_roster_unwritable: ${(error as Error).message}` };
  }
}

export function canonicalRememberedPaths(roots: CouncilConfigRootsV1, env: NodeJS.ProcessEnv = process.env): string[] {
  const paths = [portableRememberedRosterPath(env), join(roots.cwd, ".ai-synthesis", "council", "roster.v1.json")];
  if (roots.portableConfigHome) paths.push(join(resolve(roots.portableConfigHome), "council", "roster.v1.json"));
  return [...new Set(paths.map((path) => resolve(path)))];
}

export function rosterHash(config: CouncilRosterConfigV1): string {
  return sha256(stableJson(config));
}

export function planFileChanged(path: string, size: number, mtimeMs: number): boolean {
  const stat = statSync(path);
  return stat.size !== size || stat.mtimeMs !== mtimeMs;
}
