/**
 * Generator: turns scanned pages into a structured `LlmsDoc`, renders it
 * as llms.txt, and renders the companion llms-full.txt (full page bodies
 * inlined, one `---`-separated block per page with a Source line).
 *
 * Everything here is pure — file I/O happens in scan.ts and cli.ts — and
 * rendering the same tree twice produces byte-identical output.
 */

import type { KitConfig } from "./config.js";
import type { ScannedPage } from "./scan.js";
import { naturalCompare } from "./scan.js";
import { humanize } from "./markdown.js";
import { OPTIONAL_SECTION, type LlmsDoc, type Section } from "./types.js";

export interface GenerateResult {
  llmsTxt: string;
  llmsFull: string;
  doc: LlmsDoc;
  /** Pages included as links (root index excluded). */
  pageCount: number;
  linkCount: number;
  sectionCount: number;
  fullWordCount: number;
}

/** Build llms.txt + llms-full.txt from scanned pages. */
export function generate(pages: ScannedPage[], config: KitConfig): GenerateResult {
  const doc = buildDoc(pages, config);
  const ordered = orderedContentPages(pages, config);
  const llmsTxt = renderLlmsTxt(doc);
  const llmsFull = renderLlmsFull(doc, ordered, config);
  const linkCount = doc.sections.reduce((n, s) => n + s.links.length, 0);
  return {
    llmsTxt,
    llmsFull,
    doc,
    pageCount: ordered.length,
    linkCount,
    sectionCount: doc.sections.length,
    fullWordCount: countWords(llmsFull),
  };
}

/**
 * Assemble the structured document: title and summary come from config or
 * the root index page; every other page becomes a link in its section.
 * The root index itself is not linked — it is the page llms.txt sits on.
 */
export function buildDoc(pages: ScannedPage[], config: KitConfig): LlmsDoc {
  const rootIndex = pages.find((p) => p.isRootIndex);
  const title =
    config.name ?? (rootIndex !== undefined ? rootIndex.title : "Documentation");
  const summaryText =
    config.summary ?? (rootIndex !== undefined ? rootIndex.description : "");
  const summary = summaryText.trim() === "" ? undefined : summaryText.trim();

  const sections: Section[] = orderedBuckets(pages, config).map(([name, bucket]) => ({
    name,
    links: bucket.map((p) => ({
      title: p.title,
      url: pageUrl(p.relPath, config),
      ...(p.description !== "" ? { description: p.description } : {}),
    })),
  }));
  return { title, ...(summary !== undefined ? { summary } : {}), intro: [], sections };
}

/** Group content pages (no root index) into ordered, sorted section buckets. */
function orderedBuckets(
  pages: ScannedPage[],
  config: KitConfig
): Array<[string, ScannedPage[]]> {
  const buckets = new Map<string, ScannedPage[]>();
  for (const page of pages) {
    if (page.isRootIndex) continue;
    const name = sectionNameFor(page, config);
    const bucket = buckets.get(name);
    if (bucket === undefined) buckets.set(name, [page]);
    else bucket.push(page);
  }
  return orderedSectionNames([...buckets.keys()], config).map((name) => [
    name,
    (buckets.get(name) ?? []).slice().sort(pageCompare),
  ]);
}

function sectionNameFor(page: ScannedPage, config: KitConfig): string {
  if (page.optional) return OPTIONAL_SECTION;
  if (page.section !== undefined) return page.section;
  const topDir = page.relPath.includes("/")
    ? (page.relPath.split("/")[0] as string)
    : "";
  if (topDir === "") return config.rootSection;
  return config.sections[topDir] ?? humanize(topDir);
}

/** Pinned names first (config order), the rest alphabetical, Optional always last. */
function orderedSectionNames(names: string[], config: KitConfig): string[] {
  const pinned = config.sectionOrder.filter((n) => names.includes(n));
  const rest = names
    .filter((n) => !pinned.includes(n) && n !== OPTIONAL_SECTION)
    .sort(naturalCompare);
  const out = [...pinned.filter((n) => n !== OPTIONAL_SECTION), ...rest];
  if (names.includes(OPTIONAL_SECTION)) out.push(OPTIONAL_SECTION);
  return out;
}

function pageCompare(a: ScannedPage, b: ScannedPage): number {
  if (a.order !== b.order) return a.order - b.order;
  return naturalCompare(a.relPath, b.relPath);
}

/** Content pages (no root index) in final document order, for llms-full.txt. */
function orderedContentPages(pages: ScannedPage[], config: KitConfig): ScannedPage[] {
  return orderedBuckets(pages, config).flatMap(([, bucket]) => bucket);
}

/** Map a page path to its public URL under `baseUrl`, honouring `urlStyle`. */
export function pageUrl(relPath: string, config: KitConfig): string {
  let path = relPath;
  if (config.urlStyle === "clean") {
    path = path.replace(/\.(md|markdown)$/i, "");
    path = path.replace(/(^|\/)(index|readme)$/i, "$1");
  } else if (config.urlStyle === "html") {
    path = path.replace(/\.(md|markdown)$/i, ".html");
  }
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  if (config.baseUrl === "") return `/${encoded}`;
  const base = config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`;
  return `${base}${encoded}`;
}

/** Render the structured document as spec-shaped llms.txt text. */
export function renderLlmsTxt(doc: LlmsDoc): string {
  const parts: string[] = [`# ${doc.title}`];
  if (doc.summary !== undefined) parts.push(`> ${doc.summary}`);
  if (doc.intro.length > 0) parts.push(doc.intro.join("\n"));
  for (const section of doc.sections) {
    const lines = [`## ${section.name}`, ""];
    for (const link of section.links) {
      const desc =
        link.description !== undefined && link.description !== ""
          ? `: ${link.description}`
          : "";
      lines.push(`- [${link.title}](${link.url})${desc}`);
    }
    parts.push(lines.join("\n"));
  }
  return `${parts.join("\n\n")}\n`;
}

/**
 * Render llms-full.txt: the header of llms.txt followed by every page body
 * inlined. Each page opens with `# <title>` and a `Source:` line so a
 * model reading the flat file can still cite the original URL; a leading
 * H1 duplicating the title is dropped from the body.
 */
export function renderLlmsFull(
  doc: LlmsDoc,
  pages: ScannedPage[],
  config: KitConfig
): string {
  const parts: string[] = [`# ${doc.title}`];
  if (doc.summary !== undefined) parts.push(`> ${doc.summary}`);
  for (const page of pages) {
    const body = stripLeadingH1(page.body).trim();
    const block = [
      "---",
      "",
      `# ${page.title}`,
      `Source: ${pageUrl(page.relPath, config)}`,
      ...(body !== "" ? ["", body] : []),
    ];
    parts.push(block.join("\n"));
  }
  return `${parts.join("\n\n")}\n`;
}

function stripLeadingH1(body: string): string {
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i++;
  if (i < lines.length && /^#\s+/.test(lines[i] ?? "")) {
    return lines.slice(i + 1).join("\n");
  }
  return body;
}

function countWords(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}
