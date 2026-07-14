// End-to-end CLI tests against the compiled dist/cli.js: subcommands,
// exit codes, JSON output and error paths. Each run gets a fresh temp
// working directory; nothing touches the repository tree or the network.
import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { makeTree } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const PKG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")
);

const cleanups = [];
after(() => cleanups.forEach((fn) => fn()));

function siteDir() {
  const t = makeTree({
    "docs/index.md": "# Demo Site\n\nA demo site for CLI tests.\n",
    "docs/guides/a.md": "# Guide A\n\nFirst guide.\n",
    "docs/guides/b.md": "# Guide B\n\nSecond guide.\n",
  });
  cleanups.push(t.cleanup);
  writeFileSync(
    join(t.root, "llmstxt.config.json"),
    JSON.stringify({ baseUrl: "https://example.test/" })
  );
  return t.root;
}

function run(args, cwd) {
  const result = spawnSync("node", [CLI, ...args], { cwd, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("--version prints exactly the package.json version", () => {
  const { code, stdout } = run(["--version"]);
  assert.equal(code, 0);
  assert.equal(stdout, `${PKG.version}\n`);
});

test("--help documents every subcommand; bare invocation exits 2", () => {
  const { code, stdout } = run(["--help"]);
  assert.equal(code, 0);
  for (const word of ["generate", "validate", "diff", "Exit codes"]) {
    assert.ok(stdout.includes(word), `help missing "${word}"`);
  }
  // No arguments prints usage but exits 2: a script mistake, not a request.
  const bare = run([]);
  assert.equal(bare.code, 2);
  assert.ok(bare.stdout.includes("Usage:"));
});

test("unknown commands and unknown flags exit 2 with a pointer to --help", () => {
  const bad = run(["frobnicate"]);
  assert.equal(bad.code, 2);
  assert.ok(bad.stderr.includes("unknown command"));
  const flag = run(["validate", "x.txt", "--bogus"]);
  assert.equal(flag.code, 2);
  assert.ok(flag.stderr.includes("unknown flag --bogus"));
});

test("generate writes both outputs, reports counts, and is idempotent", () => {
  const cwd = siteDir();
  const { code, stdout } = run(["generate", "--full"], cwd);
  assert.equal(code, 0);
  assert.ok(stdout.includes("2 links"));
  const llms = readFileSync(join(cwd, "llms.txt"), "utf8");
  assert.ok(llms.startsWith("# Demo Site\n"));
  assert.ok(llms.includes("- [Guide A](https://example.test/guides/a.md)"));
  assert.ok(existsSync(join(cwd, "llms-full.txt")));
  // Re-running in a fresh process must reproduce the same bytes.
  run(["generate", "--full"], cwd);
  assert.equal(readFileSync(join(cwd, "llms.txt"), "utf8"), llms);
});

test("generate --stdout prints the document and writes nothing", () => {
  const cwd = siteDir();
  const { code, stdout } = run(["generate", "--stdout"], cwd);
  assert.equal(code, 0);
  assert.ok(stdout.startsWith("# Demo Site\n"));
  assert.ok(!existsSync(join(cwd, "llms.txt")));
});

test("generate against a missing docs directory exits 2", () => {
  const cwd = siteDir();
  const { code, stderr } = run(["generate", "no-such-dir"], cwd);
  assert.equal(code, 2);
  assert.ok(stderr.includes("docs directory not found"));
});

test("validate: clean file exits 0, errors exit 1, --strict fails warnings", () => {
  const cwd = siteDir();
  run(["generate"], cwd);
  assert.equal(run(["validate", "llms.txt"], cwd).code, 0);

  writeFileSync(join(cwd, "warn.txt"), "# T\n\n## S\n\n- [a](/a.md)\n");
  assert.equal(run(["validate", "warn.txt"], cwd).code, 0);
  assert.equal(run(["validate", "warn.txt", "--strict"], cwd).code, 1);

  writeFileSync(join(cwd, "err.txt"), "## No title\n\n- broken\n");
  const bad = run(["validate", "err.txt"], cwd);
  assert.equal(bad.code, 1);
  assert.ok(bad.stdout.includes("E101"));
});

test("validate pluralizes its verdict counts correctly", () => {
  const cwd = siteDir();
  // Exactly one error (E101) and one warning (W209): must read "1 error, 1 warning".
  writeFileSync(join(cwd, "one.txt"), "## Section\n\n- [a](/a.md)");
  const one = run(["validate", "one.txt"], cwd);
  assert.ok(one.stdout.includes("FAIL (1 error, 1 warning)"), one.stdout);
  run(["generate"], cwd);
  assert.ok(run(["validate", "llms.txt"], cwd).stdout.includes("OK (0 errors, 0 warnings)"));
});

test("validate --format json emits machine-readable diagnostics", () => {
  const cwd = siteDir();
  writeFileSync(join(cwd, "err.txt"), "## No title\n");
  const { code, stdout } = run(["validate", "err.txt", "--format", "json"], cwd);
  assert.equal(code, 1);
  const [report] = JSON.parse(stdout);
  assert.equal(report.file, "err.txt");
  assert.equal(report.ok, false);
  assert.ok(report.diagnostics.some((d) => d.rule === "E101"));
});

test("validate a missing file exits 2, distinct from lint failure", () => {
  const cwd = siteDir();
  const { code, stderr } = run(["validate", "missing.txt"], cwd);
  assert.equal(code, 2);
  assert.ok(stderr.includes("file not found"));
});

test("diff exits 0 for identical files and 1 with a change report otherwise", () => {
  const cwd = siteDir();
  run(["generate"], cwd);
  assert.equal(run(["diff", "llms.txt", "llms.txt"], cwd).code, 0);

  const edited = readFileSync(join(cwd, "llms.txt"), "utf8").replace("Guide A", "Guide One");
  writeFileSync(join(cwd, "new.txt"), edited);
  const { code, stdout } = run(["diff", "llms.txt", "new.txt"], cwd);
  assert.equal(code, 1);
  assert.ok(stdout.includes("title changed"));

  // --format json exposes the structured change model.
  writeFileSync(join(cwd, "empty-ish.txt"), "# Demo Site\n");
  const json = run(["diff", "llms.txt", "empty-ish.txt", "--format", "json"], cwd);
  assert.equal(json.code, 1);
  const diff = JSON.parse(json.stdout);
  assert.equal(diff.identical, false);
  assert.ok(diff.sectionsRemoved.includes("Guides"));
});
