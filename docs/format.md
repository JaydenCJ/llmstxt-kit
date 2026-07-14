# Generation model

How `llmstxt generate` maps a Markdown docs tree onto llms.txt and
llms-full.txt. Everything on this page is deterministic: the same tree and
config always produce byte-identical output.

## Page discovery

- Files matching `*.md` / `*.markdown` are scanned recursively.
- Dot-directories, dot-files and `node_modules` are always skipped.
- `exclude` globs (config) drop pages entirely; frontmatter `draft: true`
  does the same per page.
- Walking order is numeric-aware: `2-usage.md` sorts before `10-faq.md`.

## Per-page metadata

| Value | Source (first match wins) |
|---|---|
| Title | frontmatter `title` → first heading in the body → humanized filename |
| Description | frontmatter `description` → first prose paragraph (truncated at `maxDescriptionLength`) |
| Section | frontmatter `section` → `sections[<top-level dir>]` (config) → humanized directory name → `rootSection` for root-level pages |
| Sort key | frontmatter `order` → index/README pages first → path order |
| Optional | frontmatter `optional: true` → `optional` globs (config) |

Only flat scalar frontmatter is parsed (`key: value`); nested YAML is
ignored rather than guessed at.

## The root index page

`index.md` or `README.md` at the docs root is treated as the site page, not
a link: its heading becomes the H1 (unless config `name` overrides it) and
its description/first paragraph becomes the blockquote summary (unless
config `summary` overrides it). It is excluded from sections and from
llms-full.txt.

## Section ordering

1. Names listed in `sectionOrder`, in that order.
2. Remaining sections, alphabetically.
3. `Optional` always last — that is where context-budget truncation starts.

## URL mapping

`baseUrl` + the page's relative path, with segments percent-encoded.

| `urlStyle` | `guides/tips.md` becomes | `api/index.md` becomes |
|---|---|---|
| `md` (default) | `…/guides/tips.md` | `…/api/index.md` |
| `clean` | `…/guides/tips` | `…/api/` |
| `html` | `…/guides/tips.html` | `…/api/index.html` |

The `md` default is deliberate: AI crawlers prefer fetching raw Markdown.

## llms-full.txt layout

The header of llms.txt (H1 + summary), then one block per page in final
document order, separated by `---` rules:

```text
---

# <page title>
Source: <page url>

<page body, frontmatter stripped>
```

A leading H1 in the body that duplicates the title is dropped, so every
page contributes exactly one `# <title>` heading. The `Source:` line lets a
model reading the flat file cite the original URL.
