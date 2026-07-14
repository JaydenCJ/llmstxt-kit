// Tests for the lenient llms.txt parser: structure extraction with exact
// line numbers, fence awareness, and the bookkeeping the validator needs
// (extra H1s, malformed items, misplaced blockquotes, freeform prose).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseLlmsTxt } from "../dist/parse.js";

const GOOD = `# Site

> One-line summary.

Some intro prose.

## Docs

- [Alpha](https://example.test/a.md): first page
- [Beta](https://example.test/b.md)

## Optional

- [Extra](https://example.test/x.md): skippable
`;

test("parses title, summary, intro, sections and links with line numbers", () => {
  const doc = parseLlmsTxt(GOOD);
  assert.equal(doc.title, "Site");
  assert.equal(doc.titleLine, 1);
  assert.equal(doc.summary, "One-line summary.");
  assert.equal(doc.summaryLine, 3);
  assert.equal(doc.intro.length, 1);
  assert.deepEqual(doc.sections.map((s) => s.name), ["Docs", "Optional"]);
  const [alpha, beta] = doc.sections[0].links;
  assert.deepEqual(
    { title: alpha.title, url: alpha.url, description: alpha.description, line: alpha.line },
    { title: "Alpha", url: "https://example.test/a.md", description: "first page", line: 9 }
  );
  assert.equal(beta.hasDescription, false);
  assert.equal(beta.description, undefined);
  // A multi-line blockquote joins into a single summary string.
  assert.equal(parseLlmsTxt("# T\n\n> line one\n> line two\n").summary, "line one line two");
});

test("content before the H1 is recorded at its first line", () => {
  const doc = parseLlmsTxt("stray prose\nmore\n# T\n");
  assert.equal(doc.contentBeforeTitle, 1);
  assert.equal(doc.title, "T");
});

test("every H1 after the first is collected as an extra", () => {
  const doc = parseLlmsTxt("# One\n\n# Two\n\n# Three\n");
  assert.deepEqual(doc.extraH1s.map((h) => h.line), [3, 5]);
});

test("headings inside fenced code blocks are not structure", () => {
  const doc = parseLlmsTxt("# T\n\n## S\n\n```\n# not a title\n## not a section\n```\n");
  assert.equal(doc.extraH1s.length, 0);
  assert.deepEqual(doc.sections.map((s) => s.name), ["S"]);
});

test("list items that are not [title](url) links are flagged as malformed", () => {
  const doc = parseLlmsTxt("# T\n\n## S\n\n- plain item\n- [ok](/ok.md)\n- [bad](/b.md) trailing junk\n");
  assert.deepEqual(doc.sections[0].malformed.map((m) => m.line), [5, 7]);
  assert.equal(doc.sections[0].links.length, 1);
});

test("a link with a colon but empty description records hasDescription", () => {
  // Needed to distinguish "- [x](/x.md)" (fine) from "- [x](/x.md):" (W206).
  const doc = parseLlmsTxt("# T\n\n## S\n\n- [x](/x.md):\n");
  const link = doc.sections[0].links[0];
  assert.equal(link.hasDescription, true);
  assert.equal(link.description, "");
});

test("blockquotes after the first section are recorded once per group", () => {
  const doc = parseLlmsTxt("# T\n\n> ok summary\n\n## S\n\n> late\n> same group\n\n- [x](/x.md)\n\n> another\n");
  assert.deepEqual(doc.lateBlockquotes, [7, 12]);
  assert.equal(doc.summary, "ok summary");
});

test("prose inside a section is recorded once per contiguous block", () => {
  const doc = parseLlmsTxt("# T\n\n## S\n\nprose line one\nprose line two\n\n- [x](/x.md)\n\nsecond block\n");
  assert.deepEqual(doc.sections[0].freeform.map((f) => f.line), [5, 10]);
});

test("empty detection and endsWithNewline reflect the raw bytes", () => {
  assert.equal(parseLlmsTxt("").empty, true);
  assert.equal(parseLlmsTxt("  \n\n  \n").empty, true);
  assert.equal(parseLlmsTxt("# T\n").empty, false);
  assert.equal(parseLlmsTxt("# T\n").endsWithNewline, true);
  assert.equal(parseLlmsTxt("# T").endsWithNewline, false);
});
