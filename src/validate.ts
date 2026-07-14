/**
 * Rules engine over a parsed llms.txt document. Each rule has a stable
 * code (E1xx = spec violations, W2xx = quality findings), so tooling can
 * filter or suppress findings without string matching. The full catalog
 * is documented in docs/rules.md and mirrored in the README table.
 */

import { parseLlmsTxt, type ParsedDoc } from "./parse.js";
import { OPTIONAL_SECTION, type Diagnostic } from "./types.js";

export interface ValidationResult {
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
  /** True when there are no errors (warnings alone do not fail). */
  ok: boolean;
}

/** Rule catalog: code -> [severity, short description]. */
export const RULES: Record<string, [Diagnostic["severity"], string]> = {
  E101: ["error", "missing H1 title"],
  E102: ["error", "more than one H1 heading"],
  E103: ["error", "heading deeper than H2"],
  E104: ["error", "content before the H1 title"],
  E105: ["error", "list item is not a [title](url) link"],
  E106: ["error", "link with an empty title or empty URL"],
  E107: ["error", "duplicate section name"],
  E108: ["error", "file is empty"],
  W201: ["warning", "missing summary blockquote after the H1"],
  W202: ["warning", "section contains no links"],
  W203: ["warning", "duplicate link URL"],
  W204: ["warning", 'section "Optional" is not the last section'],
  W205: ["warning", "absolute URL with a scheme other than http(s)"],
  W206: ["warning", "link description is empty after the colon"],
  W207: ["warning", "blockquote after the first section (summary belongs under the H1)"],
  W208: ["warning", "freeform prose inside a section"],
  W209: ["warning", "file does not end with a newline"],
};

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/** Validate llms.txt text and return sorted diagnostics. */
export function validateLlmsTxt(text: string): ValidationResult {
  const doc = parseLlmsTxt(text);
  const diagnostics: Diagnostic[] = [];
  const emit = (rule: string, line: number, detail?: string): void => {
    const entry = RULES[rule] as [Diagnostic["severity"], string];
    diagnostics.push({
      rule,
      severity: entry[0],
      line,
      message: detail !== undefined ? `${entry[1]}: ${detail}` : entry[1],
    });
  };

  if (doc.empty) {
    emit("E108", 0);
    return finish(diagnostics);
  }

  checkStructure(doc, emit);
  checkSections(doc, emit);
  checkLinks(doc, emit);
  if (!doc.endsWithNewline) emit("W209", lastLineNumber(text));

  return finish(diagnostics);
}

type Emit = (rule: string, line: number, detail?: string) => void;

function checkStructure(doc: ParsedDoc, emit: Emit): void {
  if (doc.title === null) {
    emit("E101", 1);
  } else if (doc.title.trim() === "") {
    emit("E101", doc.titleLine, "H1 has no text");
  }
  for (const h1 of doc.extraH1s) emit("E102", h1.line, `"# ${h1.text}"`);
  for (const h of doc.deepHeadings) {
    emit("E103", h.line, `H${h.level} "${h.text}" (only H1 and H2 are structural)`);
  }
  if (doc.contentBeforeTitle > 0) emit("E104", doc.contentBeforeTitle);
  if (doc.title !== null && doc.summary === null) {
    emit("W201", doc.titleLine);
  }
  for (const line of doc.lateBlockquotes) emit("W207", line);
}

function checkSections(doc: ParsedDoc, emit: Emit): void {
  const seen = new Map<string, number>();
  for (const section of doc.sections) {
    const first = seen.get(section.name);
    if (first !== undefined) {
      emit("E107", section.line, `"${section.name}" already defined at line ${first}`);
    } else {
      seen.set(section.name, section.line);
    }
    for (const item of section.malformed) emit("E105", item.line, `"${item.text}"`);
    if (section.links.length === 0 && section.malformed.length === 0) {
      emit("W202", section.line, `"${section.name}"`);
    }
    for (const block of section.freeform) emit("W208", block.line);
  }
  const optionalIndex = doc.sections.findIndex((s) => s.name === OPTIONAL_SECTION);
  if (optionalIndex !== -1 && optionalIndex !== doc.sections.length - 1) {
    emit("W204", (doc.sections[optionalIndex] as { line: number }).line);
  }
}

function checkLinks(doc: ParsedDoc, emit: Emit): void {
  const urlFirstLine = new Map<string, number>();
  for (const section of doc.sections) {
    for (const link of section.links) {
      if (link.title === "" || link.url === "") {
        emit("E106", link.line, `[${link.title}](${link.url})`);
        continue;
      }
      const scheme = SCHEME.exec(link.url);
      if (scheme !== null) {
        const name = (scheme[1] as string).toLowerCase();
        if (name !== "http" && name !== "https") {
          emit("W205", link.line, `"${name}:" in ${link.url}`);
        }
      }
      const first = urlFirstLine.get(link.url);
      if (first !== undefined) {
        emit("W203", link.line, `${link.url} (first at line ${first})`);
      } else {
        urlFirstLine.set(link.url, link.line);
      }
      if (link.hasDescription && (link.description ?? "") === "") {
        emit("W206", link.line, `[${link.title}](${link.url}):`);
      }
    }
  }
}

function lastLineNumber(text: string): number {
  return text.split(/\r?\n/).length;
}

function finish(diagnostics: Diagnostic[]): ValidationResult {
  diagnostics.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.length - errorCount;
  return { diagnostics, errorCount, warningCount, ok: errorCount === 0 };
}
