# Examples

A complete, realistic docs tree for a fictional self-hosted app ("Brewlog")
plus the config that turns it into llms.txt. The test suite and
`scripts/smoke.sh` both run against this tree, so it is guaranteed to stay
working.

## Try it

```bash
# from the repository root, after `npm install && npm run build`
cd examples
node ../dist/cli.js generate --full
node ../dist/cli.js validate llms.txt
```

## What the tree demonstrates

| File | Demonstrates |
|---|---|
| `docs/index.md` | Root index page: source of the H1 and the blockquote summary |
| `docs/getting-started/*.md` | Frontmatter `order` and `description` overrides |
| `docs/guides/01-recipes.md`, `02-importing.md` | Numeric-prefix ordering (`2` before `10`) |
| `docs/guides/backup.md` | Frontmatter `title` override, no H1 needed |
| `docs/api/index.md` | Directory index pages sort first in their section |
| `docs/reference/*` | Routed into the `Optional` section via config glob |
| `docs/internal-notes.md` | `draft: true` pages never appear in any output |
| `llmstxt.config.json` | `sections` renaming, `sectionOrder` pinning, `baseUrl` |

Generated `llms.txt` / `llms-full.txt` files are gitignored — regenerate
them with the command above.
