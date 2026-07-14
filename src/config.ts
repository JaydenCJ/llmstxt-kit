/**
 * Configuration model: defaults, `llmstxt.config.json` loading and layered
 * resolution (defaults < config file < CLI flags). The loader is strict —
 * unknown keys and wrong types are hard errors, because a silently ignored
 * typo in a generator config produces a wrong llms.txt with no other signal.
 */

import { existsSync, readFileSync } from "node:fs";

export type UrlStyle = "md" | "clean" | "html";

export interface KitConfig {
  /** Site name for the H1. Falls back to the root index page's heading. */
  name?: string;
  /** Blockquote summary. Falls back to the root index page's first paragraph. */
  summary?: string;
  /** Prefix for every link URL. "" produces root-relative paths. */
  baseUrl: string;
  /** Docs root to scan, relative to the working directory. */
  docsDir: string;
  /** How page paths become URLs: keep `.md`, strip extensions, or `.html`. */
  urlStyle: UrlStyle;
  /** Section name for pages that live directly in the docs root. */
  rootSection: string;
  /** Maps a top-level directory to a section name (e.g. "api" -> "API reference"). */
  sections: Record<string, string>;
  /** Section names pinned first, in this order; the rest sort alphabetically. */
  sectionOrder: string[];
  /** Globs (relative paths) routed into the special "Optional" section. */
  optional: string[];
  /** Globs (relative paths) excluded entirely. */
  exclude: string[];
  /** Auto-derived link descriptions are truncated to this many characters. */
  maxDescriptionLength: number;
}

export const DEFAULT_CONFIG: KitConfig = {
  baseUrl: "",
  docsDir: "docs",
  urlStyle: "md",
  rootSection: "Documentation",
  sections: {},
  sectionOrder: [],
  optional: [],
  exclude: [],
  maxDescriptionLength: 160,
};

/** Default config file name looked up in the working directory. */
export const CONFIG_FILE = "llmstxt.config.json";

/** Raised for malformed config files; the CLI maps it to exit code 2. */
export class ConfigError extends Error {}

const STRING_KEYS = new Set(["name", "summary", "baseUrl", "docsDir", "rootSection"]);
const STRING_ARRAY_KEYS = new Set(["sectionOrder", "optional", "exclude"]);
const URL_STYLES: UrlStyle[] = ["md", "clean", "html"];

/** Parse and type-check a config file. Unknown keys are hard errors. */
export function loadConfigFile(path: string): Partial<KitConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ConfigError(`cannot read config ${path}: ${message(err)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`config ${path} must be a JSON object`);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (STRING_KEYS.has(key)) {
      if (typeof value !== "string") {
        throw new ConfigError(`config key "${key}" must be a string`);
      }
      out[key] = value;
    } else if (STRING_ARRAY_KEYS.has(key)) {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        throw new ConfigError(`config key "${key}" must be an array of strings`);
      }
      out[key] = value;
    } else if (key === "urlStyle") {
      if (typeof value !== "string" || !URL_STYLES.includes(value as UrlStyle)) {
        throw new ConfigError(
          `config key "urlStyle" must be one of: ${URL_STYLES.join(", ")}`
        );
      }
      out[key] = value;
    } else if (key === "maxDescriptionLength") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        throw new ConfigError(`config key "maxDescriptionLength" must be a positive integer`);
      }
      out[key] = value;
    } else if (key === "sections") {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.values(value as Record<string, unknown>).some((v) => typeof v !== "string")
      ) {
        throw new ConfigError(`config key "sections" must map directory names to strings`);
      }
      out[key] = value;
    } else {
      throw new ConfigError(
        `unknown config key "${key}" (allowed: name, summary, baseUrl, docsDir, urlStyle, rootSection, sections, sectionOrder, optional, exclude, maxDescriptionLength)`
      );
    }
  }
  return out as Partial<KitConfig>;
}

/**
 * Resolve the effective config. `explicitPath` (from `--config`) must
 * exist; otherwise `llmstxt.config.json` in `cwd` is used when present.
 */
export function resolveConfig(
  cwd: string,
  explicitPath: string | undefined,
  overrides: Partial<KitConfig>
): KitConfig {
  let fromFile: Partial<KitConfig> = {};
  if (explicitPath !== undefined) {
    if (!existsSync(explicitPath)) {
      throw new ConfigError(`config file not found: ${explicitPath}`);
    }
    fromFile = loadConfigFile(explicitPath);
  } else {
    const implicit = `${cwd}/${CONFIG_FILE}`;
    if (existsSync(implicit)) fromFile = loadConfigFile(implicit);
  }
  return { ...DEFAULT_CONFIG, ...fromFile, ...definedOnly(overrides) };
}

function definedOnly(partial: Partial<KitConfig>): Partial<KitConfig> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<KitConfig>;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
