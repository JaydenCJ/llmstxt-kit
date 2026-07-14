# Lint rule catalog

`llmstxt validate` checks an llms.txt file against the structure defined by
the [llms.txt proposal](https://llmstxt.org/): one H1 title, an optional
blockquote summary, optional freeform intro prose, then H2 sections whose
bodies are lists of `- [title](url): description` links. A section named
exactly `Optional` carries special meaning — its links may be skipped when a
shorter context is needed — so its placement is checked too.

Rule codes are stable API: scripts may match on them, and they never change
meaning within a major version. `E1xx` rules are **errors** (structural spec
violations, exit code 1); `W2xx` rules are **warnings** (quality findings,
exit code 0 unless `--strict`).

Everything is checked outside fenced code blocks: a `# comment` inside
``` fences is content, never structure.

## Errors

| Rule | Fires when | Why it matters |
|---|---|---|
| E101 | The file has no H1, or the H1 has no text | The H1 is the only required element of llms.txt |
| E102 | A second (third, …) H1 appears | Consumers treat the first H1 as the document name; extras are ambiguous |
| E103 | An H3–H6 heading appears | Only H1 and H2 are structural in llms.txt; deeper levels are undefined |
| E104 | Non-blank content precedes the H1 | Parsers anchor on the H1 being first |
| E105 | A list item inside a section is not `- [title](url)` | Sections are file lists; anything else is silently dropped by consumers |
| E106 | A link has an empty title or empty URL | `[]()` renders but points nowhere |
| E107 | Two sections share a name | Section names are keys for consumers that select context by section |
| E108 | The file is empty or whitespace-only | Usually a broken generation pipeline |

## Warnings

| Rule | Fires when | Why it matters |
|---|---|---|
| W201 | No blockquote summary follows the H1 | The summary is the highest-value context per token in the file |
| W202 | A section has no links at all | Dead weight; usually a generator bug or an abandoned edit |
| W203 | The same URL appears twice anywhere | Wastes context budget; second entry cites the first line |
| W204 | `Optional` is not the last section | Consumers truncate from the bottom; Optional must sit where truncation starts |
| W205 | An absolute URL uses a scheme other than http(s) | `ftp:`/`javascript:`/`mailto:` links are useless to crawlers |
| W206 | A link ends with `:` but no description follows | Either add the description or drop the colon |
| W207 | A blockquote appears after sections started | Late blockquotes are not summaries; consumers ignore them |
| W208 | Freeform prose appears inside a section | Prose belongs in the intro, before the first H2 |
| W209 | The file does not end with a newline | Concatenation-based consumers glue the last line to the next file |

## Severity semantics

- Default mode: errors → exit 1, warnings alone → exit 0.
- `--strict`: any finding → exit 1. Use this once your file is clean.
- Exit 2 is reserved for usage/IO problems (missing file, bad flag), so
  scripts can tell "the file is bad" from "the invocation is bad".
