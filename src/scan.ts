/**
 * Docs-tree scanner: walks a directory of Markdown files and turns each
 * page into a `ScannedPage` with a title, a one-line description and the
 * frontmatter knobs (`section`, `order`, `optional`, `draft`) that steer
 * generation. Walking is fully deterministic: entries are sorted with a
 * numeric-aware comparator so `2-usage.md` sorts before `10-faq.md`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { KitConfig } from "./config.js";
import {
  extractFrontmatter,
  firstHeading,
  firstParagraph,
  humanize,
  truncate,
} from "./markdown.js";

/** One Markdown page discovered under the docs root. */
export interface ScannedPage {
  /** Path relative to the docs root, always with `/` separators. */
  relPath: string;
  title: string;
  description: string;
  /** Markdown body with frontmatter removed. */
  body: string;
  /** Section override from frontmatter, if any. */
  section?: string;
  /**
   * Sort key within a section. Defaults: index/README pages first (-1),
   * everything else last (sorted by path). Frontmatter `order` overrides.
   */
  order: number;
  optional: boolean;
  /** True for `index.md` / `README.md` at the docs root (the site page). */
  isRootIndex: boolean;
}

const MARKDOWN_EXT = /\.(md|markdown)$/i;

/** Numeric-aware string comparison: "2-usage" < "10-faq". */
export function naturalCompare(a: string, b: string): number {
  const ax = a.toLowerCase().split(/(\d+)/);
  const bx = b.toLowerCase().split(/(\d+)/);
  const n = Math.max(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    const as = ax[i] ?? "";
    const bs = bx[i] ?? "";
    if (as === bs) continue;
    const an = /^\d+$/.test(as) ? Number(as) : NaN;
    const bn = /^\d+$/.test(bs) ? Number(bs) : NaN;
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return as < bs ? -1 : 1;
  }
  return 0;
}

/**
 * Compile a glob into a RegExp. Supported: double-star (any path), `*`
 * (any segment chars), `?` (one segment char). Enough for the
 * exclude/optional patterns, e.g. "reference/" + double-star, "draft-*.md".
 */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // `**/` also matches zero directories
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/** True when the path matches any of the globs. */
export function matchAny(globs: string[], relPath: string): boolean {
  return globs.some((g) => globToRegExp(g).test(relPath));
}

/** Recursively list Markdown files under root (sorted, hidden dirs skipped). */
export function listMarkdownFiles(root: string): string[] {
  const out: string[] = [];
  walk(root, "", out);
  out.sort(naturalCompare);
  return out;
}

function walk(absDir: string, relDir: string, out: string[]): void {
  const entries = readdirSync(absDir, { withFileTypes: true })
    .slice()
    .sort((a, b) => naturalCompare(a.name, b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      walk(join(absDir, entry.name), rel, out);
    } else if (entry.isFile() && MARKDOWN_EXT.test(entry.name)) {
      out.push(rel);
    }
  }
}

/**
 * Read and interpret every page under `root`. Drafts (`draft: true`) and
 * pages matching `config.exclude` are dropped here so every later stage
 * sees only publishable pages.
 */
export function scanDocs(root: string, config: KitConfig): ScannedPage[] {
  const pages: ScannedPage[] = [];
  for (const relPath of listMarkdownFiles(root)) {
    if (matchAny(config.exclude, relPath)) continue;
    const raw = readFileSync(join(root, ...relPath.split("/")), "utf8");
    const fm = extractFrontmatter(raw);
    if (fm.data["draft"] === true) continue;
    pages.push(toPage(relPath, fm.data, fm.body, config));
  }
  return pages;
}

function toPage(
  relPath: string,
  data: Record<string, string | number | boolean>,
  body: string,
  config: KitConfig
): ScannedPage {
  const fileName = relPath.split("/").pop() ?? relPath;
  const stem = fileName.replace(MARKDOWN_EXT, "");
  const isIndex = /^(index|readme)$/i.test(stem);
  const dir = relPath.includes("/")
    ? relPath.slice(0, relPath.lastIndexOf("/"))
    : "";

  const fmTitle = typeof data["title"] === "string" ? data["title"] : "";
  const heading = firstHeading(body);
  const fallback =
    isIndex && dir !== "" ? humanize(dir.split("/").pop() ?? dir) : humanize(stem);
  const title = fmTitle !== "" ? fmTitle : heading !== null ? heading.text : fallback;

  const fmDesc =
    typeof data["description"] === "string" ? data["description"] : "";
  const description =
    fmDesc !== ""
      ? fmDesc
      : truncate(firstParagraph(body), config.maxDescriptionLength);

  return {
    relPath,
    title,
    description,
    body,
    section: typeof data["section"] === "string" ? data["section"] : undefined,
    order:
      typeof data["order"] === "number"
        ? data["order"]
        : isIndex
          ? -1
          : Number.MAX_SAFE_INTEGER,
    optional: data["optional"] === true || matchAny(config.optional, relPath),
    isRootIndex: dir === "" && isIndex,
  };
}
