// One test per lint rule, plus ordering and severity accounting. Each
// fixture is the smallest document that triggers exactly the rule under
// test (aside from unavoidable companions, asserted explicitly).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { validateLlmsTxt, RULES } from "../dist/validate.js";

/** Rule codes fired by a text. */
function rulesOf(text) {
  return validateLlmsTxt(text).diagnostics.map((d) => d.rule);
}

function diagnostic(text, rule) {
  const hit = validateLlmsTxt(text).diagnostics.find((d) => d.rule === rule);
  assert.ok(hit !== undefined, `expected ${rule} to fire`);
  return hit;
}

const CLEAN = `# Site

> Summary.

## Docs

- [A](https://example.test/a.md): about A

## Optional

- [B](https://example.test/b.md): about B
`;

test("a spec-shaped document produces zero diagnostics", () => {
  assert.deepEqual(rulesOf(CLEAN), []);
});

test("E101 fires for a missing H1 and for an H1 with no text", () => {
  const d = diagnostic("## Section\n\n- [A](/a.md)\n", "E101");
  assert.equal(d.severity, "error");
  assert.ok(rulesOf("#  \n\n> s\n").includes("E101"));
});

test("E102 fires once per extra H1, with the offending line", () => {
  const result = validateLlmsTxt("# One\n\n> s\n\n# Two\n\n# Three\n");
  const hits = result.diagnostics.filter((d) => d.rule === "E102");
  assert.deepEqual(hits.map((d) => d.line), [5, 7]);
});

test("E103 fires for H3-H6 headings, which are not llms.txt structure", () => {
  const d = diagnostic("# T\n\n> s\n\n### Deep\n", "E103");
  assert.equal(d.line, 5);
  assert.ok(d.message.includes("H3"));
});

test("E104 fires when content precedes the H1", () => {
  const d = diagnostic("stray\n# T\n\n> s\n", "E104");
  assert.equal(d.line, 1);
});

test("E105 fires for list items that are not [title](url) links", () => {
  const d = diagnostic("# T\n\n> s\n\n## S\n\n- not a link\n", "E105");
  assert.equal(d.line, 7);
  assert.ok(d.message.includes("not a link"));
});

test("E106 fires for links with an empty title or empty URL", () => {
  assert.ok(rulesOf("# T\n\n> s\n\n## S\n\n- [](/a.md)\n").includes("E106"));
  assert.ok(rulesOf("# T\n\n> s\n\n## S\n\n- [a]()\n").includes("E106"));
});

test("E107 fires for duplicate section names and cites the first definition", () => {
  const d = diagnostic("# T\n\n> s\n\n## S\n\n- [a](/a.md)\n\n## S\n\n- [b](/b.md)\n", "E107");
  assert.ok(d.message.includes("line 5"));
});

test("E108 is the only diagnostic for an empty file", () => {
  assert.deepEqual(rulesOf(""), ["E108"]);
  assert.deepEqual(rulesOf("   \n \n"), ["E108"]);
});

test("W201 fires when the summary blockquote is missing", () => {
  const d = diagnostic("# T\n\n## S\n\n- [a](/a.md)\n", "W201");
  assert.equal(d.severity, "warning");
});

test("W202 fires for a section with no links (unless it has malformed items)", () => {
  assert.ok(rulesOf("# T\n\n> s\n\n## Empty\n").includes("W202"));
  // With a malformed item present, E105 already explains the problem.
  const rules = rulesOf("# T\n\n> s\n\n## S\n\n- broken\n");
  assert.ok(rules.includes("E105"));
  assert.ok(!rules.includes("W202"));
});

test("W203 fires on the second occurrence of a URL and cites the first line", () => {
  const d = diagnostic("# T\n\n> s\n\n## S\n\n- [a](/same.md)\n- [b](/same.md)\n", "W203");
  assert.equal(d.line, 8);
  assert.ok(d.message.includes("line 7"));
});

test("W204 fires when Optional is not the last section", () => {
  const text = "# T\n\n> s\n\n## Optional\n\n- [a](/a.md)\n\n## Docs\n\n- [b](/b.md)\n";
  assert.ok(rulesOf(text).includes("W204"));
  assert.ok(!rulesOf(CLEAN).includes("W204"));
});

test("W205 fires for non-http(s) schemes but not for relative URLs", () => {
  assert.ok(rulesOf("# T\n\n> s\n\n## S\n\n- [a](ftp://example.test/a)\n").includes("W205"));
  assert.ok(rulesOf("# T\n\n> s\n\n## S\n\n- [a](javascript:alert(1))\n").includes("W205"));
  assert.ok(!rulesOf("# T\n\n> s\n\n## S\n\n- [a](/rel.md)\n").includes("W205"));
});

test("W206 fires for a colon with nothing after it", () => {
  const d = diagnostic("# T\n\n> s\n\n## S\n\n- [a](/a.md):\n", "W206");
  assert.equal(d.line, 7);
});

test("W207 fires for blockquotes that appear after sections started", () => {
  const d = diagnostic("# T\n\n> s\n\n## S\n\n- [a](/a.md)\n\n> late quote\n", "W207");
  assert.equal(d.line, 9);
});

test("W208 fires for freeform prose inside a section", () => {
  const d = diagnostic("# T\n\n> s\n\n## S\n\nsome prose\n\n- [a](/a.md)\n", "W208");
  assert.equal(d.line, 7);
});

test("W209 fires when the file does not end with a newline", () => {
  assert.ok(rulesOf("# T\n\n> s\n\n## S\n\n- [a](/a.md)").includes("W209"));
  assert.ok(!rulesOf(CLEAN).includes("W209"));
});

test("diagnostics are line-sorted, counted by severity, and warnings alone keep ok=true", () => {
  const failing = validateLlmsTxt("junk\n# T\n\n### deep\n\n## S\n\n- broken\n");
  const lines = failing.diagnostics.map((d) => d.line);
  assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
  assert.equal(failing.errorCount + failing.warningCount, failing.diagnostics.length);
  assert.equal(failing.ok, false);

  const warnOnly = validateLlmsTxt("# T\n\n## S\n\n- [a](/a.md)\n");
  assert.ok(warnOnly.warningCount > 0);
  assert.equal(warnOnly.errorCount, 0);
  assert.equal(warnOnly.ok, true);
});

test("every rule in the catalog has a severity matching its prefix", () => {
  for (const [code, [severity]] of Object.entries(RULES)) {
    assert.equal(severity, code.startsWith("E") ? "error" : "warning", code);
  }
});
