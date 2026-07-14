/**
 * Shared data model for the llms.txt toolchain.
 *
 * The model follows the llms.txt proposal (https://llmstxt.org/): an H1
 * title, an optional blockquote summary, optional freeform intro prose,
 * and zero or more H2 sections whose bodies are lists of
 * `- [title](url): description` links. A section named exactly
 * "Optional" carries special meaning: its links may be skipped when a
 * shorter context is needed.
 */

/** One `- [title](url): description` entry inside a section. */
export interface LinkEntry {
  title: string;
  url: string;
  /** Text after the optional `:`; undefined when no colon was present. */
  description?: string;
}

/** One H2 section and its link list. */
export interface Section {
  name: string;
  links: LinkEntry[];
}

/** A structured llms.txt document. */
export interface LlmsDoc {
  title: string;
  /** Blockquote summary; undefined when absent. */
  summary?: string;
  /** Freeform prose lines between the summary and the first section. */
  intro: string[];
  sections: Section[];
}

/** Severity of a lint finding. `error` fails validation; `warning` only fails under `--strict`. */
export type Severity = "error" | "warning";

/** One lint finding, anchored to a 1-based line (0 = whole file). */
export interface Diagnostic {
  rule: string;
  severity: Severity;
  line: number;
  message: string;
}

/** The special section name defined by the llms.txt proposal. */
export const OPTIONAL_SECTION = "Optional";
