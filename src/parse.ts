/**
 * Lenient llms.txt parser. It never throws on malformed input: instead it
 * records everything the validator needs to point at exact lines — extra
 * H1s, content before the title, misplaced blockquotes, malformed list
 * items, prose inside sections, headings deeper than H2.
 *
 * Fenced code blocks are respected: a `# heading` inside ``` fences is
 * content, not structure.
 */

import { isFenceLine } from "./markdown.js";
import type { LinkEntry } from "./types.js";

export interface ParsedLink extends LinkEntry {
  line: number;
  /** True when a `:` followed the link (even with empty text after it). */
  hasDescription: boolean;
}

export interface FlaggedLine {
  line: number;
  text: string;
}

export interface ParsedSection {
  name: string;
  line: number;
  links: ParsedLink[];
  /** List items that are not `- [title](url)` links. */
  malformed: FlaggedLine[];
  /** First line of each contiguous block of prose inside the section. */
  freeform: FlaggedLine[];
}

export interface ParsedDoc {
  /** H1 text, or null when the file has none. */
  title: string | null;
  titleLine: number;
  /** Any H1 after the first. */
  extraH1s: FlaggedLine[];
  /** Blockquote summary (first blockquote group after the H1), or null. */
  summary: string | null;
  summaryLine: number;
  /** First lines of blockquote groups that appear after sections started. */
  lateBlockquotes: number[];
  /** First line of non-blank content that precedes the H1 (0 = none). */
  contentBeforeTitle: number;
  /** Freeform prose lines between the summary and the first section. */
  intro: FlaggedLine[];
  /** H3–H6 headings anywhere in the file. */
  deepHeadings: Array<{ line: number; level: number; text: string }>;
  sections: ParsedSection[];
  endsWithNewline: boolean;
  /** True when the file contains no non-blank content at all. */
  empty: boolean;
}

const LIST_ITEM = /^\s*[-*+]\s+(.*)$/;
// URL part allows one level of nested parentheses, common in real URLs
// (e.g. wiki-style "Foo_(bar)") and needed to lint javascript:alert(1).
const LINK_ITEM = /^\s*[-*+]\s+\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Parse llms.txt text into a lossless-enough structure for validation and diffing. */
export function parseLlmsTxt(text: string): ParsedDoc {
  const doc: ParsedDoc = {
    title: null,
    titleLine: 0,
    extraH1s: [],
    summary: null,
    summaryLine: 0,
    lateBlockquotes: [],
    contentBeforeTitle: 0,
    intro: [],
    deepHeadings: [],
    sections: [],
    endsWithNewline: text.endsWith("\n"),
    empty: text.trim() === "",
  };
  if (doc.empty) return doc;

  const lines = text.split(/\r?\n/);
  let inFence = false;
  let current: ParsedSection | null = null;
  let summaryOpen = false; // currently collecting the summary blockquote group
  let inLateQuote = false;
  let inFreeform = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const lineNo = i + 1;
    const trimmed = raw.trim();

    if (isFenceLine(raw)) {
      inFence = !inFence;
      noteContent(doc, current, lineNo, raw, inFreeform);
      inFreeform = current !== null;
      summaryOpen = false;
      inLateQuote = false;
      continue;
    }
    if (inFence) {
      noteContent(doc, current, lineNo, raw, inFreeform);
      inFreeform = current !== null && trimmed !== "";
      continue;
    }

    if (trimmed === "") {
      summaryOpen = false;
      inLateQuote = false;
      inFreeform = false;
      continue;
    }

    const heading = HEADING.exec(raw);
    if (heading !== null) {
      const level = (heading[1] as string).length;
      const textPart = (heading[2] ?? "").trim();
      summaryOpen = false;
      inLateQuote = false;
      inFreeform = false;
      if (level === 1) {
        if (doc.title === null) {
          doc.title = textPart;
          doc.titleLine = lineNo;
        } else {
          doc.extraH1s.push({ line: lineNo, text: textPart });
        }
      } else if (level === 2) {
        current = { name: textPart, line: lineNo, links: [], malformed: [], freeform: [] };
        doc.sections.push(current);
      } else {
        doc.deepHeadings.push({ line: lineNo, level, text: textPart });
      }
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteText = trimmed.replace(/^>\s?/, "");
      if (current === null && doc.title !== null && doc.summary === null) {
        doc.summary = quoteText;
        doc.summaryLine = lineNo;
        summaryOpen = true;
      } else if (summaryOpen && current === null) {
        doc.summary = `${doc.summary ?? ""} ${quoteText}`.trim();
      } else if (current !== null) {
        if (!inLateQuote) doc.lateBlockquotes.push(lineNo);
        inLateQuote = true;
      } else {
        // Blockquote before the H1, or a second group in the intro.
        noteContent(doc, current, lineNo, raw, inFreeform);
      }
      inFreeform = false;
      continue;
    }
    summaryOpen = false;
    inLateQuote = false;

    if (current !== null) {
      const listItem = LIST_ITEM.exec(raw);
      if (listItem !== null) {
        const link = LINK_ITEM.exec(raw);
        const rest = link !== null ? (link[3] ?? "").trim() : "";
        if (link !== null && (rest === "" || rest.startsWith(":"))) {
          current.links.push({
            title: (link[1] ?? "").trim(),
            url: (link[2] ?? "").trim(),
            line: lineNo,
            hasDescription: rest.startsWith(":"),
            ...(rest.startsWith(":")
              ? { description: rest.replace(/^:\s*/, "") }
              : {}),
          });
        } else {
          current.malformed.push({ line: lineNo, text: trimmed });
        }
        inFreeform = false;
        continue;
      }
    }

    noteContent(doc, current, lineNo, raw, inFreeform);
    inFreeform = current !== null;
  }
  return doc;
}

/**
 * Record a non-structural content line: before the H1 it flags
 * `contentBeforeTitle`, between H1 and the first section it is intro
 * prose, inside a section it opens (or continues) a freeform block.
 */
function noteContent(
  doc: ParsedDoc,
  current: ParsedSection | null,
  lineNo: number,
  raw: string,
  continuing: boolean
): void {
  const trimmed = raw.trim();
  if (trimmed === "") return;
  if (current !== null) {
    if (!continuing) current.freeform.push({ line: lineNo, text: trimmed });
    return;
  }
  if (doc.title === null) {
    if (doc.contentBeforeTitle === 0) doc.contentBeforeTitle = lineNo;
    return;
  }
  doc.intro.push({ line: lineNo, text: trimmed });
}
