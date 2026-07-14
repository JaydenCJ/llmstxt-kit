// Tests for the docs-tree scanner: deterministic walking order, glob
// matching, frontmatter interpretation and draft/exclude filtering.
// All trees are built in fresh temp directories.
import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import {
  globToRegExp,
  listMarkdownFiles,
  matchAny,
  naturalCompare,
  scanDocs,
} from "../dist/scan.js";
import { makeTree, testConfig } from "./helpers.mjs";

const cleanups = [];
after(() => cleanups.forEach((fn) => fn()));

function tree(files) {
  const t = makeTree(files);
  cleanups.push(t.cleanup);
  return t.root;
}

test("naturalCompare sorts numbered files numerically, not lexically", () => {
  // Plain string sort would put 10 before 2 and scramble ordered guides.
  assert.ok(naturalCompare("2-usage.md", "10-faq.md") < 0);
  assert.ok(naturalCompare("10-faq.md", "2-usage.md") > 0);
  assert.equal(naturalCompare("a.md", "a.md"), 0);
});

test("globToRegExp: * stays in a segment, ** crosses segments, metachars are literal", () => {
  assert.ok(globToRegExp("guides/*.md").test("guides/a.md"));
  assert.ok(!globToRegExp("guides/*.md").test("guides/sub/a.md"));
  assert.ok(globToRegExp("reference/**").test("reference/deep/nested.md"));
  assert.ok(globToRegExp("**/draft-*.md").test("x/y/draft-1.md"));
  // A leading **/ must also match files at the root.
  assert.ok(globToRegExp("**/draft-*.md").test("draft-1.md"));
  // A dot in ".md" must not match "a-md"; "+" must stay literal.
  assert.ok(!globToRegExp("*.md").test("a-md"));
  assert.ok(matchAny(["a+b/*.md"], "a+b/c.md"));
});

test("listMarkdownFiles walks recursively, sorted, skipping dot-dirs and node_modules", () => {
  const root = tree({
    "b.md": "# B",
    "a/10-ten.md": "# Ten",
    "a/2-two.md": "# Two",
    ".hidden/skip.md": "# skip",
    "node_modules/dep/readme.md": "# dep",
    "a/notes.txt": "not markdown",
  });
  assert.deepEqual(listMarkdownFiles(root), ["a/2-two.md", "a/10-ten.md", "b.md"]);
});

test("scanDocs derives title from the first H1 and description from the first paragraph", () => {
  const root = tree({ "guide.md": "# The Guide\n\nEverything you need.\n" });
  const [page] = scanDocs(root, testConfig());
  assert.equal(page.title, "The Guide");
  assert.equal(page.description, "Everything you need.");
});

test("scanDocs frontmatter title/description/section/order win over derived values", () => {
  const root = tree({
    "x/page.md": "---\ntitle: Custom\ndescription: Short.\nsection: Extras\norder: 5\n---\n# Ignored\n\nIgnored too.\n",
  });
  const [page] = scanDocs(root, testConfig());
  assert.equal(page.title, "Custom");
  assert.equal(page.description, "Short.");
  assert.equal(page.section, "Extras");
  assert.equal(page.order, 5);
});

test("scanDocs falls back to a humanized filename when a page has no heading", () => {
  const root = tree({ "getting-started/01-first-steps.md": "No heading here.\n" });
  const [page] = scanDocs(root, testConfig());
  assert.equal(page.title, "First steps");
});

test("scanDocs drops drafts and excluded paths before anything else sees them", () => {
  const root = tree({
    "keep.md": "# Keep",
    "draft.md": "---\ndraft: true\n---\n# Draft",
    "private/secret.md": "# Secret",
  });
  const pages = scanDocs(root, testConfig({ exclude: ["private/**"] }));
  assert.deepEqual(pages.map((p) => p.relPath), ["keep.md"]);
});

test("scanDocs marks the root index and flags optional pages from globs and frontmatter", () => {
  const root = tree({
    "index.md": "# Site\n\nSummary.\n",
    "ref/glossary.md": "# Glossary",
    "faq.md": "---\noptional: true\n---\n# FAQ",
  });
  const pages = scanDocs(root, testConfig({ optional: ["ref/**"] }));
  const byPath = Object.fromEntries(pages.map((p) => [p.relPath, p]));
  assert.equal(byPath["index.md"].isRootIndex, true);
  assert.equal(byPath["ref/glossary.md"].optional, true);
  assert.equal(byPath["faq.md"].optional, true);
});

test("scanDocs gives directory index pages a sort-first default order", () => {
  // api/index.md should lead its section unless frontmatter says otherwise.
  const root = tree({ "api/index.md": "# API overview", "api/auth.md": "# Auth" });
  const pages = scanDocs(root, testConfig());
  const index = pages.find((p) => p.relPath === "api/index.md");
  const auth = pages.find((p) => p.relPath === "api/auth.md");
  assert.ok(index.order < auth.order);
  assert.equal(index.isRootIndex, false);
});
