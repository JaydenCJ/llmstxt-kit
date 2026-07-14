# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-07-12

### Added

- `llmstxt generate`: builds llms.txt from any Markdown docs tree — title
  and summary from the root index page (or config), sections from
  directories with config renaming/pinning, frontmatter overrides
  (`title`, `description`, `section`, `order`, `optional`, `draft`),
  numeric-aware page ordering, and three URL styles (`md`, `clean`, `html`).
- `llmstxt generate --full`: renders llms-full.txt with every page body
  inlined, per-page `Source:` lines and duplicate-H1 stripping.
- `llmstxt validate`: lints llms.txt against the spec with 17 stable-coded
  rules (8 errors E101–E108, 9 warnings W201–W209), exact line numbers,
  `--strict` mode and `--format json` output.
- `llmstxt diff`: structural comparison of two llms.txt files — title,
  summary, section and per-link (matched by URL) changes; exit code 1 on
  differences, `--format json` for scripting.
- Strict config loader for `llmstxt.config.json`: unknown keys and wrong
  types are hard errors, so typos cannot silently produce a wrong file.
- Fence-aware Markdown handling everywhere: headings inside code blocks are
  never treated as structure.
- Script-friendly exit codes (0 ok / 1 findings or differences / 2 usage
  or I/O error) shared by all subcommands.
- Public programmatic API (`scanDocs`, `generate`, `parseLlmsTxt`,
  `validateLlmsTxt`, `diffLlmsTxt`) with type declarations.
- Test suite: 92 node:test tests (unit + CLI integration in fresh temp
  dirs) and an end-to-end `scripts/smoke.sh` against the bundled example
  docs tree.

[0.1.0]: https://github.com/JaydenCJ/llmstxt-kit/releases/tag/v0.1.0
