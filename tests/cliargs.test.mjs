// Tests for the dependency-free argument parser: value styles, boolean
// flags, positionals, and error collection (never throwing).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { boolFlag, parseArgs, stringFlag } from "../dist/cliargs.js";

const SPEC = [
  { name: "out", type: "string" },
  { name: "full", type: "boolean" },
];

test("parses --flag value and --flag=value identically", () => {
  const a = parseArgs(["--out", "x.txt"], SPEC);
  const b = parseArgs(["--out=x.txt"], SPEC);
  assert.equal(stringFlag(a, "out"), "x.txt");
  assert.equal(stringFlag(b, "out"), "x.txt");
  assert.deepEqual(a.errors, []);
});

test("boolean flags take no value and default to false", () => {
  const args = parseArgs(["--full"], SPEC);
  assert.equal(boolFlag(args, "full"), true);
  assert.equal(boolFlag(parseArgs([], SPEC), "full"), false);
});

test("positionals are collected in order, interleaved with flags", () => {
  const args = parseArgs(["docs", "--full", "extra"], SPEC);
  assert.deepEqual(args.positionals, ["docs", "extra"]);
});

test("unknown flags become errors instead of exceptions", () => {
  const args = parseArgs(["--nope", "--out", "x"], SPEC);
  assert.deepEqual(args.errors, ["unknown flag --nope"]);
  assert.equal(stringFlag(args, "out"), "x"); // parsing continues
});

test("a string flag with no value reports an error (end of argv or next flag)", () => {
  assert.deepEqual(parseArgs(["--out"], SPEC).errors, ["flag --out requires a value"]);
  // `--out --full` almost always means the user forgot the value.
  const args = parseArgs(["--out", "--full"], SPEC);
  assert.deepEqual(args.errors, ["flag --out requires a value"]);
  assert.equal(boolFlag(args, "full"), true);
});

test("boolean flags reject =value syntax", () => {
  const args = parseArgs(["--full=yes"], SPEC);
  assert.deepEqual(args.errors, ["flag --full does not take a value"]);
});
