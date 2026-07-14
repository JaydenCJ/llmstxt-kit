// Tests for the generator: document assembly, section ordering, URL
// styles, llms.txt / llms-full.txt rendering and byte-for-byte determinism.
import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import { buildDoc, generate, pageUrl, renderLlmsTxt } from "../dist/generate.js";
import { scanDocs } from "../dist/scan.js";
import { validateLlmsTxt } from "../dist/validate.js";
import { makeTree, testConfig } from "./helpers.mjs";

const cleanups = [];
after(() => cleanups.forEach((fn) => fn()));

function scannedTree(files, config) {
  const t = makeTree(files);
  cleanups.push(t.cleanup);
  return scanDocs(t.root, config);
}

const SITE = {
  "index.md": "# Brewsite\n\nThe site summary paragraph.\n",
  "getting-started/install.md": "# Install\n\nHow to install.\n",
  "guides/tips.md": "# Tips\n\nUseful tips.\n",
  "reference/glossary.md": "---\noptional: true\n---\n# Glossary\n\nTerms.\n",
};

test("buildDoc takes title and summary from the root index page", () => {
  const config = testConfig();
  const doc = buildDoc(scannedTree(SITE, config), config);
  assert.equal(doc.title, "Brewsite");
  assert.equal(doc.summary, "The site summary paragraph.");
});

test("config name/summary override the root index page", () => {
  const config = testConfig({ name: "Renamed", summary: "Configured summary." });
  const doc = buildDoc(scannedTree(SITE, config), config);
  assert.equal(doc.title, "Renamed");
  assert.equal(doc.summary, "Configured summary.");
});

test("the root index page never appears as a link", () => {
  const config = testConfig();
  const doc = buildDoc(scannedTree(SITE, config), config);
  const urls = doc.sections.flatMap((s) => s.links.map((l) => l.url));
  assert.ok(!urls.some((u) => u.endsWith("/index.md") && u.includes("docs/index")));
  assert.ok(urls.every((u) => !u.endsWith("https://example.test/docs/index.md")));
});

test("sections default to humanized top-level directory names", () => {
  const config = testConfig();
  const doc = buildDoc(scannedTree(SITE, config), config);
  const names = doc.sections.map((s) => s.name);
  assert.ok(names.includes("Getting started"));
  assert.ok(names.includes("Guides"));
});

test("sectionOrder pins sections first and Optional is always last", () => {
  const config = testConfig({ sectionOrder: ["Guides", "Getting started"] });
  const doc = buildDoc(scannedTree(SITE, config), config);
  assert.deepEqual(
    doc.sections.map((s) => s.name),
    ["Guides", "Getting started", "Optional"]
  );
});

test("root-level pages land in the configured rootSection", () => {
  const config = testConfig({ rootSection: "Top pages" });
  const doc = buildDoc(
    scannedTree({ "index.md": "# S\n\nx.\n", "about.md": "# About\n\ny.\n" }, config),
    config
  );
  assert.deepEqual(doc.sections.map((s) => s.name), ["Top pages"]);
  assert.equal(doc.sections[0].links[0].title, "About");
});

test("pageUrl keeps .md by default, strips it for clean, maps html", () => {
  assert.equal(
    pageUrl("guides/tips.md", testConfig()),
    "https://example.test/docs/guides/tips.md"
  );
  assert.equal(
    pageUrl("guides/tips.md", testConfig({ urlStyle: "clean" })),
    "https://example.test/docs/guides/tips"
  );
  assert.equal(
    pageUrl("api/index.md", testConfig({ urlStyle: "clean" })),
    "https://example.test/docs/api/"
  );
  assert.equal(
    pageUrl("guides/tips.md", testConfig({ urlStyle: "html" })),
    "https://example.test/docs/guides/tips.html"
  );
});

test("pageUrl with an empty baseUrl produces root-relative paths and encodes segments", () => {
  assert.equal(pageUrl("a b/c.md", testConfig({ baseUrl: "" })), "/a%20b/c.md");
});

test("renderLlmsTxt emits H1, blockquote, H2 sections and described links", () => {
  const text = renderLlmsTxt({
    title: "T",
    summary: "S",
    intro: [],
    sections: [
      { name: "Docs", links: [{ title: "A", url: "/a.md", description: "About A" }] },
    ],
  });
  assert.equal(text, "# T\n\n> S\n\n## Docs\n\n- [A](/a.md): About A\n");
});

test("generated llms.txt always passes the bundled validator", () => {
  // The generator and the linter must agree on what a spec-shaped file is.
  const config = testConfig();
  const { llmsTxt } = generate(scannedTree(SITE, config), config);
  const result = validateLlmsTxt(llmsTxt);
  assert.deepEqual(result.diagnostics, []);
});

test("llms-full.txt inlines page bodies with Source lines and strips duplicate H1s", () => {
  const config = testConfig();
  const { llmsFull } = generate(scannedTree(SITE, config), config);
  assert.ok(llmsFull.startsWith("# Brewsite\n\n> The site summary paragraph.\n"));
  assert.ok(llmsFull.includes("Source: https://example.test/docs/guides/tips.md"));
  assert.ok(llmsFull.includes("Useful tips."));
  // The body's own "# Tips" is replaced by the canonical page title header.
  assert.equal(llmsFull.match(/^# Tips$/gm).length, 1);
});

test("generate is deterministic and reports accurate counts", () => {
  const config = testConfig();
  const pages = scannedTree(SITE, config);
  const a = generate(pages, config);
  const b = generate(pages, config);
  assert.equal(a.llmsTxt, b.llmsTxt);
  assert.equal(a.llmsFull, b.llmsFull);
  assert.equal(a.sectionCount, 3);
  assert.equal(a.linkCount, 3);
  assert.equal(a.pageCount, 3);
  assert.ok(a.fullWordCount > 10);
});
