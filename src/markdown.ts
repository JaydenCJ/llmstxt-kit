/**
 * Minimal Markdown utilities used across the toolchain.
 *
 * This is deliberately not a general-purpose Markdown parser: llmstxt-kit
 * only needs frontmatter, headings, first paragraphs and inline-formatting
 * removal, all of which are implemented here with zero dependencies. Every
 * function is pure (string in, value out) and fence-aware where structure
 * matters, so ``` code blocks never leak headings into the model.
 */

export interface Frontmatter {
  /** Parsed key/value pairs. Only flat scalar values are supported. */
  data: Record<string, string | number | boolean>;
  /** Document body with the frontmatter block removed. */
  body: string;
  /** 1-based line number in the original text where the body starts. */
  bodyStartLine: number;
}

/**
 * Extract a leading `--- key: value ... ---` frontmatter block.
 * Nested YAML is out of scope; unknown or non-scalar lines are ignored.
 * An unterminated block is treated as plain body text (safer than eating
 * the whole file).
 */
export function extractFrontmatter(text: string): Frontmatter {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") {
    return { data: {}, body: text, bodyStartLine: 1 };
  }
  const data: Record<string, string | number | boolean> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "---") {
      return {
        data,
        body: lines.slice(i + 1).join("\n"),
        bodyStartLine: i + 2,
      };
    }
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (m !== null) {
      data[m[1] as string] = coerceScalar(m[2] ?? "");
    }
  }
  return { data: {}, body: text, bodyStartLine: 1 };
}

function coerceScalar(raw: string): string | number | boolean {
  const v = raw.trim();
  const quoted = /^"(.*)"$/.exec(v) ?? /^'(.*)'$/.exec(v);
  if (quoted !== null) return quoted[1] ?? "";
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export interface Heading {
  level: number;
  text: string;
  /** 1-based line number within the given body. */
  line: number;
}

/** True when a line opens or closes a fenced code block. */
export function isFenceLine(line: string): boolean {
  return /^\s{0,3}(```|~~~)/.test(line);
}

/** All ATX headings (`#` .. `######`) outside fenced code blocks. */
export function headings(body: string): Heading[] {
  const out: Heading[] = [];
  const lines = body.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m !== null) {
      out.push({ level: (m[1] as string).length, text: (m[2] ?? "").trim(), line: i + 1 });
    }
  }
  return out;
}

/** First heading of the body, or null when it has none. */
export function firstHeading(body: string): Heading | null {
  const all = headings(body);
  return all.length > 0 ? (all[0] as Heading) : null;
}

/**
 * First paragraph of plain prose: skips headings, blockquotes, lists,
 * tables, HTML blocks and fenced code, then joins consecutive plain lines
 * and strips inline formatting. Returns "" when the body has no prose.
 */
export function firstParagraph(body: string): string {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  const collected: string[] = [];
  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const t = line.trim();
    if (t === "") {
      if (collected.length > 0) break;
      continue;
    }
    if (collected.length === 0 && isStructuralLine(t)) continue;
    if (collected.length > 0 && isStructuralLine(t)) break;
    collected.push(t);
  }
  return inlineToPlain(collected.join(" "));
}

function isStructuralLine(trimmed: string): boolean {
  return (
    /^#{1,6}\s/.test(trimmed) ||
    trimmed.startsWith(">") ||
    /^[-*+]\s/.test(trimmed) ||
    /^\d+\.\s/.test(trimmed) ||
    trimmed.startsWith("|") ||
    trimmed.startsWith("<") ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)
  );
}

/**
 * Reduce inline Markdown to plain text: images to alt text, links to their
 * label, code spans and emphasis unwrapped, HTML tags dropped, whitespace
 * collapsed. Good enough for one-line link descriptions.
 */
export function inlineToPlain(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate at a word boundary, appending an ellipsis when text was cut. */
export function truncate(text: string, max: number): string {
  if (max <= 1 || text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const head = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[\s,;:]+$/, "")}…`;
}

const ACRONYMS = new Set(["api", "cli", "faq", "sdk", "http", "url", "ui", "sql"]);

/**
 * Turn a file or directory slug into a human title:
 * "01-getting-started" -> "Getting started", "api" -> "API".
 */
export function humanize(slug: string): string {
  const stripped = slug.replace(/^\d+[-_.]\s*/, "");
  const words = stripped
    .split(/[-_\s]+/)
    .filter((w) => w.length > 0)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w));
  if (words.length === 0) return slug;
  const joined = words.join(" ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
