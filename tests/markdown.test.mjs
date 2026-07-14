// Unit tests for the zero-dependency Markdown utilities: frontmatter,
// headings (fence-aware), first-paragraph extraction, inline stripping,
// truncation and slug humanization.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  extractFrontmatter,
  firstHeading,
  firstParagraph,
  headings,
  humanize,
  inlineToPlain,
  truncate,
} from "../dist/markdown.js";

test("extractFrontmatter parses scalars (quoted, numeric, boolean) and strips the block", () => {
  const fm = extractFrontmatter('---\ntitle: "Hello"\norder: 3\ndraft: true\n---\nBody here\n');
  assert.deepEqual(fm.data, { title: "Hello", order: 3, draft: true });
  assert.equal(fm.body, "Body here\n");
  assert.equal(fm.bodyStartLine, 6);
  assert.equal(extractFrontmatter("---\ntitle: 'Quoted'\n---\nx").data.title, "Quoted");
});

test("extractFrontmatter without a leading --- returns the text untouched", () => {
  const fm = extractFrontmatter("# No frontmatter\n");
  assert.deepEqual(fm.data, {});
  assert.equal(fm.body, "# No frontmatter\n");
});

test("unterminated frontmatter is treated as body, not silently eaten", () => {
  // A file starting with a thematic break should not lose all its content.
  const fm = extractFrontmatter("---\ntitle: Oops\nno closing fence\n");
  assert.deepEqual(fm.data, {});
  assert.equal(fm.body, "---\ntitle: Oops\nno closing fence\n");
});

test("headings returns level, text and 1-based lines, ignoring fenced code", () => {
  const all = headings("# One\n\ntext\n\n## Two ##\n### Three\n");
  assert.deepEqual(all, [
    { level: 1, text: "One", line: 1 },
    { level: 2, text: "Two", line: 5 },
    { level: 3, text: "Three", line: 6 },
  ]);
  // A bash comment like `# install` must never become the page title.
  const fenced = headings("```bash\n# not a heading\n```\n## Real\n");
  assert.deepEqual(fenced, [{ level: 2, text: "Real", line: 4 }]);
});

test("firstHeading returns null for prose-only bodies", () => {
  assert.equal(firstHeading("just text\n"), null);
});

test("firstParagraph skips headings, lists and blockquotes", () => {
  const p = firstParagraph("# Title\n\n> quote\n\n- item\n\nActual prose here.\nSecond line.\n");
  assert.equal(p, "Actual prose here. Second line.");
});

test("firstParagraph skips fenced code and returns '' for prose-free bodies", () => {
  const p = firstParagraph("```js\nconst x = 1;\n```\n\nProse after code.\n");
  assert.equal(p, "Prose after code.");
  assert.equal(firstParagraph("# Only\n\n## Headings\n"), "");
});

test("inlineToPlain strips links, images, code spans, emphasis and tags", () => {
  const plain = inlineToPlain("See **[the guide](https://example.test/g.md)** with `code` and ![alt](i.png) <em>html</em>");
  assert.equal(plain, "See the guide with code and alt html");
});

test("truncate cuts at a word boundary with an ellipsis, leaves short text alone", () => {
  const out = truncate("alpha beta gamma delta", 15);
  assert.equal(out, "alpha beta…");
  assert.ok(out.length <= 15);
  assert.equal(truncate("short", 160), "short");
});

test("humanize strips numeric prefixes and uppercases known acronyms", () => {
  assert.equal(humanize("01-getting-started"), "Getting started");
  assert.equal(humanize("api"), "API");
  assert.equal(humanize("cli_reference"), "CLI reference");
});
