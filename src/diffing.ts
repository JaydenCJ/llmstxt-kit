/**
 * Structural diff between two llms.txt files. Unlike a textual diff, this
 * compares the parsed model: title, summary, sections, and links matched
 * by URL — so reordering description text or reflowing whitespace inside
 * a line is a change, but identical content parsed from differently
 * formatted files is not noise. A link moved between sections reports as
 * removed + added (documented behaviour).
 */

import { parseLlmsTxt } from "./parse.js";
import type { LinkEntry } from "./types.js";

export interface LinkChange {
  url: string;
  from: LinkEntry;
  to: LinkEntry;
  /** Which fields differ: "title", "description" or both. */
  fields: string[];
}

export interface SectionDiff {
  name: string;
  added: LinkEntry[];
  removed: LinkEntry[];
  changed: LinkChange[];
}

export interface DocDiff {
  identical: boolean;
  changeCount: number;
  titleChanged: { from: string; to: string } | null;
  summaryChanged: { from: string | null; to: string | null } | null;
  sectionsAdded: string[];
  sectionsRemoved: string[];
  /** Sections present in both files that have link-level changes. */
  sectionChanges: SectionDiff[];
}

/** Compare two llms.txt texts structurally. */
export function diffLlmsTxt(oldText: string, newText: string): DocDiff {
  const a = parseLlmsTxt(oldText);
  const b = parseLlmsTxt(newText);

  const titleA = a.title ?? "";
  const titleB = b.title ?? "";
  const titleChanged = titleA !== titleB ? { from: titleA, to: titleB } : null;
  const summaryChanged =
    (a.summary ?? null) !== (b.summary ?? null)
      ? { from: a.summary, to: b.summary }
      : null;

  const namesA = a.sections.map((s) => s.name);
  const namesB = b.sections.map((s) => s.name);
  const sectionsAdded = namesB.filter((n) => !namesA.includes(n));
  const sectionsRemoved = namesA.filter((n) => !namesB.includes(n));

  const sectionChanges: SectionDiff[] = [];
  for (const name of namesA.filter((n) => namesB.includes(n))) {
    const diff = diffSection(
      name,
      linksOf(a, name),
      linksOf(b, name)
    );
    if (diff.added.length + diff.removed.length + diff.changed.length > 0) {
      sectionChanges.push(diff);
    }
  }

  const changeCount =
    (titleChanged !== null ? 1 : 0) +
    (summaryChanged !== null ? 1 : 0) +
    sectionsAdded.length +
    sectionsRemoved.length +
    sectionChanges.reduce(
      (n, s) => n + s.added.length + s.removed.length + s.changed.length,
      0
    );

  return {
    identical: changeCount === 0,
    changeCount,
    titleChanged,
    summaryChanged,
    sectionsAdded,
    sectionsRemoved,
    sectionChanges,
  };
}

function linksOf(
  doc: ReturnType<typeof parseLlmsTxt>,
  name: string
): LinkEntry[] {
  const section = doc.sections.find((s) => s.name === name);
  if (section === undefined) return [];
  return section.links.map((l) => ({
    title: l.title,
    url: l.url,
    ...(l.description !== undefined ? { description: l.description } : {}),
  }));
}

function diffSection(name: string, before: LinkEntry[], after: LinkEntry[]): SectionDiff {
  const byUrlBefore = new Map(before.map((l) => [l.url, l]));
  const byUrlAfter = new Map(after.map((l) => [l.url, l]));
  const added = after.filter((l) => !byUrlBefore.has(l.url));
  const removed = before.filter((l) => !byUrlAfter.has(l.url));
  const changed: LinkChange[] = [];
  for (const link of after) {
    const old = byUrlBefore.get(link.url);
    if (old === undefined) continue;
    const fields: string[] = [];
    if (old.title !== link.title) fields.push("title");
    if ((old.description ?? "") !== (link.description ?? "")) fields.push("description");
    if (fields.length > 0) changed.push({ url: link.url, from: old, to: link, fields });
  }
  return { name, added, removed, changed };
}

/** Human-readable rendering of a diff, one change per line. */
export function formatDiff(diff: DocDiff): string {
  if (diff.identical) return "llms.txt files are identical\n";
  const lines: string[] = [
    `llms.txt files differ: ${diff.changeCount} change${diff.changeCount === 1 ? "" : "s"}`,
  ];
  if (diff.titleChanged !== null) {
    lines.push(`~ title: "${diff.titleChanged.from}" -> "${diff.titleChanged.to}"`);
  }
  if (diff.summaryChanged !== null) {
    lines.push(
      `~ summary: ${quoteOrNone(diff.summaryChanged.from)} -> ${quoteOrNone(diff.summaryChanged.to)}`
    );
  }
  for (const name of diff.sectionsRemoved) lines.push(`- section "${name}"`);
  for (const name of diff.sectionsAdded) lines.push(`+ section "${name}"`);
  for (const section of diff.sectionChanges) {
    lines.push(`section "${section.name}":`);
    for (const link of section.removed) lines.push(`  - [${link.title}](${link.url})`);
    for (const link of section.added) lines.push(`  + [${link.title}](${link.url})`);
    for (const change of section.changed) {
      lines.push(`  ~ [${change.to.title}](${change.url}) ${change.fields.join("+")} changed`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function quoteOrNone(text: string | null): string {
  return text === null ? "(none)" : `"${text}"`;
}
