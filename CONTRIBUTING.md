# Contributing to llmstxt-kit

Issues, discussions and pull requests are all welcome — this project aims to
stay small, zero-dependency at runtime, and honest about what it checks.

## Getting started

Requirements: Node.js >= 22.13 (for the stable `node:test` runner used by the suite).

```bash
git clone https://github.com/JaydenCJ/llmstxt-kit.git
cd llmstxt-kit
npm install            # installs typescript, the only devDependency
npm run build          # compile TypeScript to dist/
npm test               # build + 92 node:test tests
bash scripts/smoke.sh  # end-to-end CLI check against examples/
```

`scripts/smoke.sh` exercises the real CLI (generate, validate, diff, exit
codes, idempotency) against the bundled example docs tree and must print
`SMOKE OK`.

## Before you open a pull request

1. `npx tsc -p tsconfig.json --noEmit` — the tree must type-check clean (strict mode is enforced).
2. `npm test` — all tests must pass.
3. `bash scripts/smoke.sh` — must print `SMOKE OK`.
4. Add tests for behavior changes; keep logic in pure, unit-testable modules
   (parsing/validation/diffing take strings, not file handles).
5. New lint rules need a row in `docs/rules.md`, the README table, and one
   test per rule.

## Ground rules

- **No runtime dependencies.** The zero-dependency install is a core
  feature; adding one needs justification in the PR and will usually be
  declined.
- No network calls, ever — the tool reads and writes local files only.
- Rule codes (`E1xx`/`W2xx`) are stable API: never renumber or repurpose
  an existing code; add new ones instead.
- Code comments and doc comments are written in English.
- Keep output deterministic: same tree + same config = byte-identical files.

## Reporting bugs

Please include: `llmstxt --version` output, the exact command line, the
input file (or a minimal docs tree) that reproduces the problem, and what
you expected. For validator bugs, the smallest llms.txt that mis-lints is
the most useful artifact.

## Security

Do not open public issues for security problems; use GitHub private
vulnerability reporting on this repository instead.
