// Tests for the structural differ: identical files, title/summary changes,
// section- and link-level changes, and the human-readable rendering.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { diffLlmsTxt, formatDiff } from "../dist/diffing.js";

const BASE = `# Site

> Summary.

## Docs

- [Alpha](https://example.test/a.md): about A
- [Beta](https://example.test/b.md): about B

## Guides

- [Gamma](https://example.test/g.md): about G
`;

test("identical files produce an identical diff with zero changes", () => {
  const diff = diffLlmsTxt(BASE, BASE);
  assert.equal(diff.identical, true);
  assert.equal(diff.changeCount, 0);
  assert.equal(formatDiff(diff), "llms.txt files are identical\n");
});

test("formatting-only edits are not changes (structural, not textual, diff)", () => {
  // Extra blank lines and asterisk bullets parse to the same model.
  const reformatted = BASE.replace(/\n## Guides/, "\n\n## Guides").replace(/^- /gm, "* ");
  const diff = diffLlmsTxt(BASE, reformatted);
  assert.equal(diff.identical, true);
});

test("title and summary changes are reported with before/after", () => {
  const changed = BASE.replace("# Site", "# New Site").replace("> Summary.", "> Better summary.");
  const diff = diffLlmsTxt(BASE, changed);
  assert.deepEqual(diff.titleChanged, { from: "Site", to: "New Site" });
  assert.deepEqual(diff.summaryChanged, { from: "Summary.", to: "Better summary." });
  assert.equal(diff.changeCount, 2);
});

test("added and removed sections are listed by name", () => {
  const changed = BASE.replace(/## Guides[\s\S]*$/, "## API\n\n- [Ref](https://example.test/r.md)\n");
  const diff = diffLlmsTxt(BASE, changed);
  assert.deepEqual(diff.sectionsAdded, ["API"]);
  assert.deepEqual(diff.sectionsRemoved, ["Guides"]);
});

test("links are matched by URL: adds, removes and field changes are separated", () => {
  const changed = BASE
    .replace("- [Alpha](https://example.test/a.md): about A\n", "")
    .replace(
      "- [Beta](https://example.test/b.md): about B",
      "- [Beta renamed](https://example.test/b.md): about B, expanded\n- [Delta](https://example.test/d.md): new page"
    );
  const diff = diffLlmsTxt(BASE, changed);
  const docs = diff.sectionChanges.find((s) => s.name === "Docs");
  assert.deepEqual(docs.removed.map((l) => l.url), ["https://example.test/a.md"]);
  assert.deepEqual(docs.added.map((l) => l.url), ["https://example.test/d.md"]);
  assert.equal(docs.changed.length, 1);
  assert.deepEqual(docs.changed[0].fields, ["title", "description"]);
  assert.equal(diff.changeCount, 3);
  // A description-only change reports just that field.
  const descOnly = diffLlmsTxt(BASE, BASE.replace(": about G", ": rewritten G"));
  assert.deepEqual(descOnly.sectionChanges[0].changed[0].fields, ["description"]);
});

test("a link moved between sections counts as removed + added", () => {
  // Documented behaviour: URL identity is per-section, not global.
  const moved = BASE
    .replace("- [Beta](https://example.test/b.md): about B\n", "")
    .replace(
      "- [Gamma](https://example.test/g.md): about G",
      "- [Gamma](https://example.test/g.md): about G\n- [Beta](https://example.test/b.md): about B"
    );
  const diff = diffLlmsTxt(BASE, moved);
  assert.equal(diff.changeCount, 2);
  const docs = diff.sectionChanges.find((s) => s.name === "Docs");
  const guides = diff.sectionChanges.find((s) => s.name === "Guides");
  assert.equal(docs.removed.length, 1);
  assert.equal(guides.added.length, 1);
});

test("formatDiff renders one prefixed line per change", () => {
  const changed = BASE.replace("# Site", "# New Site").replace(
    "- [Alpha](https://example.test/a.md): about A\n",
    ""
  );
  const text = formatDiff(diffLlmsTxt(BASE, changed));
  assert.ok(text.includes('~ title: "Site" -> "New Site"'));
  assert.ok(text.includes("  - [Alpha](https://example.test/a.md)"));
  assert.ok(text.startsWith("llms.txt files differ: 2 changes"));
});

test("formatDiff pluralizes the change count correctly", () => {
  // Exactly one change must render "1 change", never "1 changes".
  const one = formatDiff(diffLlmsTxt(BASE, BASE.replace("# Site", "# New Site")));
  assert.ok(one.startsWith("llms.txt files differ: 1 change\n"));
});
