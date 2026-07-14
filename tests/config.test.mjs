// Tests for config loading and layered resolution. The loader is strict:
// unknown keys and wrong types must fail loudly, because a typo in a
// generator config would otherwise produce a wrong llms.txt silently.
import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ConfigError,
  DEFAULT_CONFIG,
  loadConfigFile,
  resolveConfig,
} from "../dist/config.js";
import { makeTree } from "./helpers.mjs";

const cleanups = [];
after(() => cleanups.forEach((fn) => fn()));

function dirWith(configObject) {
  const t = makeTree({});
  cleanups.push(t.cleanup);
  if (configObject !== undefined) {
    writeFileSync(join(t.root, "llmstxt.config.json"), JSON.stringify(configObject));
  }
  return t.root;
}

test("defaults are applied when no config file exists", () => {
  const config = resolveConfig(dirWith(undefined), undefined, {});
  assert.deepEqual(config, DEFAULT_CONFIG);
});

test("llmstxt.config.json in cwd is picked up implicitly", () => {
  const cwd = dirWith({ name: "FromFile", baseUrl: "https://example.test/" });
  const config = resolveConfig(cwd, undefined, {});
  assert.equal(config.name, "FromFile");
  assert.equal(config.baseUrl, "https://example.test/");
  assert.equal(config.docsDir, "docs"); // untouched default
});

test("CLI overrides beat the config file; undefined overrides are ignored", () => {
  const cwd = dirWith({ name: "FromFile" });
  const config = resolveConfig(cwd, undefined, { name: "FromFlag", baseUrl: undefined });
  assert.equal(config.name, "FromFlag");
  assert.equal(config.baseUrl, "");
});

test("an explicit --config path that does not exist is a hard error", () => {
  assert.throws(
    () => resolveConfig(dirWith(undefined), "/nonexistent/llmstxt.config.json", {}),
    ConfigError
  );
});

test("unknown config keys are rejected with the allowed-key list", () => {
  const cwd = dirWith({ nmae: "typo" });
  assert.throws(
    () => resolveConfig(cwd, undefined, {}),
    (err) => err instanceof ConfigError && err.message.includes('unknown config key "nmae"'),
  );
});

test("type errors name the offending key; urlStyle only accepts md/clean/html", () => {
  assert.throws(
    () => resolveConfig(dirWith({ sectionOrder: "not-an-array" }), undefined, {}),
    (err) => err instanceof ConfigError && err.message.includes("sectionOrder"),
  );
  assert.throws(() => resolveConfig(dirWith({ urlStyle: "pretty" }), undefined, {}), ConfigError);
});

test("loadConfigFile rejects non-object JSON and malformed JSON", () => {
  const t = makeTree({ "arr.json": "[1,2]", "bad.json": "{ not json" });
  cleanups.push(t.cleanup);
  assert.throws(() => loadConfigFile(join(t.root, "arr.json")), ConfigError);
  assert.throws(() => loadConfigFile(join(t.root, "bad.json")), ConfigError);
});
