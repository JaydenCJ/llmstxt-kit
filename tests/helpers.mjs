// Shared test helpers: deterministic temp docs trees with automatic cleanup.
// No network, no clocks — every fixture is written to a fresh mkdtemp dir.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Write a docs tree from a { "rel/path.md": "content" } map into a fresh
 * temp directory. Returns { root, cleanup } — call cleanup() in an
 * after() hook.
 */
export function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), "llmstxt-kit-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Minimal valid config object for direct calls into scan/generate. */
export function testConfig(overrides = {}) {
  return {
    baseUrl: "https://example.test/docs/",
    docsDir: "docs",
    urlStyle: "md",
    rootSection: "Documentation",
    sections: {},
    sectionOrder: [],
    optional: [],
    exclude: [],
    maxDescriptionLength: 160,
    ...overrides,
  };
}
